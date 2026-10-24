import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  // Unit and browser tests do not call the paid voice endpoint. Avoid starting
  // Nitro's child dev server there so the runners can exit cleanly.
  const serverPlugins = process.env.VITEST || mode === 'test' ? [] : nitro();
  return {
    plugins: [...serverPlugins, react(), tailwindcss()],
    server: {
      // Optional comma-separated exact hosts for temporary development tunnels.
      allowedHosts: (process.env.VITE_ALLOWED_HOSTS ?? '').split(',').map((host) => host.trim()).filter(Boolean),
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/__tests__/setup.ts',
      include: ['src/**/*.test.{ts,tsx}'],
    },
  };
});

