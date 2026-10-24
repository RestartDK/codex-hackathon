import { cp, mkdir, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = join(root, 'node_modules', 'stockfish');
const output = join(root, 'public', 'stockfish');
const required = ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm'];

async function find(directory, target) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      const match = await find(path, target);
      if (match) return match;
    } else if (entry.name === target) return path;
  }
  return null;
}

await mkdir(output, { recursive: true });
for (const filename of required) {
  const source = await find(packageRoot, filename);
  if (!source) throw new Error(`Missing ${filename} in the stockfish package.`);
  await cp(source, join(output, filename));
}
