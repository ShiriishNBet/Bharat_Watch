// ════════════════════════════════════════════════════════════════════════════
//  BHARAT WATCH — MASTER CONFIG FILE
//  Single source of truth for ALL configurable data:
//
//  SECTIONS:
//  1.  SERVER          — port, cache TTL, file paths
//  2.  CLAUDE AI       — model, endpoint, token limits
//  3.  FX RATES API    — Frankfurter endpoint + currency pairs
//  4.  WEATHER API     — Open-Meteo endpoint + Indian cities
//  5.  RSS FEEDS       — all 4 categories × multiple sources
//  6.  PREDICTION      — severity scale + agent counts per level
//  7.  PERSONAS        — 28 Indian agent archetypes for simulation
//  8.  CONFLICT EVENTS — static geopolitical hotspot definitions
//  9.  STATE DATA      — 12 state impact rows (static baseline)
//  10. FALLBACK DATA   — demo-mode mock values (no server needed)
//  11. CLIENT          — browser API endpoints + UI labels
//
//  HOW TO USE:
//    Server (Node.js):  const CFG = require('./bharat-watch.config');
//    Browser (HTML):    <script src="bharat-watch.config.js"></script>
//                       then access window.BW_CONFIG
//
//  TO ADD A FEED:       scroll to section 5, add one line
//  TO ADD A PERSONA:    scroll to section 7, add one object
//  TO CHANGE A CITY:    scroll to section 4, edit the CITIES array
//  TO CHANGE MODEL:     scroll to section 2, edit CLAUDE.model
// ════════════════════════════════════════════════════════════════════════════

'use strict';

const CONFIG = {

  // ══════════════════════════════════════════════════════════════════════════
  //  1. SERVER
  //     Controls how the Node.js Express server behaves.
  // ══════════════════════════════════════════════════════════════════════════
  SERVER: {
    port        : parseInt(process?.env?.PORT) || 3000,
    // How long cached data is considered "fresh" before re-fetching.
    // Default: 1 hour. Lower = fresher data, more API calls.
    cacheTTL_ms : parseInt(process?.env?.CACHE_TTL_MS) || 60 * 60 * 1000,
    cacheDir    : './cache',
    publicDir   : './public',
    // Optional secret to protect the POST /api/refresh endpoint.
    // Set REFRESH_SECRET in .env to enable protection.
    refreshSecret: process?.env?.REFRESH_SECRET || null,
    // Max concurrent outbound HTTP requests per data-fetch cycle
    maxConcurrentFetches: 3,
    // RSS fetch timeout in milliseconds
    feedTimeoutMs: 12_000,
    // Open API fetch timeout
    apiTimeoutMs : 10_000,
  },


  // ══════════════════════════════════════════════════════════════════════════
  //  2. LLM PROVIDER
  //     NOT restricted to Claude. Swap to any LLM by changing `active`.
  //     QUICK SWITCH: set LLM_PROVIDER in your .env file, e.g.:
  //       LLM_PROVIDER=openai   or   LLM_PROVIDER=groq
  //
  //     Each provider block has its own key, endpoint, and model.
  //     llm-adapter.js handles all format translation automatically —
  //     server.js and prediction-engine.js never change.
  //
  //     WEB SEARCH SUPPORT:
  //       claude   → YES (web_search_20250305 built-in tool)
  //       openai   → YES (web_search_preview tool)
  //       gemini   → YES (Google Search grounding)
  //       cohere   → YES (web connector)
  //       groq     → NO  → falls back to RSS + open API context
  //       mistral  → NO  → falls back to RSS + open API context
  //       ollama   → NO  → fully offline, uses cached data only
  // ══════════════════════════════════════════════════════════════════════════
  LLM: {

    // ── Active provider — ONE line to switch everything ───────────────────
    active: process?.env?.LLM_PROVIDER || 'claude',

    // ── Token limits per call type (applies to ALL providers) ─────────────
    maxTokens: {
      brief      : 2500,
      markets    : 1000,
      commodities: 1200,
      panel      : 2000,
      report     : 1500,
    },

    timeoutMs: 90_000,

    providers: {

      // ── Anthropic Claude (default) ────────────────────────────────────
      // key: https://console.anthropic.com
      claude: {
        apiKey    : process?.env?.ANTHROPIC_API_KEY || '',
        endpoint  : 'https://api.anthropic.com/v1/messages',
        model     : 'claude-sonnet-4-6',
        hasSearch : true,
        searchTool: 'web_search_20250305',
        format    : 'anthropic',
      },

      // ── OpenAI GPT-4o ─────────────────────────────────────────────────
      // key: https://platform.openai.com
      openai: {
        apiKey    : process?.env?.OPENAI_API_KEY || '',
        endpoint  : 'https://api.openai.com/v1/chat/completions',
        model     : 'gpt-4o',
        hasSearch : true,
        searchTool: 'web_search_preview',
        format    : 'openai',
      },

      // ── Google Gemini Flash ───────────────────────────────────────────
      // key: https://aistudio.google.com
      // Best for: cheapest per token, very fast, strong Hindi context
      gemini: {
        apiKey    : process?.env?.GEMINI_API_KEY || '',
        endpoint  : 'https://generativelanguage.googleapis.com/v1beta/models',
        model     : 'gemini-2.0-flash',
        hasSearch : true,
        format    : 'gemini',
      },

      // ── Groq — Llama 3 (free tier, 200+ tokens/sec) ──────────────────
      // key: https://console.groq.com
      // Best for: free prototyping, speed — no built-in web search
      groq: {
        apiKey    : process?.env?.GROQ_API_KEY || '',
        endpoint  : 'https://api.groq.com/openai/v1/chat/completions',
        model     : 'llama-3.3-70b-versatile',
        hasSearch : false,
        format    : 'openai',
      },

      // ── Mistral Large ─────────────────────────────────────────────────
      // key: https://console.mistral.ai
      // Best for: European compliance, strong multilingual
      mistral: {
        apiKey    : process?.env?.MISTRAL_API_KEY || '',
        endpoint  : 'https://api.mistral.ai/v1/chat/completions',
        model     : 'mistral-large-latest',
        hasSearch : false,
        format    : 'openai',
      },

      // ── Cohere Command R+ ─────────────────────────────────────────────
      // key: https://dashboard.cohere.com
      // Best for: RAG pipelines, Indian regional language support
      cohere: {
        apiKey    : process?.env?.COHERE_API_KEY || '',
        endpoint  : 'https://api.cohere.ai/v1/chat',
        model     : 'command-r-plus',
        hasSearch : true,
        format    : 'cohere',
      },

      // ── Ollama (local, completely free, no internet needed) ───────────
      // Install: https://ollama.ai  →  ollama pull llama3
      // Best for: zero cost, full privacy, offline deployments
      ollama: {
        apiKey    : '',
        endpoint  : 'http://localhost:11434/api/chat',
        model     : 'llama3',
        hasSearch : false,
        format    : 'ollama',
      },

      // ── AWS Bedrock (India region: ap-south-1, Mumbai) ────────────────
      // Best for: enterprise, data sovereignty, stays in India
      bedrock: {
        apiKey    : process?.env?.AWS_ACCESS_KEY_ID || '',
        secretKey : process?.env?.AWS_SECRET_ACCESS_KEY || '',
        region    : process?.env?.AWS_REGION || 'ap-south-1',
        model     : 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        hasSearch : false,
        format    : 'bedrock',
      },

      // ── Per-task overrides ─────────────────────────────────────────────
      // Use a cheaper/faster provider for bulk tasks (panels) and a
      // better provider for the final report. Leave '' to use active.
      // Example: groq for panels (free + fast), claude for final report
      taskOverrides: {
        brief      : '',
        markets    : '',
        commodities: '',
        panel      : '',
        report     : '',
      },
    },
  },


  // ══════════════════════════════════════════════════════════════════════════
  //  3. FX RATES API  (Frankfurter.app — free, no key required)
  //     Add or remove currencies by editing the `pairs` array.
  //     Base is always USD. The server computes all cross-rates vs INR.
  // ══════════════════════════════════════════════════════════════════════════
  FX: {
    endpoint : 'https://api.frankfurter.app/latest',
    baseCurrency: 'USD',
    // Currencies to fetch — add any ISO 4217 code here
    currencies: ['INR', 'EUR', 'GBP', 'JPY', 'CNY', 'AED', 'SGD', 'CHF'],
    // Display pairs shown in the UI ticker and markets panel
    displayPairs: [
      { code: 'USD_INR', label: 'USD / INR', unit: 'PER USD'    },
      { code: 'EUR_INR', label: 'EUR / INR', unit: 'PER EUR'    },
      { code: 'GBP_INR', label: 'GBP / INR', unit: 'PER GBP'   },
      { code: 'AED_INR', label: 'AED / INR', unit: 'PER AED'    },
      { code: 'CNY_INR', label: 'CNY / INR', unit: 'PER CNY'    },
      { code: 'JPY_INR', label: 'JPY / INR', unit: 'PER 100 ¥' },
      { code: 'SGD_INR', label: 'SGD / INR', unit: 'PER SGD'    },
    ],
  },


  // ══════════════════════════════════════════════════════════════════════════
  //  4. WEATHER API  (Open-Meteo — free, no key required)
  //     Add cities by appending to the CITIES array.
  //     lat/lng: decimal degrees. Get from maps.google.com.
  // ══════════════════════════════════════════════════════════════════════════
  WEATHER: {
    endpoint    : 'https://api.open-meteo.com/v1/forecast',
    // Parameters fetched per city — see open-meteo.com/en/docs
    params      : 'current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&forecast_days=1&timezone=Asia%2FKolkata',
    // Weather code → emoji mapping (WMO standard codes)
    icons: {
      0:'☀️', 1:'🌤', 2:'⛅', 3:'☁️',
      45:'🌫', 51:'🌦', 61:'🌧', 63:'🌧', 65:'🌧',
      71:'❄️', 80:'🌩', 95:'⛈',
    },
    // Indian cities to monitor
    // To add a city: { name, lat, lon, capital? }
    CITIES: [
      { name: 'DELHI',     lat: 28.6139, lon: 77.2090, capital: true  },
      { name: 'MUMBAI',    lat: 19.0760, lon: 72.8777                  },
      { name: 'BENGALURU', lat: 12.9716, lon: 77.5946                  },
      { name: 'CHENNAI',   lat: 13.0827, lon: 80.2707                  },
      { name: 'KOLKATA',   lat: 22.5726, lon: 88.3639                  },
      { name: 'HYDERABAD', lat: 17.3850, lon: 78.4867                  },
      { name: 'AHMEDABAD', lat: 23.0225, lon: 72.5714                  },
      { name: 'PUNE',      lat: 18.5204, lon: 73.8567                  },
      { name: 'JAIPUR',    lat: 26.9124, lon: 75.7873                  },
      { name: 'LUCKNOW',   lat: 26.8467, lon: 80.9462                  },
    ],
  },


  // ══════════════════════════════════════════════════════════════════════════
  //  5. RSS FEEDS
  //     Four categories × multiple sources each.
  //     To add a feed: append { url, source } to any category array.
  //     To disable a feed temporarily: add  active: false
  //     Items fetched per feed: controlled by itemsPerFeed below.
  // ══════════════════════════════════════════════════════════════════════════
  FEEDS: {
    itemsPerFeed    : 8,    // Max headlines pulled from each RSS feed
    itemsPerCategory: 12,   // Max headlines kept per category after merge

    world: [
      { url: 'https://feeds.bbci.co.uk/news/world/rss.xml',                   source: 'BBC WORLD'   },
      { url: 'https://www.aljazeera.com/xml/rss/all.xml',                      source: 'AL JAZEERA'  },
      { url: 'https://feeds.reuters.com/reuters/INtopNews',                    source: 'REUTERS IN'  },
      { url: 'https://www.thehindu.com/news/national/feeder/default.rss',         source: 'THE HINDU'  },
      { url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',        source: 'NYT WORLD'   },
    ],

    asia: [
      { url: 'https://feeds.bbci.co.uk/news/world/asia/rss.xml',              source: 'BBC ASIA'    },
      { url: 'https://rss.nytimes.com/services/xml/rss/nyt/AsiaPacific.xml',  source: 'NYT ASIA'    },
      { url: 'https://www.aljazeera.com/xml/rss/asia.xml',                     source: 'AJ ASIA'     },
    ],

    india: [
      { url: 'https://feeds.ndtv.com/ndtvnews-top-stories',                    source: 'NDTV'        },
      { url: 'https://www.thehindu.com/feeder/default.rss',                    source: 'THE HINDU'   },
      { url: 'https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml',source: 'HT'          },
      { url: 'https://feeds.feedburner.com/timesofindia/home',                 source: 'TIMES OF INDIA'},
      { url: 'https://www.indiatoday.in/rss/home',                             source: 'INDIA TODAY' },
    ],

    business: [
      { url: 'https://economictimes.indiatimes.com/rssfeedstopstories.cms',    source: 'ECON TIMES'  },
      { url: 'https://www.livemint.com/rss/economy',                           source: 'LIVEMINT'    },
      { url: 'https://www.moneycontrol.com/rss/marketreports.xml',             source: 'MONEYCONTROL'},
      { url: 'https://www.businesstoday.in/rss/home',                          source: 'BIZ TODAY'   },
      { url: 'https://www.financialexpress.com/feed/',                         source: 'FIN EXPRESS'  },
    ],
  },


  // ══════════════════════════════════════════════════════════════════════════
  //  6. PREDICTION ENGINE — SEVERITY SCALE
  //     Controls how many agents are spawned based on how serious
  //     today's news + market data is.
  //
  //     agents  = total Indian personas simulated
  //     rounds  = how many debate rounds they go through
  //     panels  = total Claude API calls (each call = 25-40 agents)
  //     Claude cost per run ≈ panels × ~₹1.5 per call
  // ══════════════════════════════════════════════════════════════════════════
  SEVERITY: {
    1: {
      label      : 'LOW',
      agents     : 50,
      rounds     : 2,
      panels     : 2,
      description: 'Routine market day, minor news cycle',
      costEstimate: '~₹5 per full run',
    },
    2: {
      label      : 'MEDIUM',
      agents     : 150,
      rounds     : 3,
      panels     : 5,
      description: 'Notable event, moderate cross-sector impact',
      costEstimate: '~₹20 per full run',
    },
    3: {
      label      : 'HIGH',
      agents     : 300,
      rounds     : 4,
      panels     : 8,
      description: 'Significant event, multiple sectors affected',
      costEstimate: '~₹50 per full run',
    },
    4: {
      label      : 'CRITICAL',
      agents     : 500,
      rounds     : 5,
      panels     : 12,
      description: 'Crisis-level event, systemic India impact',
      costEstimate: '~₹80 per full run',
    },
  },

  // Triggers used to auto-detect severity from live data
  SEVERITY_TRIGGERS: {
    critical_keywords : /war|nuclear|missile|coup|ceasefire|terrorist attack|airstrike|genocide/i,
    high_keywords     : /conflict|border standoff|sanction|military|troops|armed|fed rate|rate hike|crash|bankrupt/i,
    medium_keywords   : /tension|protest|strike|blockade|dispute|ban|election|budget|rbi|repo/i,
    sensex_high_pct   : 3.0,    // % move triggers CRITICAL
    sensex_medium_pct : 1.5,    // % move triggers HIGH
    sensex_low_pct    : 0.75,   // % move triggers MEDIUM
    commodity_spikes_critical: 4, // number of commodities spiking → CRITICAL
    commodity_spikes_high    : 2, // number of commodities spiking → HIGH
    conflict_high_critical   : 3, // number of HIGH conflict events → CRITICAL
    conflict_high_medium     : 1, // number of HIGH conflict events → MEDIUM
  },


  // ══════════════════════════════════════════════════════════════════════════
  //  7. PERSONAS — 28 Indian Agent Archetypes
  //     These are the "people" Claude plays during simulations.
  //     Each has: id, name, background, and inherent bias.
  //
  //     To add a persona: append a new object with id/name/bg/bias.
  //     To adjust weighting per topic: edit TOPIC_WEIGHTS below.
  // ══════════════════════════════════════════════════════════════════════════
  PERSONAS: [
    // ── FINANCIAL ─────────────────────────────────────────────────────────
    {
      id  : 'fii_trader',
      name: 'FII Portfolio Manager',
      bg  : 'Mumbai-based, manages $2B India exposure, risk-first mindset, watches Fed and RBI every day',
      bias: 'Macro-driven, sells on uncertainty, bullish on IT and pharma exports',
    },
    {
      id  : 'dii_fund',
      name: 'DII Mutual Fund Manager',
      bg  : 'Manages domestic equity fund, ₹15,000 Cr AUM, long-only, buys dips, focuses on India consumption story',
      bias: 'Structurally bullish India, sector-rotates, cautious on global spillovers',
    },
    {
      id  : 'retail_zerodha',
      name: 'Retail Trader — Zerodha',
      bg  : 'Pune, 29 years old, trades F&O part-time, follows Zee Business, highly momentum-driven',
      bias: 'Reactive, FOMO-prone, leveraged, herds with social media sentiment',
    },
    {
      id  : 'rbi_analyst',
      name: 'RBI Deputy Governor',
      bg  : 'Manages monetary policy, watches CPI/WPI closely, coordinates with Finance Ministry',
      bias: 'Inflation hawk, cautious on rate cuts, defends rupee stability above all',
    },
    {
      id  : 'sebi_officer',
      name: 'SEBI Market Analyst',
      bg  : 'Tracks F&O activity, circuit breakers, FII flow data daily',
      bias: 'Regulatory caution, suspicious of sharp moves, watches for market manipulation',
    },
    {
      id  : 'ca_advisor',
      name: 'Chartered Accountant — HNI Advisor',
      bg  : 'Delhi-based, advises 200+ HNI clients, deep tax knowledge, tracks Budget and GST',
      bias: 'Tax-efficiency first, advises sell-on-rally to book gains, prefers real estate',
    },

    // ── AGRICULTURE & RURAL ───────────────────────────────────────────────
    {
      id  : 'mh_farmer',
      name: 'Maharashtra Farmer — Onion',
      bg  : 'Nashik district, 3 acres onion + soybean, heavy debt, watches Agmarknet daily',
      bias: 'Pro-MSP, suspicious of APMC reform, sells early due to cash need, anti-export ban',
    },
    {
      id  : 'punjab_farmer',
      name: 'Punjab Wheat Farmer',
      bg  : 'Ludhiana, 12 acres, heavily mechanised, depends on MSP procurement',
      bias: 'Strongly pro-MSP, pro-BKU, anti-corporate farming, expects government support always',
    },
    {
      id  : 'kisan_broker',
      name: 'APMC Mandi Broker',
      bg  : 'Lasalgaon Maharashtra, middleman in 50 transactions/day, tracks seasonal patterns',
      bias: 'Profits from price volatility, resists direct-to-consumer models',
    },
    {
      id  : 'agri_economist',
      name: 'ICAR Agricultural Economist',
      bg  : 'Delhi-based researcher, 20 years of crop data, models monsoon and production forecasts',
      bias: 'Data-driven, skeptical of short-term predictions, tracks El Niño very closely',
    },

    // ── INDUSTRY & TRADE ─────────────────────────────────────────────────
    {
      id  : 'it_cto',
      name: 'IT Company CTO — Bengaluru',
      bg  : 'Manages 8,000 engineers, major US/EU clients, USD revenue, watches Fed and H1B policy',
      bias: 'Bearish on INR strength, bullish on AI spending, nervous about US recession signals',
    },
    {
      id  : 'pharma_cfo',
      name: 'Pharma CFO — Hyderabad',
      bg  : 'Generic drug exporter, $400M revenue, tracks USFDA audits and China API import cost',
      bias: 'Worried about China API prices, bullish on US generic market expansion',
    },
    {
      id  : 'steel_md',
      name: 'Steel Plant MD — Jharkhand',
      bg  : 'Runs 2MT plant, watches iron ore and coking coal prices, infrastructure customer base',
      bias: 'Closely tracks China steel output, worried about cheap Chinese imports undercutting',
    },
    {
      id  : 'msme_owner',
      name: 'MSME Owner — Surat Textiles',
      bg  : '200-person weaving unit, exports to Middle East, tracks USD/INR and cotton prices',
      bias: 'Pro-export incentives, wants simpler GST, depends on Gulf demand cycles',
    },
    {
      id  : 'startup_founder',
      name: 'Deep Tech Startup Founder',
      bg  : 'Bengaluru, Series B AI/SaaS, US and India clients, raises in USD, spends in INR',
      bias: 'Globally oriented, positive on India growth story, concerned about talent cost inflation',
    },

    // ── CONSUMERS & COMMON MAN ────────────────────────────────────────────
    {
      id  : 'delhi_homemaker',
      name: 'Middle-Class Delhi Homemaker',
      bg  : 'Household budget ₹40k/month, tracks vegetable prices daily, 2 school children',
      bias: 'Highly price-sensitive on food and fuel, trusts WhatsApp news, votes on price stability',
    },
    {
      id  : 'mumbai_cabdriver',
      name: 'Mumbai Ola/Uber Driver',
      bg  : 'Owns car on loan, watches petrol price daily, rent ₹15k, family in UP',
      bias: 'Directly impacted by fuel prices, positive on EV subsidies, angry at toll costs',
    },
    {
      id  : 'chennai_engineer',
      name: 'Chennai IT Engineer — TCS',
      bg  : '28-year-old, ₹14 LPA, buying first home on EMI, tracks RBI rate decisions closely',
      bias: 'Rate cuts critical for home loan EMI, bullish on Chennai real estate',
    },
    {
      id  : 'kolkata_teacher',
      name: 'Kolkata Government Teacher',
      bg  : '₹35k/month DA-revised salary, rents flat, watches dearness allowance and pension policy',
      bias: 'Inflation hawk from personal budget perspective, pro-government stability',
    },
    {
      id  : 'rural_laborer',
      name: 'MGNREGA Rural Daily Wager',
      bg  : 'UP, earns ₹250/day, depends on MGNREGA, buys atta, dal, cooking oil',
      bias: 'Tracks food prices and scheme payments, high distrust of formal finance',
    },

    // ── GEOPOLITICAL & POLICY ─────────────────────────────────────────────
    {
      id  : 'mea_officer',
      name: 'MEA Foreign Policy Analyst',
      bg  : 'Tracks China border, Pakistan situation, Gulf relations, US tech export controls',
      bias: 'National security lens, cautious on over-dependence on China, pro-Gulf engagement',
    },
    {
      id  : 'bjp_strategist',
      name: 'BJP Political Strategist',
      bg  : 'Watches state election polling, welfare scheme delivery, Modi brand impact',
      bias: 'Frames everything through electoral impact, pro-business but population-facing narrative',
    },
    {
      id  : 'opposition_mp',
      name: 'Opposition Party MP',
      bg  : 'Rajya Sabha, tracks unemployment data, price rises, inequality metrics for speeches',
      bias: 'Amplifies negative economic data, skeptical of official GDP and inflation numbers',
    },
    {
      id  : 'iim_professor',
      name: 'IIM Ahmedabad Economics Professor',
      bg  : '20-year career, publishes in EPW, tracks informal economy and labour data',
      bias: 'Data-driven skeptic, questions growth narrative, tracks real vs nominal metrics',
    },
    {
      id  : 'retired_ias',
      name: 'Retired IAS Officer — Delhi',
      bg  : 'Former Finance Ministry, now think-tank, institutional memory of 1991 and 2008 crisis',
      bias: 'Cautious on fiscal slippage, respects RBI independence, fears repeat of past crises',
    },

    // ── GLOBAL / DIASPORA ─────────────────────────────────────────────────
    {
      id  : 'nri_investor',
      name: 'NRI Investor — Dubai',
      bg  : '₹2 Cr in India mutual funds, watches INR closely, sends remittances monthly',
      bias: 'Bullish long-term India, worried about INR depreciation eating USD returns',
    },
    {
      id  : 'us_fund_analyst',
      name: 'US Emerging Market Analyst',
      bg  : 'New York, covers India in EM fund, reads RBI minutes and Budget quarterly',
      bias: 'India allocation depends on USD/INR and EM flows globally, cautious when dollar strengthens',
    },
    {
      id  : 'gulf_worker',
      name: 'Kerala Gulf Migrant Worker',
      bg  : 'Electrician in Dubai, sends ₹25k/month home, watches AED/INR rate',
      bias: 'AED/INR appreciation positive, remittance costs matter, worried about Gulf job security',
    },
  ],

  // Which personas are prioritised per simulation topic
  // (others are still included but ranked lower)
  TOPIC_WEIGHTS: {
    markets    : ['fii_trader','dii_fund','retail_zerodha','rbi_analyst','sebi_officer',
                  'us_fund_analyst','nri_investor','ca_advisor','startup_founder','it_cto','iim_professor'],
    commodities: ['mh_farmer','punjab_farmer','kisan_broker','agri_economist','delhi_homemaker',
                  'mumbai_cabdriver','rural_laborer','msme_owner','steel_md','rbi_analyst','kolkata_teacher'],
    policy     : ['bjp_strategist','opposition_mp','retired_ias','iim_professor','rbi_analyst',
                  'mea_officer','ca_advisor','agri_economist','it_cto','kolkata_teacher','rural_laborer'],
  },


  // ══════════════════════════════════════════════════════════════════════════
  //  8. CONFLICT EVENTS (Static baseline — updated by AI brief when live)
  //     These appear as red/orange/amber markers on the map.
  //     level: 'high' | 'medium' | 'watch'
  //     lat/lng: map coordinates for the marker
  // ══════════════════════════════════════════════════════════════════════════
  CONFLICT_EVENTS: [
    {
      lat   : 34.0837, lng: 74.7973,
      level : 'high',
      name  : 'LINE OF CONTROL — J&K',
      note  : 'Border activity reported. Security forces on alert.',
      sector: 'Defence',
    },
    {
      lat   : 27.6915, lng: 92.3655,
      level : 'high',
      name  : 'ARUNACHAL — CHINA LAC',
      note  : 'PLA activity near LAC. Satellite surveillance elevated.',
      sector: 'Defence, Trade',
    },
    {
      lat   : 24.6637, lng: 93.9063,
      level : 'medium',
      name  : 'MANIPUR — NORTHEAST',
      note  : 'Ethnic tensions. Inter-community talks ongoing.',
      sector: 'Internal Security',
    },
    {
      lat   : 23.6102, lng: 85.2799,
      level : 'medium',
      name  : 'JHARKHAND — NAXAL BELT',
      note  : 'Maoist activity in remote districts. Supply chain disrupted.',
      sector: 'Mining, Infrastructure',
    },
    {
      lat   : 21.0000, lng: 81.0000,
      level : 'medium',
      name  : 'CHHATTISGARH — LWE ZONE',
      note  : 'Left-wing extremism operations. Road construction disrupted.',
      sector: 'Infrastructure',
    },
    {
      lat   : 28.6139, lng: 77.2090,
      level : 'watch',
      name  : 'DELHI — AIR QUALITY',
      note  : 'AQI monitoring. Schools on alert in peak season.',
      sector: 'Health, Transport',
    },
    {
      lat   : 22.5726, lng: 88.3639,
      level : 'watch',
      name  : 'WEST BENGAL — BORDER',
      note  : 'Bangladesh migration pressure. BSF deployment increased.',
      sector: 'Immigration, Trade',
    },
  ],


  // ══════════════════════════════════════════════════════════════════════════
  //  9. STATE IMPACT DATA (Static baseline — overridden by AI brief when live)
  //     Displayed in the State Impact Table on the right panel.
  //     alert: 'high' | 'medium' | 'positive' | 'watch'
  // ══════════════════════════════════════════════════════════════════════════
  STATE_DATA: [
    { flag: '🏔️', state: 'J&K / Ladakh',     alert: 'high',     event: 'LAC border standoff with PLA',                  sector: 'Defence, Tourism'          },
    { flag: '🌾', state: 'Punjab / Haryana',  alert: 'medium',   event: 'Farmer MSP protests resuming',                  sector: 'Agriculture'               },
    { flag: '💹', state: 'Maharashtra',       alert: 'watch',    event: 'Sensex volatility, FPI outflows',               sector: 'Finance, Pharma'           },
    { flag: '🧵', state: 'Tamil Nadu',        alert: 'positive', event: 'Apple supply chain expansion',                  sector: 'Electronics, Textiles'     },
    { flag: '💻', state: 'Karnataka',         alert: 'positive', event: 'AI startup investments surge',                  sector: 'IT Services'               },
    { flag: '🛢️', state: 'Gujarat',           alert: 'watch',    event: 'Petrochemical price pressures',                 sector: 'Energy, Chemicals'         },
    { flag: '🔩', state: 'Jharkhand/Odisha',  alert: 'medium',   event: 'Iron ore export restrictions possible',         sector: 'Steel, Mining'             },
    { flag: '🌿', state: 'West Bengal',       alert: 'watch',    event: 'Bangladesh border trade disruption',            sector: 'Border Trade, Jute'        },
    { flag: '☀️', state: 'Rajasthan',         alert: 'positive', event: 'Renewable energy capacity milestone',           sector: 'Solar, Wind Energy'        },
    { flag: '🌴', state: 'Kerala',            alert: 'medium',   event: 'Gulf remittance flows declining -8%',           sector: 'Real Estate, Remittances'  },
    { flag: '🏗️', state: 'Andhra Pradesh',   alert: 'watch',    event: 'New capital construction underway',             sector: 'Infrastructure'            },
    { flag: '🌊', state: 'Odisha',            alert: 'medium',   event: 'Cyclone preparedness, port closures likely',    sector: 'Shipping, Fisheries'       },
  ],


  // ══════════════════════════════════════════════════════════════════════════
  //  10. FALLBACK DATA
  //      Used in demo mode (no server) so the dashboard looks live
  //      even before real data is fetched.
  //      Update these occasionally so demos look realistic.
  // ══════════════════════════════════════════════════════════════════════════
  FALLBACK: {
    markets: {
      sensex : { value: 73842, change: 312.4,  changePct:  0.43 },
      nifty  : { value: 22389, change:  98.2,  changePct:  0.44 },
      wti    : { value: 77.85, change:  -0.92                   },
      brent  : { value: 81.40, change:  -0.74                   },
    },
    fx: {
      USD_INR: 84.23,
      EUR_INR: 91.47,
      GBP_INR: 107.18,
      AED_INR: 22.94,
      CNY_INR: 11.62,
      JPY_INR: 0.5620,
      SGD_INR: 62.85,
    },
    commodities: [
      { icon: '⛽', name: 'PETROL',      unit: '/L',   price: '₹94.7',  chg: '+0.2',  dir: 'up'   },
      { icon: '🚛', name: 'DIESEL',      unit: '/L',   price: '₹87.3',  chg: 'stable',dir: 'flat' },
      { icon: '🌾', name: 'ATTA / KG',   unit: '',     price: '₹38',    chg: '+₹2',   dir: 'up'   },
      { icon: '🍚', name: 'RICE / KG',   unit: '',     price: '₹42',    chg: '-₹1',   dir: 'dn'   },
      { icon: '🧅', name: 'ONION / KG',  unit: '',     price: '₹55',    chg: '+₹27',  dir: 'up'   },
      { icon: '🍅', name: 'TOMATO / KG', unit: '',     price: '₹35',    chg: '+₹8',   dir: 'up'   },
      { icon: '🌿', name: 'TOOR DAL',    unit: '/kg',  price: '₹155',   chg: '+₹18',  dir: 'up'   },
      { icon: '🫙', name: 'EDIBLE OIL',  unit: '/L',   price: '₹145',   chg: '+₹12',  dir: 'up'   },
      { icon: '🥛', name: 'MILK / L',    unit: '',     price: '₹60',    chg: 'stable',dir: 'flat' },
      { icon: '🔥', name: 'LPG 14KG',    unit: '',     price: '₹903',   chg: 'stable',dir: 'flat' },
    ],
  },


  // ══════════════════════════════════════════════════════════════════════════
  //  11. CLIENT — Browser settings
  //      Controls how the browser-side JS behaves.
  //      SERVER_BASE auto-detects in browser (window.location.origin).
  // ══════════════════════════════════════════════════════════════════════════
  CLIENT: {
    // Change this to your production domain when deploying
    // e.g. 'https://bharatwatch.in'
    // Leave empty — the browser auto-uses window.location.origin
    SERVER_BASE: '',

    // API endpoint paths — all relative to SERVER_BASE
    API: {
      status         : '/api/status',
      fx             : '/api/fx',
      weather        : '/api/weather',
      markets        : '/api/markets',
      news           : '/api/news',
      commodities    : '/api/commodities',
      aiBrief        : '/api/ai-brief',
      refresh        : '/api/refresh',
      predictStatus  : '/api/predict/status',
      predict        : '/api/predict',   // + /:topic
    },

    // How long the browser waits before auto-refreshing from server
    // Should match SERVER.cacheTTL_ms
    refreshInterval_ms: 60 * 60 * 1000,

    // Polling interval when waiting for a prediction simulation to finish
    predictionPollInterval_ms: 8_000,

    // Max number of news items shown per tab
    maxNewsItems: 20,

    // CORS proxy for demo mode (when no server is running)
    corsProxy         : 'https://api.allorigins.win/get?url=',
    corsProxyFallback : 'https://api.codetabs.com/v1/proxy?quest=',
  },

};

  // ══════════════════════════════════════════════════════════════════════════
  //  12. SCRAPER
  //     Controls the web scraping layer that runs alongside RSS feeds.
  //     Scrapers extract data from sites that have no RSS or API.
  //
  //     STRATEGY OPTIONS per target:
  //       'direct'     → plain HTTP fetch + Cheerio (fastest)
  //       'proxy'      → route through allorigins.win (for CORS/blocked sites)
  //       'llm'        → LLM extracts structured data from raw HTML
  //       'auto'       → try direct → proxy → llm in order
  //
  //     ENABLED FLAG:
  //       Set scraper.enabled = false to disable all scraping (RSS-only mode)
  //       Set individual target.enabled = false to disable one scraper
  // ══════════════════════════════════════════════════════════════════════════
  SCRAPER: {

    // Master switch — set false to run RSS-only mode
    enabled: true,

    // Minimum delay between requests to the SAME domain (ms)
    // Override per-target in SCRAPE_TARGETS inside scraper.js
    defaultRateLimit_ms: 60_000,

    // Random jitter added on top of rate limit (0 to this value)
    jitter_ms: 3_000,

    // Max retries per target before giving up
    maxRetries: 2,

    // HTTP request timeout per attempt
    requestTimeout_ms: 20_000,

    // How many consecutive failures before circuit breaker opens
    circuitBreakerThreshold: 3,

    // How long circuit breaker stays open before reset
    circuitBreakerReset_ms: 15 * 60_000,

    // CORS proxy URLs (tried in order when direct fetch fails)
    proxies: [
      'https://api.allorigins.win/get?url=',
      'https://api.codetabs.com/v1/proxy?quest=',
    ],

    // Which scrapers to run in each hourly refresh cycle
    schedule: {
      mandiPrices : true,   // Agmarknet commodity prices
      fuelPrices  : true,   // Goodreturns petrol/diesel
      marketIndices: true,  // Moneycontrol/Yahoo Finance
      govAlerts   : true,   // RBI, SEBI, NDMA
      newsFallback: false,  // Only enable if RSS feeds are failing
    },

    // Commodities to track on Agmarknet
    mandiCommodities: ['onion', 'tomato', 'potato'],

    // Cities for fuel price tracking
    fuelCities: ['Delhi', 'Mumbai', 'Chennai', 'Kolkata', 'Bengaluru', 'Hyderabad', 'Ahmedabad', 'Pune'],

    // Whether to use LLM extraction as final fallback when Cheerio fails
    useLlmFallback: true,
  },

// ── Export for Node.js (server.js, prediction-engine.js) ────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}

// ── Export for browser (index.html via <script src="bharat-watch.config.js">)
if (typeof window !== 'undefined') {
  window.BW_CONFIG = CONFIG;
}
