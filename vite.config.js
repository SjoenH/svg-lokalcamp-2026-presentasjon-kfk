import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: true, // eksponér til nettverket slik at mobil kan koble til
  },
});
