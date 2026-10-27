import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
const existing = existsSync('.env') ? readFileSync('.env', 'utf8') : '';
if (/BOOTSTRAP_TOKEN="[^"\r\n]{32,}"/.test(existing)) {
  console.log('.env já configurado; preservado.');
} else {
  const template = existing || readFileSync('.env.example', 'utf8');
  const line = `BOOTSTRAP_TOKEN="${randomBytes(32).toString('hex')}"`;
  writeFileSync('.env', /BOOTSTRAP_TOKEN=.*/.test(template) ? template.replace(/BOOTSTRAP_TOKEN=.*/, line) : `${template}\n${line}\n`);
  console.log('.env local criado com segredo aleatório. Consulte o arquivo para instalar a instituição.');
}
