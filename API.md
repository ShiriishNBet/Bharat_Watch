# Bharat Watch Engine — API Reference

Base URL: `http://localhost:3000` (local) or `https://your-domain.com`

All responses use this envelope:
```json
{
  "data": { ... },
  "fetchedAt": "2025-03-23T09:41:00.000Z",
  "nextFetchAt": "2025-03-23T10:41:00.000Z",
  "fresh": true,
  "ageMs": 124000,
  "source": "frankfurter.app"
}
```

---

## Data Endpoints

### GET /api/fx
FX rates vs INR, updated hourly from Frankfurter.app.
```json
{
  "data": {
    "USD_INR": 84.23, "EUR_INR": 91.47, "GBP_INR": 107.18,
    "AED_INR": 22.94, "CNY_INR": 11.62, "JPY_INR": 0.562
  }
}
```

### GET /api/weather
Live weather for 10 Indian cities from Open-Meteo.
```json
{
  "data": [
    { "city": "DELHI", "temperature_2m": 38, "wind_speed_10m": 18, "weather_code": 0 }
  ]
}
```

### GET /api/markets
Sensex, Nifty, WTI crude, Brent crude.
```json
{
  "data": {
    "sensex": { "value": 73842, "change": 312, "changePct": 0.43 },
    "nifty":  { "value": 22389, "change": 98,  "changePct": 0.44 },
    "wti":    { "value": 77.85, "change": -0.92 },
    "brent":  { "value": 81.40, "change": -0.74 }
  }
}
```

### GET /api/news
News feeds. Optional `?category=india|world|asia|business`
```json
{
  "data": {
    "india":    [{ "title": "...", "source": "NDTV", "pubDate": "...", "link": "..." }],
    "world":    [...],
    "asia":     [...],
    "business": [...]
  }
}
```

### GET /api/commodities
10 household commodity prices.
```json
{
  "data": [
    { "icon": "⛽", "name": "PETROL", "unit": "/L", "price": "₹94.7", "chg": "+0.2", "dir": "up" }
  ]
}
```

### GET /api/ai-brief
Daily India Impact Brief with sector analysis.
```json
{
  "data": {
    "briefText": "**GEOPOLITICAL RISK:** ...",
    "json": {
      "sectors": [{ "name": "Energy", "impact": -4.2, "note": "..." }],
      "stress":  [{ "label": "GEOPOLITICAL RISK", "value": 70 }]
    }
  }
}
```

---

## Scraper Endpoints

### GET /api/scraper/status
```json
{
  "enabled": true,
  "circuitBreakers": { "agmarknet.gov.in": { "failures": 0, "open": false } },
  "lastFetch": { "goodreturns.in": 1710580000000 }
}
```

### GET /api/scraper/mandi?commodities=onion,tomato
Live Agmarknet mandi prices.
```json
{
  "data": {
    "onion": {
      "pricePerKg": 28.5,
      "avgModalPrice": 2850,
      "markets": [{ "market": "Nasik", "state": "Maharashtra", "modalPrice": 2800 }]
    }
  }
}
```

### GET /api/scraper/fuel
City-wise petrol/diesel from Goodreturns.
```json
{
  "prices": {
    "Delhi":  { "petrol": 94.72, "diesel": 87.62 },
    "Mumbai": { "petrol": 104.21, "diesel": 92.15 }
  }
}
```

### POST /api/scraper/run
Triggers a full scrape cycle. Returns immediately, scraping runs in background.

---

## Prediction Endpoints

### GET /api/predict/status
```json
{
  "severity": 3,
  "severityLabel": "HIGH",
  "agentCount": 300,
  "running": { "markets": false, "commodities": false, "policy": false }
}
```

### GET /api/predict/markets
```json
{
  "data": {
    "direction": "bullish",
    "directionLabel": "BULLISH",
    "probability": 72,
    "confidence": 68,
    "headline": "Sensex likely to gain 1.2–2.8% this week...",
    "reasoning": "FII portfolio managers and DII fund managers aligned...",
    "dissentingView": "SEBI analysts caution about F&O expiry...",
    "keyRisk": "Crude above $85 would reverse FII positioning",
    "subForecasts": [
      { "label": "Sensex 7D", "direction": "up", "magnitude": "+1.2–2.8%", "confidence": 72 }
    ],
    "watchIndicators": ["Fed minutes", "RBI policy", "OPEC+ meeting"],
    "emergentInsight": "...",
    "meta": { "agentCount": 300, "severity": "HIGH", "panelsRun": 8 }
  }
}
```

### POST /api/predict/:topic/run
Triggers simulation for one topic (markets | commodities | policy). Non-blocking.

---

## System Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/status` | GET | Full engine health + cache state |
| `/api/llm/status` | GET | Active provider + all configured providers |
| `/api/refresh` | POST | Force full data refresh |
| `/api/cache/:key` | GET | Raw cache file contents |
| `/api/cache/:key` | DELETE | Clear one cache key |
