import { FastifyInstance } from 'fastify';
import { promises as fs } from 'fs';
import path from 'path';
import { FileInfo, FileContent, SearchResponse } from '@singularity/shared';

// Get base path (use APP_DIR env or default)
function getBasePath(): string {
  return process.env.APP_DIR || '/app';
}

function getAgentDir(): string {
  return path.join(getBasePath(), 'agent');
}

// Vector service URL (from environment or default)
function getVectorServiceUrl(): string {
  return process.env.VECTOR_SERVICE_URL || 'http://vector:5000';
}

export async function registerFilesRoutes(fastify: FastifyInstance) {
  // List workspace files
  fastify.get<{
    Reply: { files: FileInfo[] };
  }>('/api/files', async () => {
    const agentDir = getAgentDir();
    const files: FileInfo[] = [];

    // List all .md files in root agent directory
    try {
      const rootFiles = await fs.readdir(agentDir);
      for (const fileName of rootFiles) {
        if (fileName.endsWith('.md')) {
          const filePath = path.join(agentDir, fileName);
          const stat = await fs.stat(filePath);
          files.push({
            path: fileName,
            name: fileName,
            type: 'file',
            size: stat.size,
            modified: stat.mtime.toISOString(),
          });
        }
      }
    } catch {
      // Root dir read error
    }

    // List memory files
    const memoryDir = path.join(agentDir, 'memory');
    try {
      const memoryFiles = await fs.readdir(memoryDir);
      for (const fileName of memoryFiles) {
        if (fileName.endsWith('.md')) {
          const filePath = path.join(memoryDir, fileName);
          const stat = await fs.stat(filePath);
          files.push({
            path: `memory/${fileName}`,
            name: fileName,
            type: 'file',
            size: stat.size,
            modified: stat.mtime.toISOString(),
          });
        }
      }
    } catch {
      // Memory dir doesn't exist
    }

    // Sort by modified date, newest first
    files.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());

    return { files };
  });

  // Vector search across files (must be before wildcard routes)
  fastify.get<{
    Querystring: { q: string; limit?: string };
    Reply: SearchResponse;
  }>('/api/files/search', async (request, reply) => {
    const { q: query, limit = '10' } = request.query;

    if (!query || !query.trim()) {
      reply.code(400).send({ results: [], query: '' });
      return;
    }

    try {
      // Call the vector search service via HTTP
      const results = await runVectorSearch(query, parseInt(limit));
      return { results, query };
    } catch (error) {
      fastify.log.error(error, 'Search failed');
      return { results: [], query };
    }
  });

  // Read file content
  fastify.get<{
    Params: { '*': string };
    Reply: FileContent;
  }>('/api/files/*', async (request, reply) => {
    const filePath = request.params['*'];
    const agentDir = getAgentDir();

    // Security: only allow reading from agent directory
    const fullPath = path.join(agentDir, filePath);
    const normalizedPath = path.normalize(fullPath);
    if (!normalizedPath.startsWith(agentDir)) {
      reply.code(403).send({ path: filePath, content: '', modified: '' } as FileContent);
      return;
    }

    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      const stat = await fs.stat(fullPath);
      return {
        path: filePath,
        content,
        modified: stat.mtime.toISOString(),
      };
    } catch {
      reply.code(404).send({ path: filePath, content: '', modified: '' } as FileContent);
    }
  });

  // Update file content
  fastify.put<{
    Params: { '*': string };
    Body: { content: string };
    Reply: { success: boolean; path: string };
  }>('/api/files/*', async (request, reply) => {
    const filePath = request.params['*'];
    const { content } = request.body;
    const agentDir = getAgentDir();

    // Security: only allow writing to agent directory
    const fullPath = path.join(agentDir, filePath);
    const normalizedPath = path.normalize(fullPath);
    if (!normalizedPath.startsWith(agentDir)) {
      reply.code(403).send({ success: false, path: filePath });
      return;
    }

    // Don't allow writing to TASKS.md (agent-managed)
    if (filePath === 'TASKS.md') {
      reply.code(403).send({ success: false, path: filePath });
      return;
    }

    try {
      await fs.writeFile(fullPath, content, 'utf-8');
      return { success: true, path: filePath };
    } catch (error) {
      fastify.log.error(error, 'Failed to write file');
      reply.code(500).send({ success: false, path: filePath });
    }
  });
}

async function runVectorSearch(query: string, limit: number): Promise<{ file: string; content: string; score: number }[]> {
  const vectorUrl = getVectorServiceUrl();
  const url = `${vectorUrl}/search?q=${encodeURIComponent(query)}&limit=${limit}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Vector service returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as { results: { file: string; content: string; score: number }[]; query: string };
    return data.results || [];
  } catch (error) {
    // Vector service unavailable - return empty results
    // This allows the control plane to work even without the vector service
    console.error('Vector search failed:', error);
    return [];
  }
}
