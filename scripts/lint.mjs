import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
const files = ['src','public','tests','scripts'].flatMap((dir) => readdirSync(dir).filter((name) => /\.(mjs|js)$/.test(name)).map((name) => join(dir,name)));
let failures = 0;
for (const file of files) {
  try { execFileSync(process.execPath, ['--check', file], {stdio:'pipe'}); }
  catch (error) { console.error(`${file}: ${error.stderr}`); failures++; }
  const text = readFileSync(file,'utf8');
  if (/\beval\s*\(|new\s+Function\s*\(/.test(text)) { console.error(`${file}: dynamic code evaluation forbidden`); failures++; }
  if (text.includes('\t')) { console.error(`${file}: use spaces for indentation`); failures++; }
}
if (failures) process.exit(1);
console.log(`Syntax/security lint passed for ${files.length} JavaScript files. This is a project-specific check, not ESLint.`);
