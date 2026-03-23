# Architecture: Large World Model

## What Is a Large World Model?

A Large Language Model (LLM) knows a lot but its knowledge stops at a training cutoff date. A **Large World Model (LWM)** solves this by continuously feeding live real-world data into an LLM as grounded context before asking it to reason.

Bharat Watch Engine implements this pattern:

```
LIVE WORLD STATE (updated every hour)
├── 17 RSS feeds         → today's headlines
├── Agmarknet scrape     → today's actual mandi prices
├── FX API               → today's USD/INR, AED/INR
├── BSE/NSE scrape       → today's Sensex/Nifty levels
├── Open-Meteo API       → today's weather (affects crops)
├── RBI/SEBI/NDMA        → today's government alerts
└── Conflict tracker     → today's geopolitical events

      ↓ injected as grounded context ↓

LLM REASONING ENGINE
├── "Given this world state, what happens to onion prices?"
├── "Given this world state, which sectors are most at risk?"
└── "Given these 300 Indian persona views, what is the consensus?"

      ↓ structured output ↓

PREDICTIONS
├── 7-day forecast (probability-weighted)
├── 30-day outlook (trend direction)
└── Emergent insights (what no chart would tell you)
```

The LLM is not guessing from training data. It is **reasoning over today's real data**.

---

## The Four Layers

### Layer 1 — Ingestion (WorldMonitor-inspired)

Runs every hour via `node-cron`. Three parallel strategies:

1. **RSS Feeds** — 17 curated sources across world/asia/india/business categories. Fast, free, reliable.
2. **Web Scraping** — 23 targets using the UltimateWebScraper strategy cascade: direct HTTP → CORS proxy → Cheerio selectors → LLM extraction fallback. Covers sites with no RSS (Agmarknet, BSE, Goodreturns, PPAC, RBI, SEBI, NDMA).
3. **Open APIs** — Frankfurter.app (FX), Open-Meteo (weather). Free, no key required.

All results are written to `/cache/*.json` immediately after fetch.

### Layer 2 — Cache (Disk-based, zero-latency serving)

Every visitor reads from disk. No external API call per user request.

```
┌──────────┐    write     ┌──────────────────┐    read (< 5ms)    ┌──────────┐
│  Cron    │ ──────────▶  │  /cache/*.json   │ ──────────────────▶│  User    │
│ (hourly) │              │  fx.json         │                    │ Request  │
└──────────┘              │  markets.json    │                    └──────────┘
                          │  news.json       │
                          │  commodities.json│
                          │  ai-brief.json   │
                          │  pred-*.json     │
                          └──────────────────┘
```

Cache TTL is configurable via `CACHE_TTL_MS` (default 1 hour). Any number of users can hit the API simultaneously — they all read the same cached file.

### Layer 3 — Intelligence (MiroFish-inspired)

Three intelligence products:

**Daily AI Brief** (`ai-brief.json`)
One LLM call per hour. Reads headlines + market levels + commodity prices → writes a structured brief covering geopolitical risk, business impact, common man impact, and 7-day outlook. Also produces sector impact JSON, stress index values, and state alert levels.

**Prediction Engine** (`pred-*.json`)
MiroFish-style multi-agent simulation. Auto-scales based on severity:

| Event Level | Agents | Rounds | Claude Calls | Cost ~₹ |
|---|---|---|---|---|
| LOW | 50 | 2 | 2 | ₹5 |
| MEDIUM | 150 | 3 | 5 | ₹20 |
| HIGH | 300 | 4 | 8 | ₹50 |
| CRITICAL | 500 | 5 | 12 | ₹80 |

Each "panel" simulates 25–40 agents in one LLM call. The `ReportAgent` synthesises all panels into one final structured prediction with probability score, dissenting views, and emergent insights.

**30-Day Forecast** (extended horizon)
Same pipeline, longer time horizon passed in the prompt. Produces directional trend forecasts for markets, food prices, and policy environment.

### Layer 4 — API (REST, any app can consume)

Express.js router with:
- Standard JSON envelope: `{ data, fetchedAt, nextFetchAt, fresh, ageMs, source }`
- Cache-Control headers
- Circuit breaker state visible at `/api/scraper/status`
- LLM provider visible at `/api/llm/status`

---

## Data Flow Diagram

```
                    ┌─────────────────────────────────┐
                    │         CRON SCHEDULER           │
                    │  0 * * * *  → runFullRefresh()   │
                    │  5 * * * *  → runPredictions()   │
                    └──────────────┬──────────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                     │
    ┌─────────▼──────┐  ┌──────────▼──────┐  ┌─────────▼──────┐
    │   RSS FETCHER   │  │  WEB SCRAPER    │  │   OPEN APIS    │
    │ rss-fetcher.js │  │ gov-scraper.js  │  │ FX + Weather   │
    └────────┬────────┘  └──────┬──────────┘  └────────┬───────┘
             │                  │                       │
             └──────────────────┴───────────────────────┘
                                │
                    ┌───────────▼───────────┐
                    │      DISK CACHE       │
                    │    core/cache.js      │
                    └───────────┬───────────┘
                                │
             ┌──────────────────┼──────────────────┐
             │                  │                   │
   ┌─────────▼──────┐  ┌────────▼────────┐  ┌──────▼──────────┐
   │  LLM ADAPTER   │  │ PRED ENGINE     │  │ BRIEF GENERATOR │
   │ llm-adapter.js │  │ prediction-     │  │ brief-          │
   │ Claude/GPT/etc │  │ engine.js       │  │ generator.js    │
   └─────────┬──────┘  └────────┬────────┘  └──────┬──────────┘
             └──────────────────┴──────────────────┘
                                │
                    ┌───────────▼───────────┐
                    │      REST API         │
                    │  api/routes/*.js      │
                    └───────────────────────┘
```
