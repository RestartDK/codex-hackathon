import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = join(root, "node_modules", "stockfish");
const output = join(root, "public", "stockfish");

const required = [
  { filename: "stockfish-19-lite-single.js", minimumBytes: 10_000 },
  { filename: "stockfish-19-lite-single.wasm", minimumBytes: 1_000_000 },
  { filename: "Copying.txt", minimumBytes: 1_000 },
];

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

async function locate({ filename, minimumBytes }) {
  const source = await find(packageRoot, filename).catch(() => null);
  if (!source)
    throw new Error(
      `${filename} is missing. Run \`bun install\` so the pinned stockfish package provides it.`,
    );
  const { size } = await stat(source);
  if (size < minimumBytes)
    throw new Error(`${filename} is only ${size} bytes. Reinstall the stockfish package.`);
  return source;
}

await mkdir(output, { recursive: true });
for (const file of required) {
  const source = await locate(file);
  await copyFile(source, join(output, file.filename));
}
