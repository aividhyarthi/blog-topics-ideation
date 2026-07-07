import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  // Keep the Postgres driver external — it has dynamic requires that shouldn't
  // be bundled by Vite; it's resolved from node_modules at runtime.
  vite: { ssr: { external: ['pg'] } },
  // Bind to 0.0.0.0 (all interfaces) so Railway's healthcheck/proxy can reach
  // the server. `host: true` is baked into the standalone build; the PORT is
  // still taken from Railway's injected PORT env var at runtime.
  server: {
    host: true,
  },
});
