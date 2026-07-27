import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  // Keep the native SQLite driver external — it ships a compiled .node addon
  // that Vite can't bundle; it's resolved from node_modules at runtime.
  vite: { ssr: { external: ['better-sqlite3'] } },
  // Bind to 0.0.0.0 (all interfaces) so Railway's healthcheck/proxy can reach
  // the server. `host: true` is baked into the standalone build; the PORT is
  // still taken from Railway's injected PORT env var at runtime.
  server: {
    host: true,
  },
});
