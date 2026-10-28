import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    globalSetup: ['./tests/globalSetup.ts'],
    fileParallelism: false, // one shared SQLite file
    env: { DATABASE_URL: 'file:./test.db', JWT_SECRET: 'test-jwt', QR_SECRET: 'test-secret', APP_BASE_URL: 'http://localhost:5173' },
  },
});
