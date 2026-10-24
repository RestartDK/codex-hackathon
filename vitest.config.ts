import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    include: ["server/game/**/*.test.ts"],
    pool: "forks",
    maxWorkers: 1,
    fileParallelism: false,
  },
});
