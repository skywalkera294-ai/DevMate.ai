# syntax=docker/dockerfile:1

# ===== DevMate AI — combined API + Web image =====
# Runs BOTH processes in one container so the single free Koyeb instance can
# host the whole app:
#   - NestJS API   on 127.0.0.1:4000 (internal only)
#   - Next.js web  on PORT=8000 (public) — proxies /api to the internal API
#     via the same-origin rewrite in next.config.mjs.
#
# Koyeb service config: Builder = Dockerfile, Instance = Free, Port = 8000.

# ---- deps: install all workspace dependencies ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/ai/package.json packages/ai/package.json
RUN npm ci

# ---- builder: compile packages, API and web; generate Postgres Prisma client ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w @devmate/shared && npm run build -w @devmate/ai && npm run build -w @devmate/api && npm run build -w @devmate/web
# Swap the local SQLite schema for the deployable Postgres variant, then
# generate the client so the bundled engine targets Postgres.
RUN cp apps/api/prisma/schema.postgres.prisma apps/api/prisma/schema.prisma \
  && cd apps/api && npx prisma generate

# ---- runner: minimal runtime image ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Prisma query engine needs openssl on alpine.
RUN apk add --no-cache openssl
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/api ./apps/api
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
EXPOSE 8000
ENV PORT=8000
ENV HOSTNAME=0.0.0.0
# Push the schema (idempotent) against DATABASE_URL, start the API in the
# background, then serve the web app on the public port.
CMD ["sh", "-c", "cd apps/api && npx prisma db push --skip-generate && (node dist/main.js &) && cd /app && node apps/web/server.js"]
