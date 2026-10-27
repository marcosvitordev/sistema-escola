import { loadEnvFile } from 'node:process';
import { spawnSync } from 'node:child_process';
loadEnvFile('.env');
const url = new URL(process.env.DATABASE_URL);
url.searchParams.set('schema', 'escola_test');
const env = { ...process.env, DATABASE_URL: url.toString(), NODE_OPTIONS: '--max-old-space-size=512 --max-semi-space-size=4', NEXT_LOW_DISK: '1' };
for (const [file, args] of [ ['node_modules/prisma/build/index.js', ['migrate', 'deploy']], ['node_modules/@playwright/test/cli.js', ['test', ...process.argv.slice(2)]] ]) {
  const result = spawnSync(process.execPath, [file, ...args], { stdio: 'inherit', env });
  if (result.status !== 0) process.exit(result.status || 1);
}
