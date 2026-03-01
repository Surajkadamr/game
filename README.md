# ♠ KADAM POKER

> Premium No-Limit Texas Hold'em — Production-Ready Multiplayer Poker Room

## Architecture

```
kadam-poker/                    ← Turborepo monorepo root
├── apps/
│   ├── web/                    ← Next.js 14 (App Router) — Frontend
│   └── socket-server/          ← Node.js + Socket.IO — Game Backend
├── packages/
│   └── shared/                 ← Shared TypeScript types
├── docker-compose.yml          ← Local dev (PostgreSQL + Redis + apps)
└── cloudbuild.yaml             ← GCP Cloud Run deployment
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, Tailwind CSS, Framer Motion, GSAP |
| Animations | Framer Motion (UI), canvas-confetti (winners) |
| 3D/Particles | Canvas 2D particle system |
| Sound | Howler.js |
| State | Zustand |
| Real-time | Socket.IO 4 |
| Game State | Redis (ioredis) |
| Database | PostgreSQL + Prisma |
| Auth | JWT (admin) |
| Deployment | GCP Cloud Run + Cloud SQL + Cloud Memorystore |

## Game Features

- **No-Limit Texas Hold'em** — Full rules implementation
- **6 seats** maximum per table
- **Side pots** — Multiple all-in handling
- **Hand evaluation** — All 10 hand ranks with correct tie-breaking
- **15-second timer** — Auto-fold/check on timeout
- **Burn cards** — Before flop, turn, river
- **Crypto shuffling** — `crypto.randomInt()` Fisher-Yates
- **INR currency** — ₹5/₹10 default blinds

## Quick Start

### Prerequisites
- Node.js 20+
- Docker + Docker Compose

### 1. Clone & Install

```bash
cd kadam-poker
npm install
```

### 2. Build Shared Package

```bash
cd packages/shared && npm run build && cd ../..
```

### 3. Local Development

```bash
# Start PostgreSQL + Redis
docker-compose up postgres redis -d

# Copy env files
cp apps/socket-server/.env.example apps/socket-server/.env
cp apps/web/.env.example apps/web/.env

# Run database migrations
cd apps/socket-server
npx prisma migrate dev --name init
cd ../..

# Start everything
npm run dev
```

- **Frontend:** http://localhost:3000
- **Socket Server:** http://localhost:3001
- **Health Check:** http://localhost:3001/health

### 4. Full Docker Compose

```bash
docker-compose up --build
```

## GCP Deployment

### Prerequisites
- GCP project with Cloud Run, Cloud SQL, Cloud Memorystore enabled
- `gcloud` CLI authenticated

### 1. Create Secrets

```bash
gcloud secrets create kadam-db-url --data-file=- <<< "postgresql://user:pass@/kadam?host=/cloudsql/PROJECT:REGION:INSTANCE"
gcloud secrets create kadam-redis-url --data-file=- <<< "redis://10.x.x.x:6379"
gcloud secrets create kadam-jwt-secret --data-file=- <<< "$(openssl rand -hex 32)"
```

### 2. Deploy via Cloud Build

```bash
gcloud builds submit --config cloudbuild.yaml
```

## Environment Variables

### Socket Server (`apps/socket-server/.env`)

```env
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://kadam:secret@localhost:5432/kadam_poker
REDIS_URL=redis://localhost:6379
JWT_SECRET=change-this-in-production
CORS_ORIGIN=http://localhost:3000
```

### Web (`apps/web/.env`)

```env
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Sound Files

Place sound files in `apps/web/public/sounds/`:

| File | Description |
|------|-------------|
| `deal.mp3` | Card shuffle sound |
| `chip.mp3` | Chip clink |
| `check.mp3` | Tap sound |
| `fold.mp3` | Whoosh |
| `win.mp3` | Win chime |
| `allin.mp3` | Bass hit |
| `timer.mp3` | Warning tick |
| `raise.mp3` | Chip stack sound |

Free poker sounds available at [freesound.org](https://freesound.org).

## Socket.IO Event Reference

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `table:create` | `{name, maxPlayers, smallBlind, bigBlind, isPrivate}` | Create table |
| `table:join` | `{tableId, playerName, buyIn}` | Join table |
| `table:leave` | — | Leave table |
| `game:action` | `{action, amount?}` | Fold/Check/Call/Raise/All-in |
| `lobby:list` | — | Request table list |
| `game:sync` | `tableId` | Reconnect & sync state |
| `ping` | `timestamp` | Latency check |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `game:state` | `GameState` | Full state broadcast |
| `game:hole_cards` | `{cards}` | Private hole cards |
| `game:your_turn` | `{timeoutAt, callAmount, minRaise, maxRaise, canCheck}` | Turn notification |
| `game:action_taken` | `{playerId, action, newGameState}` | Action broadcast |
| `game:community_cards` | `{cards, round}` | Board cards |
| `game:winners` | `{winners, showCards}` | Hand result |
| `game:timer` | `{playerId, timeRemainingMs, totalMs}` | Timer tick |
| `player:joined` | `{playerId, playerName, seatIndex, chips}` | Player joined |
| `player:left` | `{playerId, reason}` | Player left |
| `table:join_result` | `{success, playerId?, gameState?}` | Join confirmation |
| `lobby:tables` | `TableSummary[]` | Table list |

## Hand Rankings

1. Royal Flush — A K Q J 10 same suit
2. Straight Flush — 5 consecutive same suit
3. Four of a Kind
4. Full House
5. Flush
6. Straight (A-2-3-4-5 wheel supported)
7. Three of a Kind
8. Two Pair
9. One Pair
10. High Card

## License

MIT — Built with ♠ by Kadam
