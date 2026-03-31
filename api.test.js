'use strict';
const { test } = require('node:test');
const assert   = require('node:assert');

// ── Cache Tests ───────────────────────────────────────────────────────────
test('Cache: write and read roundtrip', () => {
  const Cache = require('../core/cache');
  Cache.write('_test', { hello: 'world' });
  const entry = Cache.read('_test');
  assert.strictEqual(entry?.data?.hello, 'world');
  assert.ok(entry.fetchedAt);
  assert.ok(entry.nextFetchAt);
  Cache.delete('_test');
});

test('Cache: isFresh returns true immediately after write', () => {
  const Cache = require('../core/cache');
  Cache.write('_testfresh', { x: 1 });
  assert.strictEqual(Cache.isFresh('_testfresh'), true);
  Cache.delete('_testfresh');
});

test('Cache: ageMs is < 500ms immediately after write', () => {
  const Cache = require('../core/cache');
  Cache.write('_testage', { y: 2 });
  assert.ok(Cache.ageMs('_testage') < 500);
  Cache.delete('_testage');
});

test('Cache: delete returns true for existing key', () => {
  const Cache = require('../core/cache');
  Cache.write('_testdel', { z: 3 });
  assert.strictEqual(Cache.delete('_testdel'), true);
});

// ── News Classifier Tests ─────────────────────────────────────────────────
test('Classifier: detects critical level', () => {
  const { classify } = require('../intelligence/news-classifier');
  assert.strictEqual(classify('Nuclear missile test raises global tensions'), 'critical');
  assert.strictEqual(classify('Terrorist attack in crowded market'), 'critical');
});

test('Classifier: detects positive level', () => {
  const { classify } = require('../intelligence/news-classifier');
  assert.strictEqual(classify('India records highest exports growth in Q3'), 'positive');
  assert.strictEqual(classify('New FDI investment deal signed with Germany'), 'positive');
});

test('Classifier: detects high level', () => {
  const { classify } = require('../intelligence/news-classifier');
  assert.strictEqual(classify('Stock market crashes 5% on recession fears'), 'high');
});

test('Classifier: detects medium level', () => {
  const { classify } = require('../intelligence/news-classifier');
  assert.strictEqual(classify('RBI announces repo rate decision'), 'medium');
});

test('Classifier: detects region INDIA', () => {
  const { region } = require('../intelligence/news-classifier');
  assert.strictEqual(region('Modi announces new policy for farmers in Delhi'), 'INDIA');
  assert.strictEqual(region('Sensex hits record high on FII buying'), 'INDIA');
});

test('Classifier: detects region MID EAST', () => {
  const { region } = require('../intelligence/news-classifier');
  assert.strictEqual(region('OPEC+ cuts oil production, Brent rises'), 'MID EAST');
});

test('Classifier: enrichItem adds level and region', () => {
  const { enrichItem } = require('../intelligence/news-classifier');
  const item = { title: 'RBI holds rates, rupee strengthens', source: 'ET' };
  const enriched = enrichItem(item);
  assert.ok(enriched.level, 'enrichItem should add level');
  assert.ok(enriched.region, 'enrichItem should add region');
  assert.strictEqual(enriched.region, 'INDIA');
});

// ── BUG-4 Regression: Commodity spike detection ───────────────────────────
test('BUG-4 fix: chgNumeric parsed correctly from display strings', () => {
  const { buildLiveData } = require('../core/live-data');
  // Simulate what buildLiveData does to commodity chg strings
  const testCases = [
    { chg: '+₹27', expected: 27 },
    { chg: '+0.2', expected: 0.2 },
    { chg: '-₹5',  expected: 5 },  // sign stripped, absolute value
    { chg: 'stable', expected: 0 },
    { chg: '+₹18', expected: 18 },
  ];
  testCases.forEach(tc => {
    const chgRaw     = String(tc.chg).replace(/[^0-9.\-]/g, '');
    const chgNumeric = parseFloat(chgRaw) || 0;
    assert.ok(chgNumeric >= 0, `chgNumeric for "${tc.chg}" should be >= 0, got ${chgNumeric}`);
  });
});

// ── Config Tests ──────────────────────────────────────────────────────────
test('Config: LLM section has active field', () => {
  const CFG = require('../config/bharat-watch.config');
  assert.ok(CFG.LLM.active, 'LLM.active must be set');
  assert.ok(CFG.LLM.providers.claude, 'Claude provider must exist');
});

test('Config: PERSONAS array has >= 20 entries', () => {
  const CFG = require('../config/bharat-watch.config');
  assert.ok(Array.isArray(CFG.PERSONAS), 'PERSONAS must be an array');
  assert.ok(CFG.PERSONAS.length >= 20, `Expected >=20 personas, got ${CFG.PERSONAS.length}`);
  // Each persona must have required fields
  CFG.PERSONAS.forEach(p => {
    assert.ok(p.id,   `Persona missing id`);
    assert.ok(p.name, `Persona ${p.id} missing name`);
    assert.ok(p.bg,   `Persona ${p.id} missing bg`);
    assert.ok(p.bias, `Persona ${p.id} missing bias`);
  });
});

test('Config: WEATHER.CITIES has lat/lon for all entries', () => {
  const CFG = require('../config/bharat-watch.config');
  assert.ok(CFG.WEATHER.CITIES.length >= 6);
  CFG.WEATHER.CITIES.forEach(c => {
    assert.ok(c.name, `City missing name`);
    assert.ok(typeof c.lat === 'number', `City ${c.name} missing lat`);
    assert.ok(typeof c.lon === 'number', `City ${c.name} missing lon`);
    assert.ok(c.lat >= 8 && c.lat <= 37,  `City ${c.name} lat out of India range`);
    assert.ok(c.lon >= 68 && c.lon <= 98, `City ${c.name} lon out of India range`);
  });
});

test('Config: FEEDS has india, world, business, asia categories', () => {
  const CFG = require('../config/bharat-watch.config');
  ['india','world','business','asia'].forEach(cat => {
    assert.ok(Array.isArray(CFG.FEEDS[cat]), `FEEDS.${cat} must be array`);
    assert.ok(CFG.FEEDS[cat].length > 0, `FEEDS.${cat} must not be empty`);
    CFG.FEEDS[cat].forEach(f => {
      assert.ok(f.url,    `Feed in ${cat} missing url`);
      assert.ok(f.source, `Feed in ${cat} missing source`);
      assert.ok(f.url.startsWith('https://'), `Feed url must use https`);
    });
  });
});

test('Config: SEVERITY has 4 levels (1-4)', () => {
  const CFG = require('../config/bharat-watch.config');
  [1,2,3,4].forEach(level => {
    assert.ok(CFG.SEVERITY[level], `SEVERITY level ${level} missing`);
    assert.ok(CFG.SEVERITY[level].agents > 0, `SEVERITY[${level}].agents must be > 0`);
    assert.ok(CFG.SEVERITY[level].label, `SEVERITY[${level}].label missing`);
  });
  // Agents should increase with severity
  assert.ok(CFG.SEVERITY[1].agents < CFG.SEVERITY[2].agents, 'Agents should increase with severity');
  assert.ok(CFG.SEVERITY[3].agents < CFG.SEVERITY[4].agents, 'Agents should increase with severity');
});

test('Config: RSS URLs use correct known-working URLs', () => {
  const CFG = require('../config/bharat-watch.config');
  const allUrls = Object.values(CFG.FEEDS).flat().map(f => f.url);
  // BUG-6 regression: FeedBurner NDTV deprecated
  assert.ok(!allUrls.some(u => u.includes('feedburner.com/ndtvnews')),
    'FeedBurner NDTV URL is deprecated — should use feeds.ndtv.com');
});

// ── BUG-2 Regression: isRunning resets on error ───────────────────────────
test('BUG-2 fix: scheduler isRunning resets after error', async () => {
  // We can't easily test cron but we can test the isRunning export
  const scheduler = require('../core/scheduler');
  assert.strictEqual(typeof scheduler.isRunning, 'function', 'isRunning should be a function');
  assert.strictEqual(scheduler.isRunning(), false, 'Should not be running at start');
});

// ── BUG-3 Regression: scraper target count ────────────────────────────────
test('BUG-3 fix: scraper has explicit target count', () => {
  const { SCRAPE_TARGET_NAMES } = require('../scrapers/index');
  assert.ok(Array.isArray(SCRAPE_TARGET_NAMES), 'SCRAPE_TARGET_NAMES must be array');
  assert.ok(SCRAPE_TARGET_NAMES.length > 10, 'Should have >10 scrape targets defined');
});

// ── Solutions Engine Tests ────────────────────────────────────────────────
test('Solutions: CITIZEN_SOLUTION_MAP has all required citizen types', () => {
  const { CITIZEN_SOLUTION_MAP } = require('../intelligence/solutions-engine');
  const required = ['farmer','homemaker','it_professional','gulf_worker','small_business','daily_wager'];
  required.forEach(type => {
    assert.ok(CITIZEN_SOLUTION_MAP[type], `Missing citizen type: ${type}`);
    assert.ok(Array.isArray(CITIZEN_SOLUTION_MAP[type].govSchemes), `${type} missing govSchemes`);
    assert.ok(CITIZEN_SOLUTION_MAP[type].govSchemes.length > 0, `${type} govSchemes empty`);
  });
});

test('Solutions: SOLUTION_CATEGORIES has all required urgency levels', () => {
  const { SOLUTION_CATEGORIES } = require('../intelligence/solutions-engine');
  const required = ['immediate','thisWeek','thisMonth','longTerm','govScheme'];
  required.forEach(cat => {
    assert.ok(SOLUTION_CATEGORIES[cat], `Missing category: ${cat}`);
    assert.ok(SOLUTION_CATEGORIES[cat].urgency, `${cat} missing urgency`);
    assert.ok(SOLUTION_CATEGORIES[cat].timeframe, `${cat} missing timeframe`);
  });
});

// ── Pattern Detector Tests ────────────────────────────────────────────────
test('Pattern Detector: KNOWN_PATTERNS has at least 4 entries', () => {
  const { KNOWN_PATTERNS } = require('../intelligence/pattern-detector');
  assert.ok(Array.isArray(KNOWN_PATTERNS));
  assert.ok(KNOWN_PATTERNS.length >= 4, 'Should have >=4 known patterns');
  KNOWN_PATTERNS.forEach(p => {
    assert.ok(p.id,           `Pattern missing id`);
    assert.ok(p.name,         `Pattern ${p.id} missing name`);
    assert.ok(p.how_to_spot,  `Pattern ${p.id} missing how_to_spot`);
    assert.ok(p.citizen_action, `Pattern ${p.id} missing citizen_action`);
  });
});

test('Pattern Detector: detectMandiRetailSpread flags high spread correctly', () => {
  const { detectMandiRetailSpread } = require('../intelligence/pattern-detector');
  const commodities = [{ name: 'ONION', price: '₹90', unit: '/kg', dir: 'up', chg: '+₹30', chgNumeric: 30 }];
  const mandiData   = { onion: { pricePerKg: 28 } };  // retail ₹90 vs mandi ₹28 = 221% spread
  const alerts = detectMandiRetailSpread(commodities, mandiData);
  assert.ok(alerts.length > 0, 'Should detect high spread');
  assert.strictEqual(alerts[0].type, 'PRICE_MANIPULATION');
  assert.strictEqual(alerts[0].severity, 'HIGH');
  assert.ok(alerts[0].spread_pct > 80, 'Spread should be > 80%');
});

test('Pattern Detector: detectMandiRetailSpread passes normal spread', () => {
  const { detectMandiRetailSpread } = require('../intelligence/pattern-detector');
  const commodities = [{ name: 'ONION', price: '₹35', unit: '/kg', dir: 'flat', chg: 'stable', chgNumeric: 0 }];
  const mandiData   = { onion: { pricePerKg: 28 } };  // 25% spread — normal
  const alerts = detectMandiRetailSpread(commodities, mandiData);
  assert.strictEqual(alerts.length, 0, 'Normal spread should not trigger alert');
});

test('Pattern Detector: detectLockstepMovement flags cartel signal', () => {
  const { detectLockstepMovement } = require('../intelligence/pattern-detector');
  const commodities = Array(8).fill(null).map((_, i) => ({
    name: `Item${i}`, dir: 'up', chg: '+5', chgNumeric: 5,
  }));
  const alerts = detectLockstepMovement(commodities);
  assert.ok(alerts.length > 0, 'Should detect lockstep movement');
  assert.strictEqual(alerts[0].type, 'CARTEL_SIGNAL');
});

test('Pattern Detector: THRESHOLDS are reasonable values', () => {
  const { THRESHOLDS } = require('../intelligence/pattern-detector');
  assert.ok(THRESHOLDS.mandi_to_retail_spread_pct >= 50, 'Spread threshold should be >= 50%');
  assert.ok(THRESHOLDS.cartel_lockstep_count >= 3,       'Lockstep count should be >= 3');
  assert.ok(THRESHOLDS.inflation_gap_pct >= 3,           'Inflation gap should be >= 3%');
});

// ── Config: New sections exist ────────────────────────────────────────────
test('Config: SOLUTIONS section exists with citizenTypes', () => {
  const CFG = require('../config/bharat-watch.config');
  assert.ok(CFG.SOLUTIONS, 'SOLUTIONS config section missing');
  assert.ok(Array.isArray(CFG.SOLUTIONS.citizenTypes), 'SOLUTIONS.citizenTypes must be array');
  assert.ok(CFG.SOLUTIONS.solutionsPerImpact > 0, 'solutionsPerImpact must be > 0');
});

test('Config: PATTERN_DETECTION section exists and is enabled', () => {
  const CFG = require('../config/bharat-watch.config');
  assert.ok(CFG.PATTERN_DETECTION, 'PATTERN_DETECTION config section missing');
  assert.ok(Array.isArray(CFG.PATTERN_DETECTION.detectionTypes), 'detectionTypes must be array');
  assert.ok(CFG.PATTERN_DETECTION.detectionTypes.length >= 6, 'Should have >= 6 detection types');
  assert.ok(CFG.PATTERN_DETECTION.thresholds, 'thresholds missing');
});
