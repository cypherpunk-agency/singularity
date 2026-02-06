import type { FastifyInstance } from 'fastify';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function registerExtensionRoutes(fastify: FastifyInstance) {
  let files: string[];
  try {
    files = fs.readdirSync(__dirname).filter(
      (f) => f.endsWith('.js') && f !== '_loader.js'
    );
  } catch {
    return; // extensions directory doesn't exist or can't be read
  }

  for (const file of files) {
    const name = path.basename(file, '.js');
    try {
      const mod = await import(`./${file}`);
      if (typeof mod.registerRoutes === 'function') {
        await mod.registerRoutes(fastify, `/api/ext/${name}`);
        fastify.log.info(`Extension loaded: ${name}`);
      }
    } catch (err) {
      fastify.log.warn(`Failed to load extension ${name}: ${err}`);
    }
  }
}
