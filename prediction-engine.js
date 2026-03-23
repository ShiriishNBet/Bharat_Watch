// ════════════════════════════════════════════════════════════════════════════
//  BHARAT WATCH — INDIA PREDICTION ENGINE  v1.0
//  All configurable data (personas, severity, topic weights)
//  now lives in bharat-watch.config.js — edit there, not here.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const fetch  = require('node-fetch');
const _CFG   = require('../config/bharat-watch.config');
const llm    = require('./llm-adapter');

// ── Pull everything from config ──────────────────────────────────────────────
const PERSONA_POOL    = _CFG.PERSONAS;
const SEVERITY_CONFIG = _CFG.SEVERITY;
const TOPIC_WEIGHTS   = _CFG.TOPIC_WEIGHTS;
const TRIGGERS        = _CFG.SEVERITY_TRIGGERS;

// ── SEVERITY DETECTOR ─────────────────────────────────────────────────────────
function detectSeverity(seedData) {
  let score = 1;

  const { news = [], markets = {}, commodities = [], conflictEvents = [] } = seedData;
  const T = TRIGGERS;
  const allHeadlines = news.flatMap(n => [n.title || '', n.summary || '']).join(' ').toLowerCase();

  // Geopolitical triggers — from config SEVERITY_TRIGGERS
  if (T.critical_keywords.test(allHeadlines))  score = Math.max(score, 4);
  if (T.high_keywords.test(allHeadlines))       score = Math.max(score, 3);
  if (T.medium_keywords.test(allHeadlines))     score = Math.max(score, 2);

  // Economic triggers
  if (markets.sensex?.changePct != null) {
    const abs = Math.abs(markets.sensex.changePct);
    if (abs > T.sensex_high_pct)   score = Math.max(score, 4);
    else if (abs > T.sensex_medium_pct) score = Math.max(score, 3);
    else if (abs > T.sensex_low_pct)    score = Math.max(score, 2);
  }

  // Commodity spikes
  const spiking = (commodities || []).filter(c => c.dir === 'up' && c.chg && parseFloat(c.chg) > 5).length;
  if (spiking >= T.commodity_spikes_critical) score = Math.max(score, 3);
  else if (spiking >= T.commodity_spikes_high) score = Math.max(score, 2);

  // Conflict level
  const highConflicts = (conflictEvents || []).filter(e => e.level === 'high').length;
  if (highConflicts >= T.conflict_high_critical) score = Math.max(score, 3);
  else if (highConflicts >= T.conflict_high_medium) score = Math.max(score, 2);

  return Math.min(score, 4);
}

// ── PERSONA SELECTOR — picks relevant personas for the topic ─────────────────
function selectPersonas(topic, count) {
  const topicWeights = TOPIC_WEIGHTS;

  const priority = topicWeights[topic] || Object.keys(PERSONA_POOL.reduce((a,p)=>({...a,[p.id]:p}),{}));
  const pool     = [...PERSONA_POOL];

  // Sort pool by priority
  pool.sort((a, b) => {
    const ai = priority.indexOf(a.id), bi = priority.indexOf(b.id);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  // Take first `count`, cycling through pool if needed
  const selected = [];
  for (let i = 0; selected.length < count; i++) {
    selected.push(pool[i % pool.length]);
  }
  return selected;
}

// ── SEED BUILDER ──────────────────────────────────────────────────────────────
function buildSeed(topic, liveData) {
  const { news=[], markets={}, fxRates={}, commodities=[], aibrief='' } = liveData;

  const headlines = news.slice(0, 15).map((n,i) => `${i+1}. [${n.source||'FEED'}] ${n.title}`).join('\n');
  const sensex    = markets.sensex ? `Sensex ${markets.sensex.value?.toLocaleString('en-IN')} (${markets.sensex.change >= 0 ? '+' : ''}${markets.sensex.change} / ${markets.sensex.changePct}%)` : '';
  const nifty     = markets.nifty  ? `Nifty ${markets.nifty.value?.toLocaleString('en-IN')} (${markets.nifty.change >= 0 ? '+' : ''}${markets.nifty.change} / ${markets.nifty.changePct}%)` : '';
  const crude     = markets.wti    ? `WTI $${markets.wti.value}/bbl (${markets.wti.change})` : '';
  const usdInr    = fxRates.USD_INR ? `USD/INR ₹${parseFloat(fxRates.USD_INR).toFixed(2)}` : '';
  const aedInr    = fxRates.AED_INR ? `AED/INR ₹${parseFloat(fxRates.AED_INR).toFixed(2)}` : '';

  const commStr = commodities.slice(0, 6).map(c => `${c.name}: ${c.price}${c.unit} (${c.chg})`).join(', ');

  const topicContext = {
    markets:     `Focus: India equity markets (Sensex/Nifty), FII flows, RBI policy, INR direction\nCurrent: ${sensex} | ${nifty} | ${crude} | ${usdInr}`,
    commodities: `Focus: India retail commodity prices — food inflation, fuel, farm economics\nCurrent prices: ${commStr}`,
    policy:      `Focus: India government policy, elections, geopolitics, regulatory decisions\nKey data: ${sensex} | ${usdInr} | ${aedInr}`,
  };

  return {
    topic,
    topicContext: topicContext[topic] || '',
    headlines,
    briefContext: aibrief ? aibrief.slice(0, 400) : '',
    date: new Date().toDateString(),
  };
}

// ── SIMULATION ROUND ─────────────────────────────────────────────────────────
// Each "panel" = 1 Claude call simulating 25–40 diverse agent perspectives
async function runPanel(panelIndex, seed, personas, roundNum, previousConsensus, claudeKey, claudeEndpt, claudeModel) {
  const panelSize    = Math.min(personas.length, 35);
  const panelPersonas = personas.slice(panelIndex * panelSize, (panelIndex + 1) * panelSize);
  if (!panelPersonas.length) return null;

  const personaList = panelPersonas.map(p =>
    `• ${p.name}: ${p.bg.slice(0, 80)}. Typical bias: ${p.bias.slice(0, 60)}`
  ).join('\n');

  const prevContext = previousConsensus
    ? `\nPrevious round consensus: "${previousConsensus.direction}" at ${previousConsensus.confidence}% confidence. Key debate: ${previousConsensus.keyDebate || 'forming'}.`
    : '';

  const prompt = `You are simulating a social media / expert panel discussion in India.
Date: ${seed.date}
Topic: ${seed.topicContext}

Today's headlines:
${seed.headlines}
${seed.briefContext ? `\nAnalyst context: ${seed.briefContext}` : ''}
${prevContext}

You are simulating Panel ${panelIndex + 1}, Round ${roundNum}.
These ${panelPersonas.length} agents each independently read the above information, form opinions, then interact:

${personaList}

Simulate this panel discussion authentically. Each agent:
1. Reads the news/data through THEIR specific lens and prior beliefs
2. Forms an initial position
3. Reacts to 1-2 other agents in the panel
4. May shift their position based on persuasive arguments

Then provide a panel synthesis.

Return ONLY this JSON (no markdown fences):
{
  "panelId": ${panelIndex + 1},
  "round": ${roundNum},
  "agents": [
    {
      "persona": "agent name",
      "initialStance": "bullish|bearish|neutral|uncertain",
      "reasoning": "1-2 sentences on why, specific to their background",
      "finalStance": "bullish|bearish|neutral|uncertain",
      "shiftReason": "what changed their mind OR null if no shift",
      "keyPoint": "their single most important contribution to the debate",
      "confidence": 45
    }
  ],
  "panelConsensus": {
    "direction": "bullish|bearish|neutral|split",
    "confidence": 62,
    "bull_count": 14,
    "bear_count": 9,
    "neutral_count": 5,
    "emergentTheme": "The theme that dominated this panel's discussion",
    "keyDebate": "The main point of contention between bulls and bears",
    "surprisingShift": "An agent who changed position in an unexpected way, or null"
  }
}`;

  const res = await fetch(claudeEndpt, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': claudeKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: claudeModel,
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
    timeout: 60_000,
  });

  if (!res.ok) throw new Error(`Claude HTTP ${res.status}`);
  const d    = await res.json();
  const text = d.content.filter(b => b.type === 'text').map(b => b.text).join('');

  try {
    const clean = text.replace(/```json\s*/i,'').replace(/```$/,'').trim();
    return JSON.parse(clean);
  } catch(e) {
    // Try to extract JSON from text
    const m = text.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch {} }
    return null;
  }
}

// ── REPORT AGENT — synthesizes all panel results ──────────────────────────────
async function runReportAgent(topic, seed, allPanelResults, severity, totalAgents, claudeKey, claudeEndpt, claudeModel) {
  // Aggregate panel data
  const allAgentStances = allPanelResults.flatMap(p => p?.agents || []);
  const allConsensuses  = allPanelResults.filter(p => p?.panelConsensus).map(p => p.panelConsensus);

  const bullCount  = allAgentStances.filter(a => a.finalStance === 'bullish').length;
  const bearCount  = allAgentStances.filter(a => a.finalStance === 'bearish').length;
  const neutCount  = allAgentStances.filter(a => a.finalStance === 'neutral' || a.finalStance === 'uncertain').length;

  const themes     = allConsensuses.map(c => c.emergentTheme).filter(Boolean).join('; ');
  const debates    = allConsensuses.map(c => c.keyDebate).filter(Boolean).join('; ');
  const surprises  = allConsensuses.map(c => c.surprisingShift).filter(Boolean).join('; ');

  const agentVoices = allAgentStances.slice(0, 10)
    .map(a => `- ${a.persona} (${a.finalStance}): ${a.keyPoint}`)
    .join('\n');

  const avgConf = allConsensuses.length
    ? Math.round(allConsensuses.reduce((s,c) => s + (c.confidence||50), 0) / allConsensuses.length)
    : 50;

  const topicLabels = {
    markets:     'India equity market direction (7-day Sensex/Nifty outlook)',
    commodities: 'India commodity price direction (7-day food & fuel outlook)',
    policy:      'India policy/political impact assessment (7-day outlook)',
  };

  const prompt = `You are the ReportAgent — the final synthesis layer of a multi-agent social simulation.

Simulation: ${totalAgents} Indian agents across ${allPanelResults.length} panels simulated reactions to:
${seed.topicContext}

Aggregated results:
- Bullish/Positive agents: ${bullCount} (${Math.round(bullCount/totalAgents*100)}%)
- Bearish/Negative agents: ${bearCount} (${Math.round(bearCount/totalAgents*100)}%)
- Neutral/Uncertain agents: ${neutCount} (${Math.round(neutCount/totalAgents*100)}%)
- Average panel confidence: ${avgConf}%
- Severity level: ${SEVERITY_CONFIG[severity].label} — ${SEVERITY_CONFIG[severity].description}

Key themes that emerged: ${themes}
Main debate points: ${debates}
Surprising position shifts: ${surprises || 'none noted'}

Representative agent voices:
${agentVoices}

Synthesize this into the final prediction report for: ${topicLabels[topic] || topic}

Return ONLY this JSON (no markdown fences):
{
  "topic": "${topic}",
  "predictionLabel": "short title e.g. 'SENSEX 7-DAY OUTLOOK' or 'FOOD PRICES 7-DAY' or 'POLICY IMPACT'",
  "direction": "bullish|bearish|neutral|split",
  "directionLabel": "human label e.g. 'BULLISH' or 'BEARISH' or 'NEUTRAL' or 'DEEPLY SPLIT'",
  "probability": 68,
  "confidence": 72,
  "severity": "${SEVERITY_CONFIG[severity].label}",
  "agentCount": ${totalAgents},
  "bullPct": ${Math.round(bullCount/totalAgents*100)},
  "bearPct": ${Math.round(bearCount/totalAgents*100)},
  "neutPct": ${Math.round(neutCount/totalAgents*100)},
  "headline": "One bold sentence prediction with specific India context",
  "reasoning": "2-3 sentences explaining what drove the consensus — cite specific agent types and their logic",
  "keyRisk": "The single biggest risk that could invalidate this prediction",
  "dissentingView": "The minority argument made by bears (or bulls if bearish consensus) — preserve these voices",
  "watchIndicators": ["indicator 1 to watch", "indicator 2", "indicator 3"],
  "timeHorizon": "7 days",
  "subForecasts": [
    { "label": "sub-metric 1 e.g. 'Sensex level'", "direction": "up|down|flat", "magnitude": "e.g. +1.2% to +2.8%", "confidence": 65 },
    { "label": "sub-metric 2", "direction": "up|down|flat", "magnitude": "...", "confidence": 58 },
    { "label": "sub-metric 3", "direction": "up|down|flat", "magnitude": "...", "confidence": 71 }
  ],
  "emergentInsight": "The most surprising / non-obvious pattern that emerged from agent interactions — what wouldn't a simple news summary tell you",
  "generatedAt": "${new Date().toISOString()}"
}`;

  const res = await fetch(claudeEndpt, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': claudeKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: claudeModel,
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    }),
    timeout: 60_000,
  });

  if (!res.ok) throw new Error(`ReportAgent Claude HTTP ${res.status}`);
  const d    = await res.json();
  const text = d.content.filter(b => b.type === 'text').map(b => b.text).join('');

  try {
    const clean = text.replace(/```json\s*/i,'').replace(/```$/,'').trim();
    return JSON.parse(clean);
  } catch(e) {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch {} }
    throw new Error('ReportAgent JSON parse failed: ' + e.message);
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  MAIN EXPORT: runPrediction
// ════════════════════════════════════════════════════════════════════════════
async function runPrediction(topic, liveData, claudeKey = null, options = {}) {
  // Provider config comes from llm-adapter → bharat-watch.config.js → LLM section
  const t0           = Date.now();

  if (!claudeKey) throw new Error('ANTHROPIC_API_KEY required for prediction engine');
  if (!['markets','commodities','policy'].includes(topic)) throw new Error(`Invalid topic: ${topic}`);

  // 1. Build seed material
  const seed     = buildSeed(topic, liveData);

  // 2. Detect severity
  const severity = detectSeverity({
    news: liveData.news || [],
    markets: liveData.markets || {},
    commodities: liveData.commodities || [],
    conflictEvents: liveData.conflictEvents || [],
  });
  const cfg = SEVERITY_CONFIG[severity];

  // 3. Select personas
  const personas = selectPersonas(topic, cfg.agents);

  // 4. Run simulation rounds (panels in parallel where possible)
  const allPanelResults = [];
  let prevConsensus     = null;

  for (let round = 1; round <= cfg.rounds; round++) {
    const panelsThisRound = Math.ceil(cfg.panels / cfg.rounds);
    const startPanel      = (round - 1) * panelsThisRound;
    const endPanel        = Math.min(round * panelsThisRound, cfg.panels);

    // Run panels in this round in parallel (max 3 concurrent to respect rate limits)
    const roundResults = [];
    for (let pi = startPanel; pi < endPanel; pi += 3) {
      const batch = [];
      for (let p = pi; p < Math.min(pi + 3, endPanel); p++) {
        batch.push(runPanel(p, seed, personas, round, prevConsensus, claudeKey, claudeEndpt, claudeModel));
      }
      const batchResults = await Promise.allSettled(batch);
      batchResults.forEach(r => {
        if (r.status === 'fulfilled' && r.value) roundResults.push(r.value);
      });
    }

    allPanelResults.push(...roundResults);

    // Update prevConsensus from this round's panels
    const roundConsensuses = roundResults.filter(p => p?.panelConsensus).map(p => p.panelConsensus);
    if (roundConsensuses.length) {
      const avgConf = Math.round(roundConsensuses.reduce((s,c)=>s+(c.confidence||50),0)/roundConsensuses.length);
      const dirs    = roundConsensuses.map(c=>c.direction);
      const majority = ['bullish','bearish','neutral','split']
        .map(d=>({d,n:dirs.filter(x=>x===d).length}))
        .sort((a,b)=>b.n-a.n)[0]?.d || 'neutral';
      prevConsensus = {
        direction: majority,
        confidence: avgConf,
        keyDebate: roundConsensuses.map(c=>c.keyDebate).filter(Boolean)[0] || '',
      };
    }
  }

  // 5. Run ReportAgent
  const report = await runReportAgent(
    topic, seed, allPanelResults, severity, cfg.agents,
    claudeKey, claudeEndpt, claudeModel
  );

  return {
    ...report,
    meta: {
      topic,
      severity,
      severityLabel: cfg.label,
      agentCount: cfg.agents,
      rounds: cfg.rounds,
      panelsRun: allPanelResults.length,
      durationMs: Date.now() - t0,
      personaBreakdown: personas.reduce((acc, p) => {
        acc[p.id] = (acc[p.id] || 0) + 1; return acc;
      }, {}),
    },
  };
}

// ── Run all three topics ───────────────────────────────────────────────────────
async function runAllPredictions(liveData, claudeKey, options = {}, onProgress) {
  const topics = ['markets', 'commodities', 'policy'];
  const results = {};

  for (const topic of topics) {
    try {
      if (onProgress) onProgress(topic, 'running');
      results[topic] = await runPrediction(topic, liveData, claudeKey, options);
      if (onProgress) onProgress(topic, 'done');
    } catch(e) {
      results[topic] = { error: e.message, topic };
      if (onProgress) onProgress(topic, 'error', e.message);
    }
  }

  return results;
}

module.exports = { runPrediction, runAllPredictions, detectSeverity, SEVERITY_CONFIG, PERSONA_POOL };
