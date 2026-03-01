FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY package*.json ./
COPY apps/socket-server/package*.json ./apps/socket-server/
COPY packages/shared/package*.json ./packages/shared/
RUN npm ci

# Build shared package
FROM base AS shared-builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY packages/shared ./packages/shared
RUN cd packages/shared && npm run build

# Build socket server
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=shared-builder /app/packages/shared ./packages/shared
COPY apps/socket-server ./apps/socket-server
WORKDIR /app/apps/socket-server
RUN npx prisma generate
RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser

COPY --from=builder /app/apps/socket-server/dist ./dist
COPY --from=builder /app/apps/socket-server/node_modules ./node_modules
COPY --from=builder /app/apps/socket-server/prisma ./prisma
COPY --from=builder /app/packages/shared/dist ./node_modules/@kadam/shared/dist

USER appuser
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "dist/index.js"]
