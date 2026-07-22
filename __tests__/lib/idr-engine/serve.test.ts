import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { serve, assertPrivateBind, type ServeHandle } from '@/lib/idr-engine/serve';
import { runBatch } from '@/lib/idr-engine/run-batch';

/**
 * Internal serve mode: private-bind enforcement (refuses public/all-
 * interface), shared-access-code gate, queue + mirror pages served from a
 * batch output dir, path-traversal proof, DRAFT stamp with no tooling
 * language in reviewer-facing pages.
 */

const CODE = 'shared-code-123';
let base: string;
let outDir: string;
let handle: ServeHandle | null = null;

beforeEach(async () => {
  base = await mkdtemp(path.join(tmpdir(), 'idr-serve-'));
  const inputRoot = path.join(base, 'cases');
  outDir = path.join(base, 'out');
  await mkdir(inputRoot);
  const files = {
    'ip-notice-of-offer.txt': 'NOTICE OF OFFER — INITIATING PARTY\nDispute number DISP-880001. Line 1 final payment offer: $1,150.00.',
    'nip-notice-of-offer.txt': 'NOTICE OF OFFER — NON-INITIATING PARTY\nDispute DISP-880001. QPA is $400.00. Line 1 final payment offer: $450.00.',
    'ip-brief.txt': 'ARBITRATION BRIEF OF THE INITIATING PARTY\nGood faith negotiation and prior contracted rate per the EOB in Exhibit A. Acuity high per the operative report.',
    'nip-brief.txt': 'ARBITRATION BRIEF — NON-INITIATING PARTY\nThe QPA already accounts for acuity and is appropriate.',
  };
  const dir = path.join(inputRoot, 'DISP-880001');
  await mkdir(dir);
  for (const [f, c] of Object.entries(files)) await writeFile(path.join(dir, f), c, 'utf-8');
  await runBatch(inputRoot, { libraryPath: path.join(base, 'lib.json'), outDir });
});

afterEach(async () => {
  if (handle) { await handle.close(); handle = null; }
});

describe('assertPrivateBind', () => {
  it('accepts loopback and RFC1918 private addresses', () => {
    for (const h of ['127.0.0.1', 'localhost', '::1', '10.1.2.3', '172.16.0.9', '172.31.255.1', '192.168.1.50']) {
      expect(() => assertPrivateBind(h)).not.toThrow();
    }
  });
  it('REFUSES all-interface and public addresses', () => {
    for (const h of ['0.0.0.0', '::', '', '*', '8.8.8.8', '54.12.33.9', '172.32.0.1', '192.169.0.1']) {
      expect(() => assertPrivateBind(h)).toThrow(/REFUSING TO BIND/);
    }
  });
});

describe('serve() startup guardrails', () => {
  it('refuses to start bound to a public interface', async () => {
    await expect(serve({ servedDir: outDir, host: '0.0.0.0', port: 0, accessCode: CODE })).rejects.toThrow(/REFUSING TO BIND/);
  });
  it('refuses to start without a real access code', async () => {
    await expect(serve({ servedDir: outDir, host: '127.0.0.1', port: 0, accessCode: '' })).rejects.toThrow(/access code/i);
    await expect(serve({ servedDir: outDir, host: '127.0.0.1', port: 0, accessCode: 'short' })).rejects.toThrow(/access code/i);
  });
});

describe('serving on loopback', () => {
  async function start() {
    handle = await serve({ servedDir: outDir, host: '127.0.0.1', port: 0, accessCode: CODE });
    return handle.url;
  }

  it('gates everything behind the access code; wrong code denied, right code opens the queue', async () => {
    const url = await start();
    // Unauthed root → login page, not the queue.
    const root = await fetch(url);
    const rootHtml = await root.text();
    expect(rootHtml).toContain('Access code');
    expect(rootHtml).not.toContain('Review queue');

    // Wrong code → 401.
    const bad = await fetch(url + 'login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'code=nope', redirect: 'manual' });
    expect(bad.status).toBe(401);

    // Right code → cookie.
    const ok = await fetch(url + 'login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `code=${encodeURIComponent(CODE)}`, redirect: 'manual' });
    expect(ok.status).toBe(302);
    const cookie = (ok.headers.get('set-cookie') ?? '').split(';')[0];
    expect(cookie).toContain('idr_session=');

    // Authed queue lists the case, DRAFT-stamped, no tooling language.
    const queue = await fetch(url, { headers: { cookie } });
    const qh = await queue.text();
    expect(qh).toContain('Review queue');
    expect(qh).toContain('DRAFT FOR ARBITER REVIEW');
    expect(qh).toContain('DISP-880001');
    expect(qh).not.toMatch(/engine/i);
  });

  it('serves the mirror form for a known case and 404s unknown ids + path traversal', async () => {
    const url = await start();
    const login = await fetch(url + 'login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `code=${encodeURIComponent(CODE)}`, redirect: 'manual' });
    const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0];

    const mirror = await fetch(url + 'case/DISP-880001', { headers: { cookie } });
    expect(mirror.status).toBe(200);
    const mh = await mirror.text();
    expect(mh).toContain('Portal mirror');
    expect(mh).toContain('DRAFT FOR ARBITER REVIEW');
    expect(mh).not.toMatch(/engine/i);

    // Unknown case → 404.
    expect((await fetch(url + 'case/DISP-999999', { headers: { cookie } })).status).toBe(404);
    // Path traversal attempt → 404 (not a known case id, never resolves outside servedDir).
    expect((await fetch(url + 'case/..%2f..%2f..%2fetc%2fpasswd', { headers: { cookie } })).status).toBe(404);
  });

  it('mirror is unreachable without the cookie', async () => {
    const url = await start();
    const noAuth = await fetch(url + 'case/DISP-880001');
    expect(await noAuth.text()).toContain('Access code'); // login, not the mirror
  });
});
