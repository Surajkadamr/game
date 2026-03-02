# Kadam Poker — GCP Deployment Guide

## Architecture on GCP

```
Users (browser/phone)
       │
       ▼
┌──────────────────────────────────────────────────┐
│                  Cloud Run                        │
│                                                  │
│  kadam-web (Next.js)    kadam-socket (Socket.IO) │
│  asia-south1            asia-south1               │
│  Port 3000              Port 3001                 │
└──────────────────────────────────────────────────┘
                          │
                          ▼
               ┌─────────────────┐
               │  Memorystore    │  ← Redis (game state)
               │  Redis 7        │     (optional, for scale)
               └─────────────────┘
```

**What we deploy:**
| Service | Where | Purpose |
|---|---|---|
| `kadam-web` | Cloud Run | Next.js frontend |
| `kadam-socket-server` | Cloud Run | Socket.IO game server |
| Redis | Memorystore (optional) | Shared game state across instances |

**Cloud Run WebSocket note:** Cloud Run fully supports WebSockets. We use `--session-affinity` so each player's connection sticks to one instance. With a single instance (`--max-instances=1`) no Redis is needed — all state lives in memory.

---

## Step 0 — Prerequisites

Install these on your machine before starting.

### 1. Google Cloud SDK (gcloud)
```bash
# macOS
brew install google-cloud-sdk

# Windows (run as admin in PowerShell)
(New-Object Net.WebClient).DownloadFile("https://dl.google.com/dl/cloudsdk/channels/rapid/GoogleCloudSDKInstaller.exe", "$env:Temp\GoogleCloudSDKInstaller.exe")
& $env:Temp\GoogleCloudSDKInstaller.exe

# Linux
curl https://sdk.cloud.google.com | bash
exec -l $SHELL
```

### 2. Docker Desktop
Download from https://www.docker.com/products/docker-desktop
Verify: `docker --version`

### 3. Login
```bash
gcloud auth login
gcloud auth configure-docker asia-south1-docker.pkg.dev
```

---

## Step 1 — Create GCP Project

```bash
# Create project (replace kadam-poker-prod with your preferred ID)
gcloud projects create kadam-poker-prod --name="Kadam Poker"

# Set as default
gcloud config set project kadam-poker-prod

# Link billing account — REQUIRED before any resources
# Get your billing account ID:
gcloud billing accounts list

# Link it:
gcloud billing projects link kadam-poker-prod \
  --billing-account=XXXXXXXX-XXXXXXXX-XXXXXXXX
```

---

## Step 2 — Enable Required APIs

```bash
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  redis.googleapis.com \
  vpcaccess.googleapis.com \
  compute.googleapis.com
```

This takes ~2 minutes. Wait for it to complete.

---

## Step 3 — Create Artifact Registry Repository

Artifact Registry is where Docker images are stored.

```bash
gcloud artifacts repositories create kadam \
  --repository-format=docker \
  --location=asia-south1 \
  --description="Kadam Poker Docker images"
```

Verify:
```bash
gcloud artifacts repositories list --location=asia-south1
```

---

## Step 4 — Store Secrets in Secret Manager

Never put sensitive values in env vars directly. Use Secret Manager.

```bash
# JWT Secret (generate a strong random string)
echo -n "$(openssl rand -base64 32)" | \
  gcloud secrets create kadam-jwt-secret --data-file=-

# Confirm it was stored
gcloud secrets versions access latest --secret=kadam-jwt-secret
```

If you use Redis (Step 11), add the Redis URL secret after creating the instance.

---

## Step 5 — Set Shell Variables

Run these in every terminal session before running deployment commands.

```bash
export PROJECT_ID=kadam-poker-prod
export REGION=asia-south1
export REPO=asia-south1-docker.pkg.dev/$PROJECT_ID/kadam
```

---

## Step 6 — Build and Push Socket Server Image

Run from the **root of the repo**.

```bash
docker build \
  -t $REPO/socket-server:latest \
  -f apps/socket-server/Dockerfile \
  .

docker push $REPO/socket-server:latest
```

> **Windows tip:** If you get a push permission error, re-run:
> `gcloud auth configure-docker asia-south1-docker.pkg.dev`

---

## Step 7 — Deploy Socket Server to Cloud Run

Deploy the socket server **first** because the web app needs its URL baked into the build.

```bash
gcloud run deploy kadam-socket-server \
  --image=$REPO/socket-server:latest \
  --region=$REGION \
  --platform=managed \
  --allow-unauthenticated \
  --memory=1Gi \
  --cpu=1 \
  --min-instances=1 \
  --max-instances=1 \
  --port=3001 \
  --timeout=3600 \
  --session-affinity \
  --set-env-vars="NODE_ENV=production,CORS_ORIGIN=*" \
  --set-secrets="JWT_SECRET=kadam-jwt-secret:latest"
```

**Key flags:**
- `--min-instances=1` — keeps one instance warm; WebSocket connections die on cold start
- `--max-instances=1` — single instance means in-memory game state works correctly
- `--session-affinity` — ensures each player's WebSocket sticks to the same instance
- `--timeout=3600` — 1-hour timeout for long-running WebSocket connections
- `CORS_ORIGIN=*` — allows all origins initially; we'll lock it down after web is deployed

### Get the socket server URL
```bash
export SOCKET_URL=$(gcloud run services describe kadam-socket-server \
  --region=$REGION \
  --format="value(status.url)")

echo "Socket server URL: $SOCKET_URL"
# Example: https://kadam-socket-server-abc123-el.a.run.app
```

---

## Step 8 — Build and Push Web Image

The Next.js app bakes the socket URL into the build (`NEXT_PUBLIC_*` vars are compile-time).
This is why we deploy socket server first.

```bash
docker build \
  -t $REPO/web:latest \
  -f apps/web/Dockerfile \
  --build-arg NEXT_PUBLIC_SOCKET_URL=$SOCKET_URL \
  --build-arg NEXT_PUBLIC_APP_URL=https://kadam-web-placeholder.run.app \
  --build-arg NEXT_PUBLIC_TURN_URL= \
  --build-arg NEXT_PUBLIC_TURN_USERNAME= \
  --build-arg NEXT_PUBLIC_TURN_CREDENTIAL= \
  .

docker push $REPO/web:latest
```

> `NEXT_PUBLIC_APP_URL` is a placeholder for now. We'll update it after the web URL is known. The app doesn't rely on it for core game functionality.
> The TURN args are optional — leave empty to use the built-in public TURN relay (`openrelay.metered.ca`). Set them if you run your own Coturn server.

---

## Step 9 — Deploy Web App to Cloud Run

```bash
gcloud run deploy kadam-web \
  --image=$REPO/web:latest \
  --region=$REGION \
  --platform=managed \
  --allow-unauthenticated \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=10 \
  --port=3000 \
  --set-env-vars="NODE_ENV=production"
```

### Get the web URL
```bash
export WEB_URL=$(gcloud run services describe kadam-web \
  --region=$REGION \
  --format="value(status.url)")

echo "Web URL: $WEB_URL"
# Example: https://kadam-web-abc123-el.a.run.app
```

---

## Step 10 — Lock Down CORS

Now that both URLs are known, restrict the socket server to only accept requests from the web app:

```bash
gcloud run services update kadam-socket-server \
  --region=$REGION \
  --update-env-vars="CORS_ORIGIN=$WEB_URL"
```

---

## Step 11 — Test the Deployment

### Health checks
```bash
# Socket server health
curl $SOCKET_URL/health
# Expected: {"status":"ok","timestamp":"...","mode":"memory"}

# Web app
curl -I $WEB_URL
# Expected: HTTP/2 200
```

### Full test
1. Open `$WEB_URL` in **two different browser tabs** (or two devices)
2. Create a table in tab 1
3. Join the same table in tab 2
4. Play a hand — verify betting, all-in, and winner display work
5. Click **🎙️ Voice** in the header on both tabs — allow mic permission — you should hear each other

---

## Step 12 — (Optional) Add Redis for Multiple Instances

Skip this if you're happy with `--max-instances=1`. Add Redis when you need to scale the socket server to handle more concurrent games.

```bash
# Create VPC Connector (Redis can't be accessed from Cloud Run without it)
gcloud compute networks vpc-access connectors create kadam-connector \
  --region=$REGION \
  --network=default \
  --range=10.8.0.0/28

# Create Redis instance (~5 minutes)
gcloud redis instances create kadam-redis \
  --size=1 \
  --region=$REGION \
  --redis-version=redis_7_0 \
  --tier=basic

# Get Redis IP
export REDIS_IP=$(gcloud redis instances describe kadam-redis \
  --region=$REGION \
  --format="value(host)")

# Store Redis URL as secret
echo -n "redis://$REDIS_IP:6379" | \
  gcloud secrets create kadam-redis-url --data-file=-
```

### Re-deploy socket server with Redis + VPC
```bash
gcloud run services update kadam-socket-server \
  --region=$REGION \
  --max-instances=5 \
  --vpc-connector=kadam-connector \
  --vpc-egress=private-ranges-only \
  --update-secrets="REDIS_URL=kadam-redis-url:latest"
```

---

## Step 13 — CI/CD with Cloud Build

The repo already has `cloudbuild.yaml` configured for Artifact Registry. Connect it to GitHub for automatic deployments on every push to `main`.

### One-time IAM setup

Grant the Cloud Build service account the permissions it needs:

```bash
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
CB_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

# Deploy to Cloud Run
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${CB_SA}" \
  --role="roles/run.admin"

# Act as the runtime service account
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${CB_SA}" \
  --role="roles/iam.serviceAccountUser"

# Push images to Artifact Registry
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${CB_SA}" \
  --role="roles/artifactregistry.writer"

# Read secrets during build/deploy
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${CB_SA}" \
  --role="roles/secretmanager.secretAccessor"
```

### Connect GitHub repo
1. Go to https://console.cloud.google.com/cloud-build/triggers
2. Click **Connect Repository** → **GitHub**
3. Authorize and select your repo
4. Create a trigger:
   - **Event:** Push to branch `main`
   - **Config:** Cloud Build configuration file → `/cloudbuild.yaml`
5. Under **Substitution variables**, add:
   | Variable | Value |
   |---|---|
   | `_SOCKET_URL` | your socket server URL (from Step 7) |
   | `_APP_URL` | your web URL (from Step 9) |
   | `_TURN_URL` | *(optional)* custom TURN URLs, comma-separated |
   | `_TURN_USERNAME` | *(optional)* TURN username |
   | `_TURN_CREDENTIAL` | *(optional)* TURN credential |
6. Click **Create**

> `_SOCKET_URL` and `_APP_URL` are required. The TURN variables are optional — leave blank to use the built-in public TURN relay. After a custom domain is set up (Step 14), update `_SOCKET_URL` and `_APP_URL` in the trigger.

After each `git push` to `main`, Cloud Build will automatically:
1. Build both Docker images in parallel
2. Push to Artifact Registry
3. Deploy both services to Cloud Run

---

## Step 14 — Custom Domain (Optional)

If you have a domain (e.g., `kadam.poker`):

### Map domain to Cloud Run
```bash
# Map web app
gcloud run domain-mappings create \
  --service=kadam-web \
  --domain=kadam.poker \
  --region=$REGION

# Map socket server (subdomain)
gcloud run domain-mappings create \
  --service=kadam-socket-server \
  --domain=socket.kadam.poker \
  --region=$REGION
```

### Add DNS records
Cloud Run will display the IP/CNAME to add. In your domain registrar, add:
```
A     kadam.poker          →  [IP from above command]
A     socket.kadam.poker   →  [IP from above command]
```

### Update after domain is live
```bash
# Lock CORS to real domain
gcloud run services update kadam-socket-server \
  --region=$REGION \
  --update-env-vars="CORS_ORIGIN=https://kadam.poker"

# Rebuild web image with real URLs
docker build \
  -t $REPO/web:latest \
  -f apps/web/Dockerfile \
  --build-arg NEXT_PUBLIC_SOCKET_URL=https://socket.kadam.poker \
  --build-arg NEXT_PUBLIC_APP_URL=https://kadam.poker \
  --build-arg NEXT_PUBLIC_TURN_URL= \
  --build-arg NEXT_PUBLIC_TURN_USERNAME= \
  --build-arg NEXT_PUBLIC_TURN_CREDENTIAL= \
  .
docker push $REPO/web:latest

gcloud run deploy kadam-web \
  --image=$REPO/web:latest \
  --region=$REGION
```

Also update the Cloud Build trigger substitution variables to use the real domain URLs.

---

## Troubleshooting

### WebSocket connection fails (CORS error)
```bash
# Check current CORS setting
gcloud run services describe kadam-socket-server \
  --region=$REGION \
  --format="value(spec.template.spec.containers[0].env)"

# Fix: set CORS to exact web URL (no trailing slash)
gcloud run services update kadam-socket-server \
  --region=$REGION \
  --update-env-vars="CORS_ORIGIN=https://your-web-url.run.app"
```

### WebSocket drops on first load (cold start)
```bash
# Ensure socket server always has 1 warm instance
gcloud run services update kadam-socket-server \
  --region=$REGION \
  --min-instances=1
```

### Build fails: "Cannot find package @kadam/shared"
The Dockerfiles build the shared package first. Verify the build script exists:
```bash
cat packages/shared/package.json | grep '"build"'
# Should show: "build": "tsc"
```

### Voice chat not working (players can't hear each other)
Voice uses STUN + a free public TURN relay (`openrelay.metered.ca`) built into the client. This handles most NAT types including symmetric NAT.

**Debug steps:**
1. Open browser DevTools → Console → look for `[Voice]` log messages
2. If you see `ICE restart` messages, the TURN relay is being used — this is normal
3. If `ICE restart failed`, the public TURN server may be down — deploy your own:
```bash
# Low-cost option: Coturn on a small GCP VM (~$7/month)
gcloud compute instances create kadam-turn \
  --machine-type=e2-micro \
  --zone=asia-south1-a \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud
# Install coturn, then set _TURN_URL / _TURN_USERNAME / _TURN_CREDENTIAL
# in your Cloud Build trigger substitution variables
```

### View live logs
```bash
# Socket server logs (real-time)
gcloud logging tail "resource.type=cloud_run_revision AND resource.labels.service_name=kadam-socket-server" \
  --project=$PROJECT_ID

# Web logs
gcloud logging tail "resource.type=cloud_run_revision AND resource.labels.service_name=kadam-web" \
  --project=$PROJECT_ID
```

### Check deployed services
```bash
gcloud run services list --region=$REGION
```

### Rollback to previous revision
```bash
# List revisions
gcloud run revisions list --service=kadam-socket-server --region=$REGION

# Roll back
gcloud run services update-traffic kadam-socket-server \
  --region=$REGION \
  --to-revisions=kadam-socket-server-XXXXX=100
```

---

## Cost Estimate (Monthly)

For a private game with friends (low traffic):

| Resource | Config | Est. Cost/month |
|---|---|---|
| Cloud Run — Web | 0 min instances, 512Mi | ~$0–2 (pay per request) |
| Cloud Run — Socket | 1 min instance, 1Gi | ~$10–15 (always on) |
| Artifact Registry | ~1 GB images | ~$0.10 |
| Memorystore Redis | 1 GB Basic | ~$16 (if added) |
| **Total without Redis** | | **~$10–17/month** |
| **Total with Redis** | | **~$26–33/month** |

> **Free tier:** New GCP accounts get $300 credit. Cloud Run also has a generous free tier (2M requests/month, 360K GB-seconds).

---

## Voice Chat

Voice chat is **already implemented** using WebRTC peer-to-peer audio, with Socket.IO as the signaling relay. No extra GCP infrastructure is needed.

**How it works:**
```
Player A ──► STUN (discover public IP) + TURN relay (fallback)
Player B ──► STUN + TURN relay
         │
         └─► Socket.IO on Cloud Run (relay SDP/ICE signals)
                │
                ▼
         WebRTC direct audio between A and B (peer-to-peer)
         Falls back to TURN relay if direct P2P fails
```

**Built-in ICE servers (no config needed):**
- Google STUN servers (`stun.l.google.com`) — free, discovers public IP
- Public TURN relay (`openrelay.metered.ca`) — UDP, TCP, and TLS on port 443
- Handles same-network, cross-network, and corporate firewall scenarios out of the box

**GCP cost for voice:** $0 extra. Signaling rides on the existing socket server. Audio is peer-to-peer (or relayed through the free public TURN).

**Optional: custom TURN server** for better reliability under heavy use:
```bash
# Set via Cloud Build trigger substitution variables:
#   _TURN_URL       = turn:your-server:3478,turns:your-server:443?transport=tcp
#   _TURN_USERNAME  = your-user
#   _TURN_CREDENTIAL = your-pass
#
# Or for manual builds, pass as --build-arg to the web Dockerfile.
```

**ICE restart:** The client automatically restarts ICE when the connection drops (e.g. WiFi to 4G switch), so voice survives network changes.

---

## Quick Reference — All Commands

```bash
# Set variables (run at start of every session)
export PROJECT_ID=kadam-poker-prod
export REGION=asia-south1
export REPO=asia-south1-docker.pkg.dev/$PROJECT_ID/kadam

# Build & push socket server
docker build -t $REPO/socket-server:latest -f apps/socket-server/Dockerfile . && \
docker push $REPO/socket-server:latest

# Deploy socket server
gcloud run deploy kadam-socket-server \
  --image=$REPO/socket-server:latest \
  --region=$REGION --allow-unauthenticated \
  --memory=1Gi --min-instances=1 --max-instances=1 \
  --port=3001 --timeout=3600 --session-affinity \
  --set-env-vars="NODE_ENV=production,CORS_ORIGIN=*" \
  --set-secrets="JWT_SECRET=kadam-jwt-secret:latest"

# Get socket URL
export SOCKET_URL=$(gcloud run services describe kadam-socket-server \
  --region=$REGION --format="value(status.url)")

# Build & push web (requires SOCKET_URL from above)
docker build -t $REPO/web:latest -f apps/web/Dockerfile \
  --build-arg NEXT_PUBLIC_SOCKET_URL=$SOCKET_URL \
  --build-arg NEXT_PUBLIC_APP_URL=https://placeholder.run.app \
  --build-arg NEXT_PUBLIC_TURN_URL= \
  --build-arg NEXT_PUBLIC_TURN_USERNAME= \
  --build-arg NEXT_PUBLIC_TURN_CREDENTIAL= \
  . && docker push $REPO/web:latest

# Deploy web
gcloud run deploy kadam-web \
  --image=$REPO/web:latest \
  --region=$REGION --allow-unauthenticated \
  --memory=512Mi --min-instances=0 --max-instances=10 \
  --port=3000 --set-env-vars="NODE_ENV=production"

# Get web URL and lock down CORS
export WEB_URL=$(gcloud run services describe kadam-web \
  --region=$REGION --format="value(status.url)")
gcloud run services update kadam-socket-server \
  --region=$REGION --update-env-vars="CORS_ORIGIN=$WEB_URL"

# View URLs
gcloud run services list --region=$REGION
```
