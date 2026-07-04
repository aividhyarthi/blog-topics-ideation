# node 22+ required: AppRankr uses the built-in node:sqlite database.
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# node 22+ required: AppRankr uses the built-in node:sqlite database.
FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
# Bind to all interfaces. Do NOT hardcode PORT — Railway injects its own
# PORT at runtime and the Astro node server reads it automatically.
ENV HOST=0.0.0.0
ENV NODE_ENV=production
EXPOSE 4321
CMD ["node", "dist/server/entry.mjs"]
