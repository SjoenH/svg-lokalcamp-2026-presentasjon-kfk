import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: true, // eksponér til nettverket slik at mobil kan koble til
    proxy: {
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
      },
    },
  },
  build: {
    emptyOutDir: false, // build.js populates dist/ first; don't wipe it
  },
});
