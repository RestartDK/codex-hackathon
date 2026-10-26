import { cpSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";

const build = spawnSync("bun", ["run", "build"], {
  cwd: process.cwd(),
  env: { ...process.env, NITRO_PRESET: "cloudflare-module" },
  stdio: "inherit",
});

if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
cpSync(".output/public", "dist/public", { recursive: true });
cpSync(".output/server", "dist/server", { recursive: true });
renameSync("dist/server/index.mjs", "dist/server/index.js");
