import { InputFile } from 'grammy';
import puppeteer from 'puppeteer';
import { marked } from 'marked';
import fs from 'fs/promises';
import path from 'path';
import { bot, authorizedChatId } from './telegram.js';

async function markdownToPdf(markdown: string): Promise<Buffer> {
  // Convert markdown to HTML
  const html = await marked(markdown);

  // Professional PDF template with print-optimized CSS
  const styledHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    /* Reset and base */
    *, *::before, *::after {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    html {
      font-size: 11pt;
    }

    body {
      font-family: 'DejaVu Sans', 'Liberation Sans', Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.6;
      color: #1a1a1a;
      margin: 0;
      padding: 0;
      text-align: left !important;
      word-spacing: normal !important;
      letter-spacing: normal !important;
      text-justify: none !important;
    }

    p, li, td, th, span, div, a, code, pre {
      text-align: left !important;
      word-spacing: normal !important;
      letter-spacing: normal !important;
    }

    /* Typography */
    p {
      margin: 0 0 0.75em 0;
      orphans: 3;
      widows: 3;
    }

    h1, h2, h3, h4, h5, h6 {
      margin: 1.5em 0 0.5em 0;
      font-weight: 600;
      line-height: 1.3;
      page-break-after: avoid;
      break-after: avoid;
    }

    h1 { font-size: 18pt; }
    h2 { font-size: 14pt; }
    h3 { font-size: 12pt; }
    h4 { font-size: 11pt; }

    h1:first-child, h2:first-child, h3:first-child, h4:first-child {
      margin-top: 0;
    }

    /* Lists */
    ul, ol {
      margin: 0.5em 0;
      padding-left: 1.5em;
    }

    li {
      margin: 0.25em 0;
    }

    li > ul, li > ol {
      margin: 0.25em 0;
    }

    /* Code */
    pre {
      background: #f6f8fa;
      padding: 0.75em 1em;
      border-radius: 4px;
      overflow-x: auto;
      margin: 0.75em 0;
      font-size: 9pt;
      line-height: 1.4;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    code {
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
      font-size: 9pt;
      background: #f6f8fa;
      padding: 0.15em 0.3em;
      border-radius: 3px;
    }

    pre code {
      background: none;
      padding: 0;
      font-size: inherit;
    }

    /* Tables */
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 0.75em 0;
      font-size: 10pt;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    th, td {
      border: 1px solid #d0d7de;
      padding: 0.5em 0.75em;
      text-align: left;
    }

    th {
      background: #f6f8fa;
      font-weight: 600;
    }

    tr:nth-child(even) {
      background: #f6f8fa;
    }

    /* Block elements */
    blockquote {
      margin: 0.75em 0;
      padding: 0.5em 1em;
      border-left: 4px solid #d0d7de;
      color: #57606a;
      background: #f6f8fa;
    }

    blockquote p:last-child {
      margin-bottom: 0;
    }

    hr {
      border: none;
      border-top: 1px solid #d0d7de;
      margin: 1.5em 0;
    }

    /* Links */
    a {
      color: #0969da;
      text-decoration: none;
    }

    /* Images */
    img {
      max-width: 100%;
      height: auto;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    /* Checkboxes (task lists) */
    input[type="checkbox"] {
      margin-right: 0.5em;
    }
  </style>
</head>
<body>${html}</body>
</html>`;

  // Launch headless browser
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(styledHtml, { waitUntil: 'networkidle2' });

    // Use screen media type to preserve all styles
    await page.emulateMediaType('screen');

    const pdfBuffer = await page.pdf({
      format: 'A4',
      margin: { top: '0.75in', right: '0.75in', bottom: '0.75in', left: '0.75in' },
      printBackground: true,
      preferCSSPageSize: false,
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
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
