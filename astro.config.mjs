import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  // Bind to 0.0.0.0 (all interfaces) so Railway's healthcheck/proxy can reach
  // the server. `host: true` is baked into the standalone build; the PORT is
  // still taken from Railway's injected PORT env var at runtime.
  server: {
    host: true,
  },
});
