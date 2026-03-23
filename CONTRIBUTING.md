# Contributing to Bharat Watch Engine

Thank you for helping build India's intelligence engine.

## How to Contribute

### Add a New RSS Feed
Edit `config/bharat-watch.config.js` → `FEEDS` section:
```js
india: [
  { url: 'https://newsite.com/rss', source: 'NEW SITE' },  // add here
  ...
]
```

### Add a New Scrape Target
Edit `scrapers/gov-scraper.js` or create a new file in `scrapers/`. Register the target in `scrapers/index.js`.

### Add a New Indian Persona
Edit `config/bharat-watch.config.js` → `PERSONAS` array:
```js
{
  id  : 'your_persona_id',
  name: 'Persona Display Name',
  bg  : 'Background description — who they are, what they do, what data they watch',
  bias: 'Their typical viewpoint and decision-making pattern',
},
```

### Add a New City
Edit `config/bharat-watch.config.js` → `WEATHER.CITIES`:
```js
{ name: 'CHANDIGARH', lat: 30.7333, lon: 76.7794 },
```

### Fix a Bug
1. Fork the repo
2. Create a branch: `git checkout -b fix/issue-description`
3. Make your change
4. Run tests: `npm test`
5. Submit a PR

## Priority Areas
- Hindi/Tamil/Telugu language RSS feeds
- WebSocket for real-time Sensex streaming
- ACLED India conflict data integration
- Historical cache storage (currently latest snapshot only)
- More Indian state government data sources
- Agricultural weather (IMD monsoon tracking)
- FRED India economic indicators integration

## Code Style
- Node.js 18+ (no Babel/TypeScript needed)
- `'use strict'` at top of every file
- `makeLogger(ns)` for all logging — no bare `console.log`
- All external HTTP calls go through `scrapers/web-scraper.js:httpGet()`
- All LLM calls go through `intelligence/llm-adapter.js:call()`
- Cache writes via `core/cache.js:Cache.write()`
