import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export default function setup() {
  // Throwaway test DB only; path resolved from this file so it can never touch dev.db.
  const dir = path.resolve(__dirname, '../prisma');
  for (const f of ['test.db', 'test.db-journal']) fs.rmSync(path.join(dir, f), { force: true });
  execSync('npx prisma db push', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: 'file:./test.db' } });
}
