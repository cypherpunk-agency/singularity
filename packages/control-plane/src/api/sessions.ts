import { FastifyInstance } from 'fastify';
import { promises as fs } from 'fs';
import path from 'path';
import { AgentSession } from '@singularity/shared';

// Get base path (use APP_DIR env or default)
function getBasePath(): string {
  return process.env.APP_DIR || '/app';
}

function getInputDir(): string {
  return path.join(getBasePath(), 'logs', 'agent-input');
}

function getOutputDir(): string {
  return path.join(getBasePath(), 'logs', 'agent-output');
}

// Parse timestamp ID from filename
function parseTimestampId(filename: string): string | null {
  // Match pattern like "20260201-214301" from various file formats
  const match = filename.match(/(\d{8}-\d{6})/);
  return match ? match[1] : null;
}

// Convert timestamp ID to ISO 8601
function timestampIdToISO(id: string): string {
  // Format: YYYYMMDD-HHMMSS -> YYYY-MM-DDTHH:MM:SS
  const year = id.substring(0, 4);
  const month = id.substring(4, 6);
  const day = id.substring(6, 8);
  const hour = id.substring(9, 11);
  const minute = id.substring(11, 13);
  const second = id.substring(13, 15);
  return `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
}

export async function registerSessionsRoutes(fastify: FastifyInstance) {
  // List all sessions
  fastify.get<{
    Querystring: { limit?: string };
    Reply: { sessions: AgentSession[] };
  }>('/api/sessions', async (request) => {
    const limit = parseInt(request.query.limit || '50');
    const inputDir = getInputDir();
    const outputDir = getOutputDir();

    try {
      // Get all files
      const [inputFiles, outputMdFiles, outputJsonFiles] = await Promise.all([
        fs.readdir(inputDir).catch(() => []),
        fs.readdir(outputDir).then(files => files.filter(f => f.endsWith('.md'))).catch(() => []),
        fs.readdir(outputDir).then(files => files.filter(f => f.endsWith('.json'))).catch(() => []),
      ]);

      // Build a map of sessions by timestamp ID
      const sessionMap = new Map<string, AgentSession>();

      // Process input files
      for (const file of inputFiles) {
        const id = parseTimestampId(file);
        if (!id) continue;

        if (!sessionMap.has(id)) {
          sessionMap.set(id, {
            id,
            timestamp: timestampIdToISO(id),
            inputFile: path.join(inputDir, file),
            outputFile: null,
            jsonFile: null,
            metadata: {},
          });
        } else {
          sessionMap.get(id)!.inputFile = path.join(inputDir, file);
        }
      }

      // Process output markdown files
      for (const file of outputMdFiles) {
        const id = parseTimestampId(file);
        if (!id) continue;

        if (!sessionMap.has(id)) {
          sessionMap.set(id, {
            id,
            timestamp: timestampIdToISO(id),
            inputFile: null,
            outputFile: path.join(outputDir, file),
            jsonFile: null,
            metadata: {},
          });
        } else {
          sessionMap.get(id)!.outputFile = path.join(outputDir, file);
        }
      }

      // Process output JSON files and load metadata
      for (const file of outputJsonFiles) {
        const id = parseTimestampId(file);
        if (!id) continue;

        const jsonPath = path.join(outputDir, file);
        let metadata = {};

        try {
          const content = await fs.readFile(jsonPath, 'utf-8');
          metadata = JSON.parse(content);
        } catch {
          // Skip invalid JSON
        }

        if (!sessionMap.has(id)) {
          sessionMap.set(id, {
            id,
            timestamp: timestampIdToISO(id),
            inputFile: null,
            outputFile: null,
            jsonFile: jsonPath,
            metadata,
          });
        } else {
          const session = sessionMap.get(id)!;
          session.jsonFile = jsonPath;
          session.metadata = metadata;
        }
      }

      // Convert to array and sort by timestamp (newest first)
      const sessions = Array.from(sessionMap.values())
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
        .slice(0, limit);

      return { sessions };
    } catch (error) {
      fastify.log.error({ error }, 'Error listing sessions');
      return { sessions: [] };
    }
  });

  // Get specific session with full content
  fastify.get<{
    Params: { id: string };
    Reply: (AgentSession & { inputContent?: string; outputContent?: string }) | { error: string };
  }>('/api/sessions/:id', async (request, reply) => {
    const { id } = request.params;

    // Security: sanitize ID (only allow alphanumeric and dash)
    const sanitizedId = id.replace(/[^0-9\-]/g, '');
    if (!sanitizedId) {
      return reply.code(400).send({ error: 'Invalid session ID' });
    }

    const inputDir = getInputDir();
    const outputDir = getOutputDir();

    try {
      // Find files for this session
      const [inputFiles, outputMdFiles, outputJsonFiles] = await Promise.all([
        fs.readdir(inputDir).catch(() => []),
        fs.readdir(outputDir).then(files => files.filter(f => f.endsWith('.md'))).catch(() => []),
        fs.readdir(outputDir).then(files => files.filter(f => f.endsWith('.json'))).catch(() => []),
      ]);

      const inputFile = inputFiles.find(f => f.includes(sanitizedId));
      const outputMdFile = outputMdFiles.find(f => f.includes(sanitizedId));
      const outputJsonFile = outputJsonFiles.find(f => f.includes(sanitizedId));

      if (!inputFile && !outputMdFile && !outputJsonFile) {
        return reply.code(404).send({ error: 'Session not found' });
      }

      // Load content
      const [inputContent, outputContent, metadata] = await Promise.all([
        inputFile ? fs.readFile(path.join(inputDir, inputFile), 'utf-8').catch(() => undefined) : undefined,
        outputMdFile ? fs.readFile(path.join(outputDir, outputMdFile), 'utf-8').catch(() => undefined) : undefined,
        outputJsonFile ? fs.readFile(path.join(outputDir, outputJsonFile), 'utf-8').then(c => JSON.parse(c)).catch(() => ({})) : {},
      ]);

      return {
        id: sanitizedId,
        timestamp: timestampIdToISO(sanitizedId),
        inputFile: inputFile ? path.join(inputDir, inputFile) : null,
        outputFile: outputMdFile ? path.join(outputDir, outputMdFile) : null,
        jsonFile: outputJsonFile ? path.join(outputDir, outputJsonFile) : null,
        metadata,
        inputContent,
        outputContent,
      };
    } catch (error) {
      fastify.log.error({ error }, 'Error getting session');
      return reply.code(500).send({ error: 'Failed to load session' });
    }
  });
}
