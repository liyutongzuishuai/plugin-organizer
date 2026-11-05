/**
 * Inject nav-config.json into client.js between the baked-config markers.
 * The browser bundle cannot read repository files at runtime, so the config
 * travels as a literal; this script keeps the literal and the JSON in sync.
 *
 * Usage: node scripts/build-config.mjs          # write
 *        node scripts/build-config.mjs --check   # verify only (exit 1 on drift)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = join(root, 'nav-config.json');
const clientPath = join(root, 'client.js');
const START = '/* BAKED-CONFIG-START */';
const END = '/* BAKED-CONFIG-END */';

const config = JSON.parse(readFileSync(configPath, 'utf8'));
const source = readFileSync(clientPath, 'utf8');
const start = source.indexOf(START);
const end = source.indexOf(END);
if (start === -1 || end === -1) throw new Error('baked-config markers are missing from client.js');

// Keep `const CONFIG =` inside the replaced range so re-running is idempotent.
const pretty = JSON.stringify(config, null, 2).split('\n');
const indented = pretty.map((line, index) => (index === 0 ? line : '    ' + line)).join('\n');
const block = 'const CONFIG = ' + indented + ';';
const next = source.slice(0, start + START.length) + '\n    ' + block + '\n    ' + source.slice(end);
const check = process.argv.includes('--check');

if (check) {
  if (next !== source) {
    console.error('client.js config is stale — run: node scripts/build-config.mjs');
    process.exit(1);
  }
  console.log('client.js config matches nav-config.json');
} else if (next === source) {
  console.log('already up to date');
} else {
  writeFileSync(clientPath, next);
  console.log('client.js config updated from nav-config.json');
}
