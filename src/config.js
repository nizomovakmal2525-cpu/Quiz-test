import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const srcDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(srcDir, '..');

export const config = {
  rootDir,
  port: Number(process.env.PORT || 3000),
  databaseUrl: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5433/quiz_test_ai',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-change-me',
  authCookie: 'quiz_test_auth',
  uploadDir: path.join(rootDir, 'uploads'),
  maxUploadBytes: 10 * 1024 * 1024,
  ai: {
    apiKey: process.env.AI_API_KEY || '',
    baseUrl: (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
    model: process.env.AI_MODEL || 'gpt-4o-mini',
    maxTokens: Number(process.env.AI_MAX_TOKENS || 12000)
  },
  admin: {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'admin123'
  }
};
