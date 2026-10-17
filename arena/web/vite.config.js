import { defineConfig } from 'vite';
// the rules engine is the match server's own file, read from ../server; one copy, never two
export default defineConfig({ server: { fs: { allow: ['..'] } }, build: { target: 'esnext', chunkSizeWarningLimit: 4000 }, esbuild: { target: 'esnext' }, optimizeDeps: { esbuildOptions: { target: 'esnext' } } });
