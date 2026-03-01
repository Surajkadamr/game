#!/usr/bin/env bash
set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ♠ KADAM POKER — Setup Script"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check prerequisites
command -v node >/dev/null 2>&1 || { echo "Node.js 20+ required"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "npm required"; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "Docker required for local databases"; exit 1; }

echo ""
echo "→ Installing dependencies..."
npm install

echo ""
echo "→ Building shared package..."
cd packages/shared && npm run build && cd ../..

echo ""
echo "→ Setting up environment files..."
[ -f apps/socket-server/.env ] || cp apps/socket-server/.env.example apps/socket-server/.env
[ -f apps/web/.env ] || cp apps/web/.env.example apps/web/.env

echo ""
echo "→ Starting PostgreSQL and Redis..."
docker-compose up postgres redis -d

echo ""
echo "→ Waiting for PostgreSQL to be ready..."
sleep 5

echo ""
echo "→ Running database migrations..."
cd apps/socket-server && npx prisma migrate dev --name init --skip-seed && cd ../..

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✓ Setup complete!"
echo ""
echo "  Run: npm run dev"
echo ""
echo "  Frontend:  http://localhost:3000"
echo "  Backend:   http://localhost:3001"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
