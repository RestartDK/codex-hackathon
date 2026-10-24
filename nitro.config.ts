import { defineConfig } from 'nitro';

export default defineConfig({
  preset: 'vercel',
  serverDir: './server',
  compatibilityDate: '2026-10-24',
  routeRules: {
    '/api/**': { headers: { 'cache-control': 'no-store' } },
  },
});
