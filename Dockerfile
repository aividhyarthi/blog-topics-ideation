FROM node:20-alpine AS builder
WORKDIR /app
# better-sqlite3 compiles a native addon from source at install time.
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine
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
