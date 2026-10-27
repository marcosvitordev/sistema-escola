import { defineConfig } from '@playwright/test';
import { loadEnvFile } from 'node:process';
loadEnvFile('.env');
const testUrl = new URL(process.env.DATABASE_URL!);
testUrl.searchParams.set('schema', 'escola_test');
process.env.DATABASE_URL = testUrl.toString();
const compiled = process.env.PLAYWRIGHT_USE_BUILD === '1';
export default defineConfig({
  testDir: './tests', fullyParallel: false, workers: 1, timeout: 90_000,
  use: { baseURL: 'http://localhost:3001', headless: true, screenshot: 'only-on-failure', actionTimeout: 15_000 },
  webServer: { command: compiled ? 'node node_modules/next/dist/bin/next start --port 3001' : 'npm run dev -- --port 3001', url: 'http://localhost:3001', reuseExistingServer: false, timeout: 120_000, env: { DATABASE_URL: testUrl.toString(), BOOTSTRAP_TOKEN: process.env.BOOTSTRAP_TOKEN!, NEXT_DIST_DIR: compiled ? '.next' : '.next-test' } },
});
