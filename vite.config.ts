import { defineConfig } from 'vite';

// Su GitHub Pages il sito vive in /<nome-repo>/ : il workflow imposta BASE_PATH.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  server: { port: Number(process.env.PORT) || 5173, strictPort: false },
});
