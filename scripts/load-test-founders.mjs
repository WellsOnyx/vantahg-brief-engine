#!/usr/bin/env node
/**
 * Founders intake load test.
 *
 * Fires concurrent batches of synthetic intake submissions against the
 * local dev server and reports latency + throughput. Demo mode is the
 * default — no Supabase needed.
 *
 * Usage:
 *   node scripts/load-test-founders.mjs [base_url]
 *
 * Default base_url: http://localhost:3000
 */

const BASE = process.argv[2] || 'http://localhost:3000';

// Warmth round first to discount Next.js compile time
async function warm() {
  await fetch(`${BASE}/api/health`).catch(() => {});
  await fetch(`${BASE}/api/founders/intake`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: 'warm', service_type: 'outpatient', payload: {} }),
  }).catch(() => {});
}

function buildPayload(i) {
  return {
    client_id: `demo-client-${i % 3}`,
    service_type: 'outpatient',
    payload: {
      member_name: `Test Patient ${i}`,
      member_id: `M${1000 + (i % 100)}`,
      member_dob: '1980-01-01',
      date_of_service: '2026-06-01',
      procedure_description: 'MRI lumbar spine without contrast',
      servicing_provider_npi: '1234567890',
      servicing_provider: 'Dr. Smith',
      servicing_provider_address: '123 Main St, Tampa FL',
      service_window_start: '2026-06-01',
      service_window_end: '2026-09-01',
    },
  };
}

async function fireOne(i) {
  const start = performance.now();
  try {
    const res = await fetch(`${BASE}/api/founders/intake`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload(i)),
    });
    const ms = performance.now() - start;
    return { ok: res.ok, status: res.status, ms };
  } catch (err) {
    return { ok: false, status: 0, ms: performance.now() - start, error: err.message };
  }
}

function pct(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

async function batch(concurrency, total) {
  const results = [];
  let i = 0;
  const t0 = performance.now();

  // Run in waves of `concurrency` until we've fired `total` requests
  while (i < total) {
    const waveSize = Math.min(concurrency, total - i);
    const wave = Array.from({ length: waveSize }, (_, k) => fireOne(i + k));
    const waveResults = await Promise.all(wave);
    results.push(...waveResults);
    i += waveSize;
  }

  const totalMs = performance.now() - t0;
  const lat = results.map((r) => r.ms);
  const ok = results.filter((r) => r.ok).length;
  const errors = results.filter((r) => !r.ok);
  const errorBreakdown = errors.reduce((m, r) => {
    const k = r.error ? `network:${r.error}` : `http:${r.status}`;
    m[k] = (m[k] || 0) + 1;
    return m;
  }, {});

  return {
    concurrency,
    total,
    totalMs,
    throughputRps: (total / totalMs) * 1000,
    successRate: ok / total,
    p50: pct(lat, 50),
    p95: pct(lat, 95),
    p99: pct(lat, 99),
    max: Math.max(...lat),
    errors: errors.length,
    errorBreakdown,
  };
}

(async () => {
  console.log(`[load-test] target=${BASE}\n`);
  console.log('[load-test] warming...');
  await warm();
  await warm();

  const scenarios = [
    { concurrency: 1,   total: 20  },
    { concurrency: 10,  total: 100 },
    { concurrency: 25,  total: 250 },
    { concurrency: 50,  total: 500 },
  ];

  console.log('\nconcurrency | total | wall_ms |   rps  | success |  p50 |  p95 |  p99 |  max');
  console.log('------------+-------+---------+--------+---------+------+------+------+-----');
  for (const s of scenarios) {
    const r = await batch(s.concurrency, s.total);
    console.log(
      `   ${String(r.concurrency).padStart(7)}  | ${String(r.total).padStart(5)} | ${
        r.totalMs.toFixed(0).padStart(7)
      } | ${r.throughputRps.toFixed(1).padStart(6)} | ${(r.successRate * 100).toFixed(1).padStart(6)}% | ${
        r.p50.toFixed(0).padStart(4)
      } | ${r.p95.toFixed(0).padStart(4)} | ${r.p99.toFixed(0).padStart(4)} | ${r.max.toFixed(0).padStart(4)}`
    );
    if (r.errors > 0) console.log(`              errors: ${JSON.stringify(r.errorBreakdown)}`);
  }
})();
