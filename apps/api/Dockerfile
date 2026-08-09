# syntax=docker/dockerfile:1

# ===== DevMate AI API (NestJS) — multi-stage build for Render =====
# Builds the npm-workspace monorepo, swaps the Prisma schema to Postgres,
# and runs `prisma db push` + the server on boot.

# ---- deps: install all workspace dependencies ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/ai/package.json packages/ai/package.json
RUN npm ci

# ---- builder: compile packages + API, generate Postgres Prisma client ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w @devmate/shared && npm run build -w @devmate/ai && npm run build -w @devmate/api
# Swap the local SQLite schema for the deployable Postgres variant, then
# generate the client so the bundled engine targets Postgres.
RUN cp apps/api/prisma/schema.postgres.prisma apps/api/prisma/schema.prisma \
  && cd apps/api && npx prisma generate

# ---- runner: minimal runtime image ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Prisma query engine needs openssl on alpine.
RUN apk add --no-cache openssl
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/api ./apps/api
WORKDIR /app/apps/api
EXPOSE 4000
# Push schema on every boot (idempotent) then start. DATABASE_URL is provided
# by Render. `--skip-generate` avoids regenerating the client at runtime.
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/main.js"]
