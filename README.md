# 🔭 BHARAT WATCH ENGINE

> **India's first Large World Model-powered intelligence engine.**
> Real-time data ingestion → AI simulation → 30-day predictions → REST API for any application.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

---

## What Is Bharat Watch Engine?

Bharat Watch Engine is an **open-source intelligence backend** that continuously monitors the world, understands how global events impact India, and delivers structured predictions — ready for any app to consume via REST API.

It is inspired by three open-source projects stitched into one India-focused engine:

| Inspiration | What We Used | Our Addition |
|---|---|---|
| [WorldMonitor.app](https://www.worldmonitor.app) | Architecture: multi-feed ingestion, conflict tracking, map layers, 435+ feed model | India-specific feeds, state impact map, common man metrics |
| [UltimateWebScraper](https://github.com/cubiclesoft/ultimate-web-scraper) | Strategy-based scraping: direct → proxy → LLM fallback, circuit breakers, rate limiting | Agmarknet, BSE/NSE, Goodreturns, PPAC, RBI, SEBI scrapers |
| [MiroFish AI](https://github.com/mirofish/mirofish) | Multi-agent social simulation: persona pools, emergent consensus, ReportAgent | 28 Indian personas, severity auto-scaling, 30-day forecast horizon |

---

## Architecture: Large World Model

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     BHARAT WATCH ENGINE                                  │
│                                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │  RSS LAYER   │  │  WEB SCRAPER │  │  OPEN APIs   │  │  GOV DATA  │  │
│  │ 17 RSS feeds │  │ 23 targets   │  │ FX/Weather   │  │ RBI/SEBI   │  │
│  │ NDTV/BBC/ET  │  │ Agmarknet    │  │ Open-Meteo   │  │ NDMA/IMD   │  │
│  │ Reuters/HT   │  │ BSE/NSE      │  │ Frankfurter  │  │ Agmarknet  │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └─────┬──────┘  │
│         └─────────────────┴─────────────────┴────────────────┘         │
│                                    │                                     │
│                         ┌──────────▼──────────┐                         │
│                         │   INGESTION LAYER    │                         │
│                         │  Circuit breakers    │                         │
│                         │  Rate limiting       │                         │
│                         │  Proxy fallback      │                         │
│                         │  LLM extraction      │                         │
│                         └──────────┬──────────┘                         │
│                                    │                                     │
│                         ┌──────────▼──────────┐                         │
│                         │    DISK CACHE        │                         │
│                         │  /cache/*.json       │                         │
│                         │  TTL: 1 hour         │                         │
│                         │  All visitors served │                         │
│                         │  from cache (<5ms)   │                         │
│                         └──────────┬──────────┘                         │
│                                    │                                     │
│           ┌────────────────────────┼──────────────────────┐             │
│           │                        │                       │             │
│  ┌────────▼──────────┐  ┌─────────▼──────────┐  ┌────────▼──────────┐  │
│  │   LLM ADAPTER     │  │  PREDICTION ENGINE  │  │  BRIEF GENERATOR  │  │
│  │  Claude/GPT/Gemini│  │  MiroFish-style     │  │  Daily India brief│  │
│  │  Groq/Mistral     │  │  28 Indian personas │  │  Sector impact    │  │
│  │  Ollama (local)   │  │  50–500 agents      │  │  Common man view  │  │
│  │  AWS Bedrock      │  │  1–30 day forecasts │  │  State analysis   │  │
│  └────────┬──────────┘  └─────────┬──────────┘  └────────┬──────────┘  │
│           └────────────────────────┴──────────────────────┘             │
│                                    │                                     │
│                         ┌──────────▼──────────┐                         │
│                         │     REST API         │                         │
│                         │  /api/fx             │                         │
│                         │  /api/weather        │                         │
│                         │  /api/markets        │                         │
│                         │  /api/news           │                         │
│                         │  /api/commodities    │                         │
│                         │  /api/predict/*      │                         │
│                         │  /api/scraper/*      │                         │
│                         └──────────┬──────────┘                         │
│                                    │                                     │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │               ANY APPLICATION CAN CONSUME THIS                    │   │
│  │   Web Dashboard │ Mobile App │ WhatsApp Bot │ Telegram Bot       │   │
│  │   Trading Algo  │ News App   │ Govt Portal  │ AgriTech Platform  │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/bharatwatch-engine.git
cd bharatwatch-engine

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env — add at minimum: ANTHROPIC_API_KEY or OPENAI_API_KEY

# 4. Start the engine
npm start
# → http://localhost:3000       (dashboard)
# → http://localhost:3000/api/status  (health check)
```

**Demo mode (no API keys needed):**
```bash
npm run demo
# Starts with mock data and public free APIs only
```

---

## API Reference

## New: Solutions Engine + Pattern Detector AI

### Solutions Engine — "What should I DO about this?"
Every impact gets 3–5 actionable solutions with **real Indian examples**:

```bash
GET /api/solutions/quick?type=farmer
GET /api/solutions/quick?type=homemaker
GET /api/solutions/quick?type=gulf_worker
```

Example output for a homemaker during the 2023 onion crisis:
```json
{
  "impact_summary": "Onion prices up 40% due to Maharashtra crop damage",
  "impact_on_monthly_budget": "₹840 more per month",
  "solutions": [{
    "title": "Buy from Rythu Bazaar / APMC direct",
    "saving_or_benefit": "₹12–18/kg saving vs retail",
    "real_example": {
      "who": "Hyderabad families",
      "what_they_did": "Shifted to Rythu Bazaar during Oct–Dec 2023 spike",
      "result": "Saved avg ₹1,200/month during crisis period"
    },
    "how_to_start": "Search 'Rythu Bazaar near me' or call 1800-425-1110"
  }]
}
```

Supports 8 citizen types: `farmer | homemaker | it_professional | gulf_worker | small_business | daily_wager | investor | student`

---

### Pattern Detector AI — "What's being hidden from you?"
Inspired by the [AI used to detect corruption in government data](https://www.linkedin.com/posts/linkedin-artificial-intelligence_20-year-old-used-ai-to-detect-corruption-activity-7434908164845776897-3okc/).

Cross-references **official data vs scraped ground truth** to flag:

| Detection Type | What It Catches |
|---|---|
| `PRICE_MANIPULATION` | Retail price 2× mandi price — middleman cartel signal |
| `CARTEL_SIGNAL` | 5+ commodities all moving in lockstep — unnatural coordination |
| `POLICY_DISCONNECT` | Govt says supply is fine but prices are spiking |
| `FUEL_REVISION_DELAY` | Crude fell $5/bbl but petrol unchanged for 14+ days |
| `SUBSIDY_LEAKAGE` | Scheme announced but beneficiary prices unchanged after 30 days |
| `INFLATION_GAP` | Official CPI 4.5% but our household basket shows 18% |
| `HOARDING_SIGNAL` | Prices rising IN harvest season (should be opposite) |

```bash
GET /api/patterns              # latest anomaly scan
POST /api/patterns/run         # trigger fresh scan
GET /api/patterns/known        # all known India manipulation patterns
GET /api/patterns/commodity/onion  # pattern history for one commodity
```

Real example alert:
```json
{
  "type": "PRICE_MANIPULATION",
  "severity": "HIGH",
  "mandi_price": "₹28/kg",
  "retail_price": "₹55/kg",
  "spread_pct": 96,
  "flag": "Onion retails at 96% above mandi — normal is 30–50%",
  "escalation_path": "Report to: agmarknet.gov.in grievance portal or CCI",
  "citizen_action": "Buy via e-NAM or direct mandi. Spread >100% is reportable."
}
```


### Data Endpoints
| Endpoint | Description | Source |
|---|---|---|
| `GET /api/fx` | FX rates (USD/INR, AED/INR, EUR/INR...) | Frankfurter.app |
| `GET /api/weather` | Live weather for 10 Indian cities | Open-Meteo.com |
| `GET /api/markets` | Sensex, Nifty, WTI, Brent crude | Scraper + LLM search |
| `GET /api/news` | News feeds (india/world/asia/business) | 17 RSS feeds |
| `GET /api/commodities` | 10 household commodity prices | Agmarknet + Scraper |
| `GET /api/ai-brief` | Daily India Impact Brief | Claude/LLM |

### Scraper Endpoints
| Endpoint | Description |
|---|---|
| `GET /api/scraper/status` | Circuit breakers, rate limits, all 23 targets |
| `GET /api/scraper/mandi` | Live mandi prices from Agmarknet |
| `GET /api/scraper/fuel` | City-wise petrol/diesel (Goodreturns) |
| `GET /api/scraper/gov-alerts` | RBI / SEBI / NDMA latest alerts |
| `POST /api/scraper/run` | Trigger a full scrape cycle |

### Prediction Endpoints
| Endpoint | Description |
|---|---|
| `GET /api/predict/status` | Severity level, agent count, all cached predictions |
| `GET /api/predict/markets` | 1–30 day Sensex/Nifty forecast |
| `GET /api/predict/commodities` | Food & fuel price forecast |
| `GET /api/predict/policy` | Policy / political impact assessment |
| `GET /api/predict/all` | All three predictions |
| `POST /api/predict/:topic/run` | Trigger simulation for one topic |
| `POST /api/predict/all/run` | Run all three simulations |

### System Endpoints
| Endpoint | Description |
|---|---|
| `GET /api/status` | Full server health, cache ages, source counts |
| `GET /api/llm/status` | Active LLM provider, all configured providers |
| `POST /api/refresh` | Force full data refresh |

---

## File Structure

```
bharatwatch-engine/
│
├── 📄 README.md               This file
├── 📄 package.json            Dependencies
├── 📄 .env.example            Environment variables template
├── 📄 .gitignore
├── 📄 Dockerfile
├── 📄 docker-compose.yml
│
├── 📁 config/
│   └── bharat-watch.config.js  ← ALL settings: feeds, cities, personas, LLM
│
├── 📁 core/
│   ├── server.js              Express app + cron scheduler
│   ├── cache.js               Disk cache layer (read/write/TTL)
│   ├── logger.js              Structured logging
│   └── scheduler.js           Hourly cron + task orchestration
│
├── 📁 scrapers/
│   ├── index.js               Master scraper runner (UltimateWebScraper-style)
│   ├── rss-fetcher.js         RSS feed ingestion (17 feeds)
│   ├── web-scraper.js         HTML scraper (Cheerio + LLM fallback)
│   ├── market-scraper.js      BSE/NSE/commodity prices
│   └── gov-scraper.js         RBI/SEBI/NDMA/Agmarknet/IMD
│
├── 📁 intelligence/
│   ├── llm-adapter.js         Multi-provider LLM (Claude/GPT/Gemini/Groq/Ollama)
│   ├── prediction-engine.js   MiroFish-style 28-persona simulation
│   ├── news-classifier.js     Auto-classify headlines (critical/high/medium/positive)
│   └── brief-generator.js     Daily India Impact Brief generator
│
├── 📁 api/
│   ├── middleware.js           CORS, rate limit, error handling
│   └── routes/
│       ├── data.js             /api/fx, /api/weather, /api/markets, /api/news
│       ├── scraper.js          /api/scraper/*
│       ├── predict.js          /api/predict/*
│       └── status.js           /api/status, /api/llm/status
│
├── 📁 public/
│   ├── index.html             Full dashboard (MapLibre GL + all panels)
│   └── bharat-watch-client.js Client config (API base URL, endpoints)
│
├── 📁 docs/
│   ├── ARCHITECTURE.md        Deep-dive technical architecture
│   ├── API.md                 Full API documentation with examples
│   ├── DEPLOYMENT.md          VPS / Docker / Railway / Render guides
│   └── PERSONAS.md            All 28 Indian agent personas documented
│
└── 📁 scripts/
    ├── seed-cache.js          Pre-warm cache on first deploy
    ├── test-scraper.js        Test individual scrape targets
    └── benchmark.js           Load test the API
```

---

## The Four Pillars

### 1. WorldMonitor-style Architecture
Multi-feed ingestion at scale. Every data source has a circuit breaker, rate limiter, and fallback. The hourly refresh cycle fetches all sources in coordinated rounds, writes to disk cache, and serves every visitor from cache — zero external API calls per visitor within the cycle.

### 2. UltimateWebScraper Techniques
Four-strategy scraping pipeline per target: Direct HTTP → CORS Proxy → Cheerio Parsing → LLM Extraction. The LLM fallback means scraping **never truly fails** — even if a site changes its layout, the LLM reads the raw HTML like a human and extracts the data. Rotating User-Agents, randomised delays, per-domain circuit breakers, and `Retry-After` respect make this a respectful, production-grade scraper.

### 3. Large World Model Architecture
Not just a dashboard — an inference engine. Every hour, the system builds a **World State Object** from all live data: news headlines, market levels, FX rates, commodity prices, weather, conflict alerts, government releases. This world state is fed into the LLM as grounded context. The LLM reasons over real, current data — not its training corpus. This is the LWM pattern: ground a reasoning model in live world data, then ask it to synthesise.

### 4. MiroFish-style 30-Day Predictions
Auto-scales from 50 agents (quiet day) to 500 agents (crisis). 28 distinct Indian personas — farmer, FII trader, Gulf worker, homemaker, RBI analyst, MGNREGA laborer — each read today's headlines through their own lens, debate across multiple rounds, and reach emergent consensus. A ReportAgent synthesises into structured 1-day, 7-day, and 30-day forecasts with probability scores, dissenting views, and emergent insights.

---

## LLM Provider Support

Change one line in `.env` to switch providers:

```bash
LLM_PROVIDER=claude    # Anthropic Claude (default, best reasoning)
LLM_PROVIDER=openai    # OpenAI GPT-4o
LLM_PROVIDER=gemini    # Google Gemini Flash (cheapest)
LLM_PROVIDER=groq      # Groq Llama 3 (fastest, free tier)
LLM_PROVIDER=mistral   # Mistral Large
LLM_PROVIDER=ollama    # Local Ollama (free, offline)
```

---

## Use Cases

| Application | How It Uses the Engine |
|---|---|
| **News app** | `GET /api/news` — classified, auto-tagged headlines every hour |
| **Trading platform** | `GET /api/predict/markets` — 7-day Sensex direction with confidence score |
| **AgriTech app** | `GET /api/scraper/mandi` — live mandi prices from 5,000+ markets |
| **Gulf remittance app** | `GET /api/fx` — AED/INR updated every hour |
| **Family budget app** | `GET /api/commodities` — atta, dal, onion, petrol prices |
| **Govt policy portal** | `GET /api/predict/policy` — impact assessment for new announcements |
| **WhatsApp bot** | Poll `/api/ai-brief` — one-paragraph daily summary for broadcast |
| **Disaster alert system** | `GET /api/scraper/gov-alerts` — NDMA/IMD/RBI filtered alerts |

---

## Deployment

### PM2 (VPS — recommended)
```bash
npm install -g pm2
pm2 start core/server.js --name bharatwatch
pm2 save && pm2 startup
```

### Docker
```bash
docker-compose up -d
```

### Railway / Render / Fly.io
- Set environment variables from `.env.example`
- Start command: `node core/server.js`
- Port: `3000`

---

## Contributing

Pull requests welcome. Areas where help is most needed:
- More Indian state-level data sources
- Hindi / Tamil / Telugu language feed support
- WebSocket for live Sensex streaming (BSE websocket API)
- Historical data storage (currently latest snapshot only)
- ACLED India conflict data integration
- Satellite imagery (VIIRS fire/flood alerts)

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## License

MIT — free to use, modify, and deploy. Attribution appreciated.

---

*Built with inspiration from [WorldMonitor.app](https://www.worldmonitor.app), [MiroFish](https://github.com/mirofish/mirofish), and [UltimateWebScraper](https://github.com/cubiclesoft/ultimate-web-scraper).*
