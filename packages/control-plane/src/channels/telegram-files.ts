import { InputFile } from 'grammy';
import { createRequire } from 'module';
import { getStreamAsBuffer } from 'get-stream';
import fs from 'fs/promises';
import path from 'path';
import { bot, authorizedChatId } from './telegram.js';

// CommonJS modules need require()
const require = createRequire(import.meta.url);
const PDFDocument = require('pdfkit');
const commonmark = require('commonmark');
const CommonmarkPDFRenderer = require('pdfkit-commonmark').default;

async function markdownToPdf(markdown: string): Promise<Buffer> {
  const reader = new commonmark.Parser();
  const parsed = reader.parse(markdown);
  const doc = new PDFDocument({ margin: 50 });
  const writer = new CommonmarkPDFRenderer();

  writer.render(doc, parsed);
  doc.end();

  return Buffer.from(await getStreamAsBuffer(doc));
}

export async function sendFileToTelegram(
  filePath: string,
  options?: { format?: 'pdf' | 'raw'; caption?: string }
): Promise<void> {
  if (!bot || !authorizedChatId) {
    throw new Error('Telegram bot not configured');
  }

  const { format = 'pdf', caption } = options || {};
  const content = await fs.readFile(filePath, 'utf-8');
  const filename = path.basename(filePath, '.md');

  let fileBuffer: Buffer;
  let finalFilename: string;

  if (format === 'pdf' && filePath.endsWith('.md')) {
    fileBuffer = await markdownToPdf(content);
    finalFilename = `${filename}.pdf`;
  } else {
    fileBuffer = Buffer.from(content);
    finalFilename = path.basename(filePath);
  }

  await bot.api.sendDocument(
    authorizedChatId,
    new InputFile(fileBuffer, finalFilename),
    { caption }
  );
}
