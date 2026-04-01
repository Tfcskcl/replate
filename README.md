# Re-plate — AI-Powered Kitchen Intelligence

**Hidden Flavour Pvt. Ltd.** · re-plate.in · garima@re-plate.in

---

## What this is

Re-plate is the F&B vertical of Kibsi.ai — a computer vision platform that:
- **Locks SOPs** cryptographically on a Raspberry Pi Zero 2W device
- **Trains a custom AI model** per restaurant on their locked recipes
- **Monitors live kitchen operations** via existing CCTV + DJI Action 2
- **Generates chef training plans** from error patterns automatically
- **Analyses kitchen layouts** with heatmaps and FSSAI-aligned recommendations
- **Manages partner revenue** with a 60:40 split tracked per client

---

## Project structure

```
replate/
├── apps/
│   ├── web/              Next.js 14 dashboard (Vercel)
│   └── api/              FastAPI backend (Railway)
├── packages/
│   ├── edge/             Raspberry Pi Zero 2W scripts
│   ├── vision/           AI inference pipeline
│   └── shared/           TypeScript types
├── docker/               Dockerfiles
├── docs/                 Architecture docs
└── .agents/              Antigravity skills & rules
```

---

## Quick start (local development)

### Prerequisites
- Node.js 18+
- Python 3.11+
- Docker & Docker Compose
- PostgreSQL 16 (or use Docker)

### 1. Clone and install
```bash
git clone https://github.com/hiddenflavour/replate
cd replate
npm install                          # web deps
cd apps/api && pip install -r requirements.txt
```

### 2. Configure environment
```bash
cp .env.example .env
# Fill in: CLERK keys, OpenAI key, Cloudflare R2 keys
```

### 3. Start everything
```bash
docker-compose up -d postgres redis  # start DB + Redis
cd apps/api && uvicorn main:app --reload --port 8000
cd apps/web && npm run dev
```

### 4. Run migrations
```bash
cd apps/api
alembic upgrade head
```

Dashboard: http://localhost:3000
API docs:  http://localhost:8000/docs

---

## Deployment

### Backend → Railway
```bash
railway login
railway init
railway up                            # deploys apps/api via railway.json
railway add postgresql                # provision Postgres
railway add redis                     # provision Redis
```

Set env vars in Railway dashboard (copy from .env.example).

### Frontend → Vercel
```bash
cd apps/web
vercel deploy --prod
```

Set env vars in Vercel: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`.

---

## Edge device setup (Raspberry Pi Zero 2W)

```bash
# On the RPi, run:
curl -sSL https://re-plate.in/install.sh | sudo bash

# Or manually:
sudo mkdir -p /etc/replate
sudo cp packages/edge/config.yaml.example /etc/replate/config.yaml
sudo nano /etc/replate/config.yaml    # fill in outlet_id, device_id, api_key

python3 packages/edge/main.py        # run directly first to test
sudo systemctl enable replate-edge   # then enable as service
```

### Camera connection
- **DJI Action 2 via USB-C**: plug in → appears as `/dev/video0` automatically
- **RTSP CCTV**: set `camera_source: rtsp` and `rtsp_url` in config
- **Both simultaneously**: run two instances with different configs

---

## API reference

Full docs at `/docs` (Swagger UI) when running locally.

Key endpoints:
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/sops/{id}/lock` | Cryptographically lock an SOP |
| GET  | `/api/sops/{id}/verify` | Verify SOP lock hash (tamper detection) |
| POST | `/api/compliance/ingest` | Receive compliance event from edge |
| GET  | `/api/compliance/outlet/{id}/score` | Get compliance score |
| WS   | `/ws/alerts/{outlet_id}` | Real-time alert stream |
| GET  | `/api/location/outlet/{id}/heatmap` | Kitchen zone heatmap |
| GET  | `/api/location/outlet/{id}/recommendations` | Layout findings |
| GET  | `/api/partners/{id}/performance` | Partner earnings summary |
| GET  | `/api/revenue/partner/{id}/statements` | Revenue statements |

---

## Key technical decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Backend | FastAPI + Railway | Fast, async, Python (CV code is Python) |
| Frontend | Next.js + Vercel | SSR, fast deploys, edge functions |
| Database | PostgreSQL + Alembic | Reliable, strong for time-series indexes |
| Real-time | Redis pub/sub + WebSocket | Low latency alerts to dashboard |
| Storage | Cloudflare R2 | Cheap, S3-compatible, no egress fees |
| AI vision | OpenAI GPT-4o Vision | Best accuracy for kitchen action recognition |
| Auth | Clerk | Role-based, easy, handles partner/restaurant/admin |
| Edge | RPi Zero 2W | ₹1,800, matchbox-sized, runs Python + OpenCV |
| SOP lock | SHA-256 | Cryptographic tamper-proof recipe record |

---

## Partner programme

Revenue share: **60% to partner, 40% to re-plate**
Security deposit: **₹40,000 refundable**
Territory: **6–10 partners per city, exclusive zones**

See `docs/partner-programme.docx` for full SOP and agreement framework.

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis connection string |
| `CLERK_SECRET_KEY` | Yes | Clerk auth secret |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | Clerk publishable key |
| `OPENAI_API_KEY` | Yes | GPT-4o Vision for inference |
| `CLOUDFLARE_R2_ACCOUNT_ID` | Yes | R2 storage account |
| `CLOUDFLARE_R2_ACCESS_KEY_ID` | Yes | R2 access key |
| `CLOUDFLARE_R2_SECRET_ACCESS_KEY` | Yes | R2 secret key |
| `CLOUDFLARE_R2_BUCKET_NAME` | Yes | R2 bucket name |
| `CLOUDFLARE_R2_PUBLIC_URL` | Yes | Public URL for videos |
| `SECRET_KEY` | Yes | App secret (min 32 chars) |

---

## Built with Antigravity

This codebase was scaffolded and built using Google Antigravity with Claude Sonnet.
See `.agents/` for the skills and rules that guided generation.

© 2025 Hidden Flavour Pvt. Ltd.
