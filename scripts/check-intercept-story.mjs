import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const expected = new Map([
  ['src/games/intercept/content/TheIntercept.ink', '9a048652e12252761fe846be8b87132406a4b44e72132e6f73595d92b0768a59'],
  ['src/games/intercept/content/TheIntercept.json', '248c73bea5b03a8fc229e708fd747052ef404c58fea5e9be2b036dd777a8232a'],
  ['src/vendor/inkjs-runtime.js', '81f9406c6e1b3d77119aa54bf7e5bb861566f7689a85df880fe05a1bf7401d8c'],
]);

for (const [relativePath, expectedHash] of expected) {
  const content = await readFile(path.join(projectRoot, relativePath));
  const actual = createHash('sha256').update(content).digest('hex');
  if (actual !== expectedHash) throw new Error(`${relativePath} does not match the pinned upstream artifact.`);
}

const compiledText = await readFile(path.join(projectRoot, 'src/games/intercept/content/TheIntercept.json'), 'utf8');
const compiled = JSON.parse(compiledText.replace(/^\uFEFF/, ''));
if (!Number.isInteger(compiled.inkVersion) || !Array.isArray(compiled.root)) throw new Error('The Intercept compiled Ink JSON is invalid.');
console.log(`The Intercept artifacts verified (Ink format ${compiled.inkVersion}).`);
