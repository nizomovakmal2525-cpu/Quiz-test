import { initDatabase, pool } from '../db.js';

try {
  await initDatabase();
  console.log('PostgreSQL schema tayyor.');
} catch (error) {
  console.error('DB setup xatosi:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
