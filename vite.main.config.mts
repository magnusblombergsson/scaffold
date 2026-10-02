import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      // Native modules load their binary at run time; forge.config.mts ships
      // them beside the bundle.
      external: ['@parcel/watcher'],
    },
  },
});
