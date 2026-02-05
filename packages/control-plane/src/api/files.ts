import { FastifyInstance } from 'fastify';
import { promises as fs } from 'fs';
import path from 'path';
import { FileInfo, FileContent, SearchResponse } from '@singularity/shared';
import { vectorSearch } from '../services/vector-client.js';

// Get base path (use APP_DIR env or default)
function getBasePath(): string {
  return process.env.APP_DIR || '/app';
}

function getAgentDir(): string {
  return path.join(getBasePath(), 'agent');
}

// Recursively list all .md files in a directory
async function listMdFilesRecursive(dir: string, baseDir: string, files: FileInfo[]): Promise<void> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');

      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        // Recurse into subdirectories (skip hidden dirs)
        await listMdFilesRecursive(fullPath, baseDir, files);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const stat = await fs.stat(fullPath);
        files.push({
          path: relativePath,
          name: entry.name,
          type: 'file',
          size: stat.size,
          modified: stat.mtime.toISOString(),
        });
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }
}

export async function registerFilesRoutes(fastify: FastifyInstance) {
  // List workspace files
  fastify.get<{
    Reply: { files: FileInfo[] };
  }>('/api/files', async () => {
    const agentDir = getAgentDir();
    const files: FileInfo[] = [];

    // List all .md files in root agent directory (non-recursive)
    try {
      const rootEntries = await fs.readdir(agentDir, { withFileTypes: true });
      for (const entry of rootEntries) {
        if (entry.isFile() && entry.name.endsWith('.md')) {
          const filePath = path.join(agentDir, entry.name);
          const stat = await fs.stat(filePath);
          files.push({
            path: entry.name,
            name: entry.name,
            type: 'file',
            size: stat.size,
            modified: stat.mtime.toISOString(),
          });
        }
      }
    } catch {
      // Root dir read error
    }

    // Recursively list memory files
    const memoryDir = path.join(agentDir, 'memory');
    await listMdFilesRecursive(memoryDir, agentDir, files);

    // Recursively list config files
    const configDir = path.join(agentDir, 'config');
    await listMdFilesRecursive(configDir, agentDir, files);

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
      const results = await vectorSearch(query, parseInt(limit));
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

    try {
      await fs.writeFile(fullPath, content, 'utf-8');
      return { success: true, path: filePath };
    } catch (error) {
      fastify.log.error(error, 'Failed to write file');
      reply.code(500).send({ success: false, path: filePath });
    }
  });
}
