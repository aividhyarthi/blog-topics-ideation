FROM node:22-alpine AS builder
WORKDIR /app
# better-sqlite3 ships prebuilt binaries for musl (Alpine) and falls back to
# compiling from source if none match — these cover that fallback case.
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
# better-sqlite3's compiled addon dynamically links libstdc++ at runtime —
# present in the builder stage (pulled in by g++) but NOT in this slim final
# image unless installed here too. Without it the process crashes the instant
# something calls require('better-sqlite3'), before the HTTP server ever binds
# a port — which is why Railway shows "Application failed to respond" rather
# than any error page this app itself could render.
RUN apk add --no-cache libstdc++
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
# Bind to all interfaces. Do NOT hardcode PORT — Railway injects its own
# PORT at runtime and the Astro node server reads it automatically.
ENV HOST=0.0.0.0
ENV NODE_ENV=production
EXPOSE 4321
CMD ["node", "dist/server/entry.mjs"]
