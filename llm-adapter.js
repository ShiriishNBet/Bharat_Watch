// ════════════════════════════════════════════════════════════════════════════
//  BHARAT WATCH — LLM ADAPTER  v1.0
//  Universal translation layer between Bharat Watch and any LLM provider.
//
//  HOW IT WORKS:
//  server.js and prediction-engine.js call ONE function:
//    const text = await llm.call(prompt, taskType)
//
//  This adapter reads the active provider from bharat-watch.config.js,
//  translates the request into that provider's format, sends it,
//  and returns plain text — no matter which LLM is underneath.
//
//  SUPPORTED FORMATS:
//    anthropic → Anthropic Claude API (native format)
//    openai    → OpenAI / Groq / Mistral (all use OpenAI-compatible format)
//    gemini    → Google Gemini API
//    cohere    → Cohere Command R+
//    ollama    → Local Ollama
//    bedrock   → AWS Bedrock (requires aws4 signing)
//
//  TO ADD A NEW PROVIDER:
//    1. Add its block to bharat-watch.config.js → LLM.providers
//    2. Add a `build_<format>` function below
//    3. Add a `parse_<format>` function below
//    That's it — nothing else changes.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const fetch  = require('node-fetch');
const CONFIG = require('../config/bharat-watch.config');

// ── Logger (same pattern as server.js) ───────────────────────────────────────
const log = (msg, lvl='info') =>
  console.log(`[${new Date().toISOString()}] ${({info:'ℹ',warn:'⚠',error:'✗'})[lvl]||'ℹ'} [LLM] ${msg}`);

// ── Resolve which provider + config to use for a given task ──────────────────
function resolveProvider(taskType) {
  const L   = CONFIG.LLM;
  const override = L.providers.taskOverrides?.[taskType];
  const name = (override && override !== '' && L.providers[override]) ? override : L.active;
  const prov = L.providers[name];
  if (!prov) throw new Error(`LLM provider "${name}" not found in config`);
  return { name, prov, maxTokens: L.maxTokens[taskType] || 1500, timeoutMs: L.timeoutMs };
}

// ══════════════════════════════════════════════════════════════════════════════
//  REQUEST BUILDERS  — one per format
//  Each returns { url, headers, body } ready to pass to fetch()
// ══════════════════════════════════════════════════════════════════════════════

function build_anthropic(prov, prompt, maxTokens, hasSearchCtx) {
  const body = {
    model      : prov.model,
    max_tokens : maxTokens,
    messages   : [{ role: 'user', content: prompt }],
  };
  // Add web search tool if provider supports it and we're not in context-only mode
  if (prov.hasSearch && !hasSearchCtx) {
    body.tools = [{ type: prov.searchTool, name: 'web_search' }];
  }
  return {
    url    : prov.endpoint,
    headers: {
      'Content-Type'     : 'application/json',
      'x-api-key'        : prov.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body,
  };
}

function build_openai(prov, prompt, maxTokens, hasSearchCtx) {
  const body = {
    model      : prov.model,
    max_tokens : maxTokens,
    messages   : [{ role: 'user', content: prompt }],
  };
  // OpenAI web search tool (GPT-4o with web_search_preview)
  if (prov.hasSearch && prov.searchTool && !hasSearchCtx) {
    body.tools = [{ type: prov.searchTool }];
    body.tool_choice = 'auto';
  }
  return {
    url    : prov.endpoint,
    headers: {
      'Content-Type' : 'application/json',
      'Authorization': `Bearer ${prov.apiKey}`,
    },
    body,
  };
}

function build_gemini(prov, prompt, maxTokens, hasSearchCtx) {
  const url = `${prov.endpoint}/${prov.model}:generateContent?key=${prov.apiKey}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: maxTokens },
  };
  // Gemini Google Search grounding
  if (prov.hasSearch && !hasSearchCtx) {
    body.tools = [{ googleSearch: {} }];
  }
  return {
    url,
    headers: { 'Content-Type': 'application/json' },
    body,
  };
}

function build_cohere(prov, prompt, maxTokens, hasSearchCtx) {
  const body = {
    model          : prov.model,
    message        : prompt,
    max_tokens     : maxTokens,
    chat_history   : [],
  };
  // Cohere built-in web search connector
  if (prov.hasSearch && !hasSearchCtx) {
    body.connectors = [{ id: 'web-search' }];
  }
  return {
    url    : prov.endpoint,
    headers: {
      'Content-Type' : 'application/json',
      'Authorization': `Bearer ${prov.apiKey}`,
    },
    body,
  };
}

function build_ollama(prov, prompt, maxTokens) {
  return {
    url    : prov.endpoint,
    headers: { 'Content-Type': 'application/json' },
    body: {
      model    : prov.model,
      messages : [{ role: 'user', content: prompt }],
      stream   : false,
      options  : { num_predict: maxTokens },
    },
  };
}

function build_bedrock(prov, prompt, maxTokens) {
  // NOTE: AWS Bedrock requires SigV4 request signing.
  // This requires the `aws4` npm package: npm install aws4
  // For simplicity we build the body here; signing happens in the call function.
  const modelId = prov.model;
  const isClaudeModel = modelId.startsWith('anthropic.');
  const body = isClaudeModel
    ? {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }
    : {
        inputText: prompt,
        textGenerationConfig: { maxTokenCount: maxTokens },
      };
  return {
    url    : `https://bedrock-runtime.${prov.region}.amazonaws.com/model/${encodeURIComponent(modelId)}/invoke`,
    headers: {
      'Content-Type': 'application/json',
      'Accept'      : 'application/json',
    },
    body,
    _bedrockSign: true,  // flag for the call function to sign the request
    _prov: prov,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
//  RESPONSE PARSERS  — one per format
//  Each takes the raw JSON response and returns plain text
// ══════════════════════════════════════════════════════════════════════════════

function parse_anthropic(data) {
  return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
}

function parse_openai(data) {
  // Handle tool_calls (web search) — extract the final text message
  const choices = data.choices || [];
  for (const choice of choices) {
    if (choice.message?.content) return choice.message.content;
    // Some OpenAI search responses embed text in tool results
    if (choice.message?.tool_calls) {
      const texts = (choice.message.tool_calls || [])
        .filter(t => t.function?.name === 'web_search' && t.function?.output)
        .map(t => t.function.output);
      if (texts.length) return texts.join('\n');
    }
  }
  return '';
}

function parse_gemini(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.filter(p => p.text).map(p => p.text).join('\n');
}

function parse_cohere(data) {
  return data.text || data.message || '';
}

function parse_ollama(data) {
  return data?.message?.content || data?.response || '';
}

function parse_bedrock(data, modelId) {
  if (modelId.startsWith('anthropic.')) {
    return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
  }
  return data.results?.[0]?.outputText || data.outputText || '';
}

// ══════════════════════════════════════════════════════════════════════════════
//  CONTEXT BUILDER  — for providers without built-in web search
//  Reads from the server's disk cache and injects it into the prompt.
//  This way Groq/Mistral/Ollama still get live data — just pre-fetched.
// ══════════════════════════════════════════════════════════════════════════════

function buildLiveContext(cacheDir) {
  const fs   = require('fs');
  const path = require('path');
  const parts = [];

  const readCache = (key) => {
    try {
      const raw = fs.readFileSync(path.join(cacheDir, `${key}.json`), 'utf8');
      return JSON.parse(raw)?.data;
    } catch { return null; }
  };

  const news = readCache('news');
  if (news) {
    const headlines = Object.values(news).flat().slice(0, 12).map(h => `• ${h.title}`).join('\n');
    parts.push(`TODAY'S HEADLINES:\n${headlines}`);
  }

  const markets = readCache('markets');
  if (markets) {
    parts.push(`LIVE MARKETS: Sensex ${markets.sensex?.value?.toLocaleString('en-IN') || '—'} (${markets.sensex?.changePct > 0 ? '+' : ''}${markets.sensex?.changePct}%) | Nifty ${markets.nifty?.value?.toLocaleString('en-IN') || '—'} | WTI $${markets.wti?.value || '—'}/bbl`);
  }

  const fx = readCache('fx');
  if (fx) {
    parts.push(`FX RATES: USD/INR ₹${fx.USD_INR || '—'} | AED/INR ₹${fx.AED_INR || '—'} | EUR/INR ₹${fx.EUR_INR || '—'}`);
  }

  const comm = readCache('commodities');
  if (comm && Array.isArray(comm)) {
    parts.push(`COMMODITY PRICES: ${comm.slice(0, 5).map(c => `${c.name} ${c.price}${c.unit}`).join(' | ')}`);
  }

  return parts.length ? `\n[LIVE DATA CONTEXT — ${new Date().toDateString()}]\n${parts.join('\n')}\n` : '';
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN CALL FUNCTION
//  Usage: const text = await llm.call(prompt, 'panel', '/path/to/cache')
// ══════════════════════════════════════════════════════════════════════════════

async function call(prompt, taskType = 'brief', cacheDir = './cache') {
  const { name, prov, maxTokens, timeoutMs } = resolveProvider(taskType);
  const t0 = Date.now();

  // For providers without search, prepend live data context into the prompt
  let finalPrompt = prompt;
  let hasSearchCtx = false;
  if (!prov.hasSearch) {
    const ctx = buildLiveContext(cacheDir);
    if (ctx) {
      finalPrompt = ctx + '\n' + prompt;
      hasSearchCtx = true;
    }
  }

  // Build the request for this provider's format
  const builders = {
    anthropic: build_anthropic,
    openai   : build_openai,
    gemini   : build_gemini,
    cohere   : build_cohere,
    ollama   : build_ollama,
    bedrock  : build_bedrock,
  };
  const builder = builders[prov.format];
  if (!builder) throw new Error(`No request builder for format: ${prov.format}`);

  const req = builder(prov, finalPrompt, maxTokens, hasSearchCtx);

  // Special handling for AWS Bedrock (requires SigV4 signing)
  if (req._bedrockSign) {
    try {
      const aws4 = require('aws4');
      const url  = new URL(req.url);
      const opts = aws4.sign({
        host   : url.host,
        path   : url.pathname,
        method : 'POST',
        headers: req.headers,
        body   : JSON.stringify(req.body),
        service: 'bedrock',
        region : prov.region,
      }, { accessKeyId: prov.apiKey, secretAccessKey: prov.secretKey });
      Object.assign(req.headers, opts.headers);
    } catch(e) {
      throw new Error('AWS Bedrock requires `aws4` package: npm install aws4. Error: ' + e.message);
    }
  }

  log(`call → provider=${name} task=${taskType} model=${prov.model} maxTokens=${maxTokens}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(req.url, {
      method : 'POST',
      headers: req.headers,
      body   : JSON.stringify(req.body),
      signal : controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`${name} API HTTP ${response.status}: ${errBody.slice(0, 200)}`);
  }

  const data = await response.json();

  // Parse the response back to plain text
  const parsers = {
    anthropic: () => parse_anthropic(data),
    openai   : () => parse_openai(data),
    gemini   : () => parse_gemini(data),
    cohere   : () => parse_cohere(data),
    ollama   : () => parse_ollama(data),
    bedrock  : () => parse_bedrock(data, prov.model),
  };
  const parser = parsers[prov.format];
  if (!parser) throw new Error(`No response parser for format: ${prov.format}`);

  const text = parser();
  log(`done → provider=${name} task=${taskType} chars=${text.length} ms=${Date.now()-t0}`);
  return text;
}

// ── Convenience: extract JSON from LLM text (works for all providers) ─────────
function extractJSON(text) {
  if (!text) return null;
  try {
    const m = text.match(/```json\s*([\s\S]*?)```/i)
           || text.match(/```\s*([\s\S]*?)```/)
           || text.match(/(\[[\s\S]*\])/s)
           || text.match(/(\{[\s\S]*\})/s);
    return JSON.parse(m ? m[1].trim() : text.trim());
  } catch { return null; }
}

// ── List all configured providers and their status ─────────────────────────────
function listProviders() {
  const L = CONFIG.LLM;
  return Object.entries(L.providers)
    .filter(([k]) => k !== 'taskOverrides')
    .map(([name, p]) => ({
      name,
      active    : name === L.active,
      model     : p.model || '—',
      hasKey    : !!(p.apiKey),
      hasSearch : p.hasSearch || false,
      format    : p.format || '—',
    }));
}

module.exports = { call, extractJSON, listProviders, resolveProvider };
