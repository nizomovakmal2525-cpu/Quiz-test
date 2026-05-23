import fs from 'node:fs/promises';
import path from 'node:path';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

const textExtensions = new Set(['.txt', '.md', '.csv']);

export async function extractTextFromFile(filePath, originalName) {
  const extension = path.extname(originalName).toLowerCase();

  if (textExtensions.has(extension)) {
    return normalizeText(await fs.readFile(filePath, 'utf8'));
  }

  if (extension === '.docx') {
    const result = await mammoth.extractRawText({ path: filePath });
    return normalizeText(result.value);
  }

  if (extension === '.pdf') {
    const buffer = await fs.readFile(filePath);
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    return normalizeText(result.text);
  }

  throw new Error('Faqat .txt, .md, .csv, .docx yoki .pdf fayl yuboring.');
}

function normalizeText(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}
