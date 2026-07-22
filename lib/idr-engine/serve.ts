import http from 'http';
import crypto from 'crypto';
import { readFile, readdir, stat } from 'fs/promises';
import path from 'path';

/**
 * Internal serve mode (deployment requirement): the engine runs on ONE
 * machine inside the VPC and serves the review queue and the mirror forms
 * as simple web pages to many arbiter WorkSpaces — zero per-workstation
 * installs. Plywood: Node's built-in http, no framework, no database, no
 * cloud hosting. It serves the artifacts `idr-batch` already produced.
 *
 * HARD GUARDRAILS (enforced here):
 *   - PRIVATE NETWORK ONLY. It refuses to bind to a public interface or to
 *     a bind-all address (0.0.0.0 / ::). Only loopback or RFC1918 private
 *     addresses are allowed — so it is unreachable from the public
 *     internet by construction.
 *   - Shared ACCESS CODE required. Refuses to start without one; wrong
 *     code → no access. Timing-safe compare.
 *   - The API key and all case processing stay on the serving machine —
 *     this process only READS a local output directory and never runs the
 *     LLM or touches input folders.
 *   - Path-traversal proof: only case ids present in the batch queue are
 *     servable; nothing else on disk is reachable.
 *   - Reviewer-facing pages carry the DRAFT stamp and contain NO engine/
 *     tooling language (asserted by test).
 */

// ── Private-bind enforcement ───────────────────────────────────────────────

const RFC1918 = [
  /^127\./, // loopback
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
];

/** Throw unless `host` is loopback or an RFC1918 private IPv4 (or ::1). */
export function assertPrivateBind(host: string): void {
  const h = host.trim().toLowerCase();
  if (h === '0.0.0.0' || h === '::' || h === '*' || h === '') {
    throw new Error(
      `REFUSING TO BIND: "${host}" exposes the server on all interfaces (public). ` +
      `Bind to a private address only — 127.0.0.1 for a single machine, or the server's ` +
      `RFC1918 VPC address (10.x / 172.16–31.x / 192.168.x) for other WorkSpaces to reach it.`,
    );
  }
  if (h === 'localhost' || h === '::1') return;
  if (RFC1918.some((re) => re.test(h))) return;
  throw new Error(
    `REFUSING TO BIND: "${host}" is not a private (loopback/RFC1918) address. ` +
    `Internal serve mode never binds to a public interface. Use 127.0.0.1 or the private VPC IP.`,
  );
}

// ── Session (in-memory; dies with the process) ─────────────────────────────

function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

// ── Page rendering (no engine/tooling language) ────────────────────────────

const DRAFT = 'DRAFT FOR ARBITER REVIEW — INTERNAL WORK PRODUCT, NOT FOR DISTRIBUTION';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function loginPage(error?: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Access</title>
<style>body{font:15px/1.6 -apple-system,'Segoe UI',Arial,sans-serif;max-width:420px;margin:12vh auto;padding:24px;color:#1a2233}
.banner{background:#7a1f1f;color:#fff;font-weight:700;text-align:center;padding:10px;border-radius:4px;margin-bottom:24px;font-size:12px}
input{width:100%;padding:9px;font:inherit;border:1px solid #9fb0cc;border-radius:4px;margin:8px 0}
button{padding:9px 18px;font:inherit;font-weight:700;background:#24486f;color:#fff;border:0;border-radius:4px;cursor:pointer}
.err{color:#a12020;font-weight:600}</style></head><body>
<div class="banner">${DRAFT}</div>
<h1>Access code</h1>
${error ? `<p class="err">${esc(error)}</p>` : ''}
<form method="POST" action="/login">
<input type="password" name="code" placeholder="Shared access code" autofocus autocomplete="off">
<button type="submit">Enter</button>
</form></body></html>`;
}

interface QueueCase {
  caseId: string;
  disputeNumber: string | null;
  lineCount: number;
  batch: boolean;
  gateConfidencePct: number;
  hasBlockingFlags: boolean;
  flagCodes: string[];
  recommendations: Array<{ line: number; recommended: string; confidencePct: number }>;
}

interface QueueJson {
  generatedAt: string;
  ran: QueueCase[];
  parked: Array<{ caseId: string; error: string }>;
}

function queuePage(q: QueueJson): string {
  const rows = q.ran
    .map((c) => {
      const conf = c.hasBlockingFlags ? '⛔' : `${c.gateConfidencePct}%`;
      const recs = c.recommendations.map((r) => `L${r.line}:${esc(r.recommended)}`).join(' ');
      const flags = c.flagCodes.length ? esc(c.flagCodes.join(', ')) : '—';
      return `<tr><td><a href="/case/${encodeURIComponent(c.caseId)}">${esc(c.caseId)}</a></td>` +
        `<td>${esc(c.disputeNumber ?? '—')}</td><td>${c.lineCount}${c.batch ? ' (batch)' : ''}</td>` +
        `<td>${conf}</td><td>${recs}</td><td>${flags}</td></tr>`;
    })
    .join('');
  const parked = q.parked.length
    ? `<h2>Parked</h2><ul>${q.parked.map((p) => `<li>${esc(p.caseId)}: ${esc(p.error)}</li>`).join('')}</ul>`
    : '';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Review queue</title>
<style>body{font:14px/1.6 -apple-system,'Segoe UI',Arial,sans-serif;max-width:960px;margin:0 auto;padding:20px;color:#1a2233;background:#f2f4f8}
.banner{background:#7a1f1f;color:#fff;font-weight:700;text-align:center;padding:10px;border-radius:4px;font-size:12px}
table{border-collapse:collapse;width:100%;margin:16px 0;background:#fff}
th,td{border:1px solid #c6cede;padding:7px 10px;text-align:left}th{background:#e8ecf3}
a{color:#24486f;font-weight:600}h1{font-size:20px}</style></head><body>
<div class="banner">${DRAFT}</div>
<h1>Review queue</h1>
<p>Work top-down: highest confidence first, flagged cases at the bottom. Generated ${esc(q.generatedAt)}.</p>
<table><tr><th>Case</th><th>Dispute</th><th>Lines</th><th>Conf.</th><th>Recommendation(s)</th><th>Flags</th></tr>${rows}</table>
${parked}
</body></html>`;
}

// ── Server ─────────────────────────────────────────────────────────────────

export interface ServeOptions {
  /** Directory produced by idr-batch (contains _queue/queue.json + <case>/answer-sheet.html). */
  servedDir: string;
  host: string;
  port: number;
  /** Shared access code (required). */
  accessCode: string;
}

export interface ServeHandle {
  server: http.Server;
  url: string;
  close: () => Promise<void>;
}

async function loadQueue(servedDir: string): Promise<QueueJson> {
  const raw = await readFile(path.join(servedDir, '_queue', 'queue.json'), 'utf-8');
  const j = JSON.parse(raw);
  return { generatedAt: j.generatedAt ?? '', ran: j.ran ?? [], parked: j.parked ?? [] };
}

/** Build the request handler (exported for tests). */
export function createHandler(opts: ServeOptions, sessions: Set<string>): http.RequestListener {
  const authed = (req: http.IncomingMessage) => {
    const tok = parseCookies(req.headers.cookie)['idr_session'];
    return !!tok && sessions.has(tok);
  };

  return async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://internal');
      const send = (code: number, body: string, headers: Record<string, string> = {}) => {
        res.writeHead(code, { 'content-type': 'text/html; charset=utf-8', 'x-content-type-options': 'nosniff', ...headers });
        res.end(body);
      };

      // Login
      if (req.method === 'POST' && url.pathname === '/login') {
        let body = '';
        for await (const chunk of req) body += chunk;
        const code = new URLSearchParams(body).get('code') ?? '';
        if (timingSafeEqual(code, opts.accessCode)) {
          const tok = crypto.randomBytes(24).toString('hex');
          sessions.add(tok);
          send(302, '', { 'set-cookie': `idr_session=${tok}; HttpOnly; SameSite=Strict; Path=/`, location: '/' });
        } else {
          send(401, loginPage('Incorrect code.'));
        }
        return;
      }

      if (!authed(req)) {
        send(200, loginPage());
        return;
      }

      // Queue
      if (url.pathname === '/' ) {
        const q = await loadQueue(opts.servedDir).catch(() => null);
        if (!q) return send(500, '<p>No queue found. Run idr-batch against the input folder first.</p>');
        return send(200, queuePage(q));
      }

      // Mirror form for a case — only ids present in the queue are servable.
      if (url.pathname.startsWith('/case/')) {
        const caseId = decodeURIComponent(url.pathname.slice('/case/'.length));
        const q = await loadQueue(opts.servedDir).catch(() => null);
        const known = q?.ran.some((c) => c.caseId === caseId);
        if (!known) return send(404, '<p>Unknown case.</p>');
        // Path-traversal proof: resolve and confirm it stays under servedDir.
        const file = path.join(opts.servedDir, caseId, 'answer-sheet.html');
        const rel = path.relative(path.resolve(opts.servedDir), path.resolve(file));
        if (rel.startsWith('..') || path.isAbsolute(rel)) return send(404, '<p>Not found.</p>');
        const html = await readFile(file, 'utf-8').catch(() => null);
        if (html === null) return send(404, '<p>Mirror not found for this case.</p>');
        return send(200, html);
      }

      send(404, '<p>Not found.</p>');
    } catch {
      res.writeHead(500, { 'content-type': 'text/html' });
      res.end('<p>Server error.</p>');
    }
  };
}

export async function serve(opts: ServeOptions): Promise<ServeHandle> {
  assertPrivateBind(opts.host);
  if (!opts.accessCode || opts.accessCode.length < 6) {
    throw new Error('REFUSING TO START: a shared access code of 6+ chars is required (IDR_SERVE_CODE).');
  }
  // Confirm the served directory looks like a batch output (has a queue).
  const queueFile = path.join(opts.servedDir, '_queue', 'queue.json');
  if (!(await stat(queueFile).then(() => true).catch(() => false))) {
    // allow start but the '/' route reports it — clearer than crashing.
    await readdir(opts.servedDir).catch(() => { throw new Error(`Served directory not found: ${opts.servedDir}`); });
  }

  const sessions = new Set<string>();
  const server = http.createServer(createHandler(opts, sessions));
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port, opts.host, resolve);
  });
  const addr = server.address();
  const boundPort = typeof addr === 'object' && addr ? addr.port : opts.port;
  return {
    server,
    url: `http://${opts.host}:${boundPort}/`,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
