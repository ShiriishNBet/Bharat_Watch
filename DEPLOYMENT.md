# Deployment Guide

## Option 1 — Local Development

```bash
git clone https://github.com/YOUR_USERNAME/bharatwatch-engine.git
cd bharatwatch-engine
npm install
cp .env.example .env      # add your ANTHROPIC_API_KEY
npm run dev               # hot-reload on file changes
```

## Option 2 — VPS with PM2 (Recommended for Production)

```bash
# On your server (Ubuntu 22.04+)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
npm install -g pm2

git clone https://github.com/YOUR_USERNAME/bharatwatch-engine.git
cd bharatwatch-engine
npm install
cp .env.example .env      # add keys
npm run seed              # pre-warm cache

pm2 start core/server.js --name bharatwatch --max-memory-restart 512M
pm2 save
pm2 startup
```

Reverse proxy with Nginx:
```nginx
server {
    listen 80;
    server_name bharatwatch.yourdomain.in;
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Option 3 — Docker

```bash
docker-compose up -d
# Dashboard: http://localhost:3000
```

To persist cache between restarts:
```bash
mkdir -p ./cache
docker-compose up -d
```

## Option 4 — Railway (Zero-config cloud)

1. Push to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Add environment variables from `.env.example`
4. Deploy — Railway auto-detects Node.js, sets PORT

## Option 5 — Render

1. New Web Service → connect GitHub repo
2. Build command: `npm install`
3. Start command: `node core/server.js`
4. Add env vars
5. Deploy

## Minimum Server Requirements

| Resource | Minimum | Recommended |
|---|---|---|
| RAM | 512 MB | 1 GB |
| CPU | 1 vCPU | 2 vCPU |
| Storage | 1 GB | 5 GB |
| Node.js | v18+ | v20+ |

## Cost Estimates (Monthly)

| Component | Cost |
|---|---|
| VPS (Hetzner CX21) | €4/month (~₹360) |
| Anthropic API (Claude Sonnet) | $10–30 (~₹850–2,500) |
| Domain (.in) | ₹800/year |
| **Total** | **~₹2,000–3,500/month** |

Using Groq (free tier) instead of Claude brings AI cost to ₹0 for up to 10K requests/day.
