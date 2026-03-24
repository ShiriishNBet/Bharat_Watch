'use strict';
const express   = require('express');
const router    = express.Router();
const Cache     = require('../../core/cache');
const { buildLiveData } = require('../../core/live-data');   // FIX BUG-1: shared module
const { runPrediction, runAllPredictions, detectSeverity, SEVERITY_CONFIG } = require('../../intelligence/prediction-engine');

const running = { markets: false, commodities: false, policy: false };

// GET /api/predict/status
router.get('/status', (req, res) => {
  const liveData = buildLiveData();
  const severity = detectSeverity({
    news: liveData.news, markets: liveData.markets,
    commodities: liveData.commodities, conflictEvents: liveData.conflictEvents,
  });
  res.json({
    severity,
    severityLabel : SEVERITY_CONFIG[severity].label,
    severityDesc  : SEVERITY_CONFIG[severity].description,
    agentCount    : SEVERITY_CONFIG[severity].agents,
    costEstimate  : SEVERITY_CONFIG[severity].costEstimate,
    running,
    predictions: {
      markets    : Cache.read('pred-markets'),
      commodities: Cache.read('pred-commodities'),
      policy     : Cache.read('pred-policy'),
    },
    cacheInfo: {
      markets    : { fresh: Cache.isFresh('pred-markets'),     ageMs: Cache.ageMs('pred-markets') },
      commodities: { fresh: Cache.isFresh('pred-commodities'), ageMs: Cache.ageMs('pred-commodities') },
      policy     : { fresh: Cache.isFresh('pred-policy'),      ageMs: Cache.ageMs('pred-policy') },
    },
  });
});

// GET /api/predict/all
router.get('/all', (req, res) => {
  res.json({
    markets    : Cache.read('pred-markets'),
    commodities: Cache.read('pred-commodities'),
    policy     : Cache.read('pred-policy'),
  });
});

// GET /api/predict/:topic
router.get('/:topic', (req, res) => {
  const { topic } = req.params;
  if (!['markets','commodities','policy'].includes(topic))
    return res.status(400).json({ error: 'Invalid topic. Use: markets | commodities | policy | all' });
  const entry = Cache.read(`pred-${topic}`);
  if (!entry) return res.status(503).json({
    error  : `Prediction for '${topic}' not yet generated.`,
    action : `POST /api/predict/${topic}/run`,
    hint   : 'Predictions auto-run 5min after each hourly data refresh.',
  });
  res.json(entry);
});

// POST /api/predict/all/run
router.post('/all/run', (req, res) => {
  res.json({ message: 'All predictions started', startedAt: new Date().toISOString() });
  const liveData = buildLiveData();
  const topics   = ['markets','commodities','policy'];

  topics.forEach(topic => {
    if (running[topic]) return;
    running[topic] = true;
    runPrediction(topic, liveData, null)   // null claudeKey — uses env via llm-adapter
      .then(pred => Cache.write(`pred-${topic}`, pred, { source:'prediction-engine', topic }))
      .catch(e => console.error(`[PREDICT] ${topic}:`, e.message))
      .finally(() => { running[topic] = false; });   // FIX BUG-12: always reset
  });
});

// POST /api/predict/:topic/run
router.post('/:topic/run', (req, res) => {
  const { topic } = req.params;
  if (!['markets','commodities','policy'].includes(topic))
    return res.status(400).json({ error: 'Invalid topic' });
  if (running[topic])
    return res.json({ message: 'Already running', topic, running: true });

  res.json({ message: `Prediction started for '${topic}'`, startedAt: new Date().toISOString() });
  running[topic] = true;
  const liveData = buildLiveData();
  runPrediction(topic, liveData, null)
    .then(pred => Cache.write(`pred-${topic}`, pred, { source:'prediction-engine', topic }))
    .catch(e => console.error(`[PREDICT] ${topic}:`, e.message))
    .finally(() => { running[topic] = false; });   // FIX BUG-12
});

module.exports = router;
