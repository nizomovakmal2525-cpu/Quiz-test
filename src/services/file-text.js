import fs from 'node:fs/promises';
import path from 'node:path';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

const textExtensions = new Set([
  '.txt', '.md', '.csv', '.json', '.xml', '.html', '.htm', '.rtf', '.log',
  '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.c', '.cpp', '.cs', '.php',
  '.sql', '.yaml', '.yml'
]);
const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

export async function extractFileContent(filePath, originalName, mimeType = '') {
  const extension = path.extname(originalName).toLowerCase();

  if (textExtensions.has(extension)) {
    const text = normalizeText(await fs.readFile(filePath, 'utf8'));
    return { kind: 'text', text, storageText: text };
  }

  if (extension === '.docx') {
    const result = await mammoth.extractRawText({ path: filePath });
    const text = normalizeText(result.value);
    return { kind: 'text', text, storageText: text };
  }

  if (extension === '.pdf') {
    const buffer = await fs.readFile(filePath);
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    const text = normalizeText(result.text);
    return { kind: 'text', text, storageText: text };
  }

  if (isImage(extension, mimeType)) {
    const buffer = await fs.readFile(filePath);
    return {
      kind: 'image',
      mimeType: normalizeImageMimeType(extension, mimeType),
      base64: buffer.toString('base64'),
      storageText: `[image file processed by AI: ${originalName}]`
    };
  }

  if (extension === '.doc') {
    throw new Error('Fayl qabul qilindi, lekin eski .doc formatdan matn o‘qib bo‘lmaydi. Uni .docx yoki PDF qilib yuboring.');
  }

  const fallbackText = await tryReadAsText(filePath);
  if (fallbackText) {
    return { kind: 'text', text: fallbackText, storageText: fallbackText };
  }

  throw new Error('Fayl qabul qilindi, lekin ichidan o‘qiladigan matn yoki rasm topilmadi. Text/PDF/DOCX/rasm fayllar eng yaxshi ishlaydi.');
}

function normalizeText(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

async function tryReadAsText(filePath) {
  const buffer = await fs.readFile(filePath);
  const sample = buffer.subarray(0, Math.min(buffer.length, 8000));
  const zeroBytes = sample.filter((byte) => byte === 0).length;
  const text = normalizeText(buffer.toString('utf8'));
  const printable = text.replace(/[^\x09\x0A\x0D\x20-\x7E\u0400-\u04FF\u0080-\uFFFF]/g, '');
  const printableRatio = text.length ? printable.length / text.length : 0;

  if (zeroBytes > 0 || text.length < 20 || printableRatio < 0.7) {
    return '';
  }

  return text;
}

function isImage(extension, mimeType) {
  return imageExtensions.has(extension) || String(mimeType).startsWith('image/');
}

function normalizeImageMimeType(extension, mimeType) {
  if (String(mimeType).startsWith('image/')) return mimeType;
  if (extension === '.jpg') return 'image/jpeg';
  if (extension === '.png') return 'image/png';
  if (extension === '.webp') return 'image/webp';
  if (extension === '.gif') return 'image/gif';
  return 'image/jpeg';
}
