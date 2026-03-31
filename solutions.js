'use strict';
const express  = require('express');
const router   = express.Router();
const Cache    = require('../../core/cache');
const { generateSolutions, generateAllSolutions, getQuickSolutions, CITIZEN_SOLUTION_MAP } = require('../../intelligence/solutions-engine');
const { runPatternDetection, KNOWN_PATTERNS, THRESHOLDS } = require('../../intelligence/pattern-detector');

// ── SOLUTIONS ROUTES ──────────────────────────────────────────────────────

// GET /api/solutions/citizen-types — list all supported citizen types
router.get('/citizen-types', (req, res) => {
  res.json({
    types: Object.entries(CITIZEN_SOLUTION_MAP).map(([type, profile]) => ({
      type,
      govSchemes  : profile.govSchemes,
      exampleCases: profile.examples_from,
    })),
  });
});

// GET /api/solutions/quick?type=homemaker
// Quick solution set for the most urgent current impact
router.get('/quick', async (req, res) => {
  const citizenType = req.query.type || 'homemaker';
  if (!CITIZEN_SOLUTION_MAP[citizenType])
    return res.status(400).json({ error: `Invalid citizen type. Use: ${Object.keys(CITIZEN_SOLUTION_MAP).join(', ')}` });

  // Check cache first
  const cached = Cache.read(`solutions-quick-${citizenType}`);
  if (cached && Cache.isFresh(`solutions-quick-${citizenType}`)) {
    return res.json({ ...cached, cached: true });
  }

  try {
    const solutions = await getQuickSolutions(citizenType);
    Cache.write(`solutions-quick-${citizenType}`, solutions, { source: 'solutions-engine' });
    res.json({ ...solutions, cached: false });
  } catch(e) {
    res.status(503).json({ error: e.message });
  }
});

// POST /api/solutions/generate
// Body: { citizenType, state, city, impact (optional) }
// Generates full solution set for a specific citizen + location + optional custom impact
router.post('/generate', async (req, res) => {
  const { citizenType='homemaker', state='India', city='', impact } = req.body || {};

  if (!CITIZEN_SOLUTION_MAP[citizenType])
    return res.status(400).json({ error: `Invalid citizen type. Valid: ${Object.keys(CITIZEN_SOLUTION_MAP).join(', ')}` });

  res.json({ message: 'Generating solutions...', startedAt: new Date().toISOString() });

  try {
    const solutions = impact
      ? await generateSolutions(impact, citizenType, { state, city })
      : await generateAllSolutions(citizenType, { state, city });

    // Cache is written inside the engine
    // Client should poll /api/solutions/cached/:type/:state
  } catch(e) {
    // Cached error — next poll will get it
    Cache.write(`solutions-${citizenType}-${state.toLowerCase().replace(/\s/g,'-')}`,
      { error: e.message }, { source: 'solutions-engine' });
  }
});

// GET /api/solutions/cached/:type/:state
// Returns cached solution set for a citizen type + state
router.get('/cached/:type/:state', (req, res) => {
  const { type, state } = req.params;
  const key   = `solutions-${type}-${state.toLowerCase().replace(/\s/g,'-')}`;
  const entry = Cache.read(key);
  if (!entry) return res.status(404).json({ error: 'No cached solutions. POST /api/solutions/generate first.' });
  res.json({ ...entry, fresh: Cache.isFresh(key), ageMs: Cache.ageMs(key) });
});

// GET /api/solutions/impact/:topic
// Returns solutions specifically for a prediction topic outcome
router.get('/impact/:topic', async (req, res) => {
  const { topic }      = req.params;
  const citizenType    = req.query.type || 'homemaker';
  const predictionData = Cache.read(`pred-${topic}`)?.data;

  if (!predictionData) {
    return res.status(503).json({
      error  : `No prediction for '${topic}' yet`,
      action : `POST /api/predict/${topic}/run first`,
    });
  }

  try {
    const impact    = predictionData.headline || `${topic} forecast: ${predictionData.direction}`;
    const solutions = await generateSolutions(impact, citizenType, {});
    res.json(solutions);
  } catch(e) {
    res.status(503).json({ error: e.message });
  }
});

// ── PATTERN DETECTION ROUTES ─────────────────────────────────────────────

// GET /api/patterns — latest pattern detection results
router.get('/', (req, res) => {
  const entry = Cache.read('pattern-alerts');
  if (!entry) return res.status(503).json({
    error  : 'Pattern scan not run yet',
    action : 'POST /api/patterns/run',
  });
  res.json({ ...entry, fresh: Cache.isFresh('pattern-alerts'), ageMs: Cache.ageMs('pattern-alerts') });
});

// Note: this is for /api/patterns/ but express mounts it under a parent — see server.js

// POST /api/patterns/run — trigger a fresh pattern detection scan
router.post('/run', (req, res) => {
  res.json({ message: 'Pattern detection scan started', startedAt: new Date().toISOString() });
  runPatternDetection()
    .then(r => L.ok(`Scan done: ${r.summary.totalAlerts} alerts`))
    .catch(e => console.error('[PATTERNS]', e.message));
});

// GET /api/patterns/known — list all known manipulation patterns with explanations
router.get('/known', (req, res) => {
  res.json({
    patterns   : KNOWN_PATTERNS,
    thresholds : THRESHOLDS,
    description: 'Known price manipulation, cartel, and corruption patterns tracked by Bharat Watch Engine',
  });
});

// GET /api/patterns/commodity/:name — pattern history for one commodity
router.get('/commodity/:name', (req, res) => {
  const entry = Cache.read('pattern-alerts');
  if (!entry) return res.status(503).json({ error: 'No scan results yet' });

  const name    = req.params.name.toLowerCase();
  const alerts  = [
    ...(entry.data?.ruleBasedAlerts || []),
    ...(entry.data?.llmAnalysis?.anomalies_found || []),
  ].filter(a => JSON.stringify(a).toLowerCase().includes(name));

  res.json({ commodity: req.params.name, alerts, knownPatterns: KNOWN_PATTERNS.filter(p => p.id.includes(name)) });
});

// For logger reference in routes
const { makeLogger } = require('../../core/logger');
const L = makeLogger('SOLUTIONS-API');

module.exports = router;
