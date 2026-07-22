import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { loadLocalEnv } from '../lib/idr-engine/env-local';
import { defaultOutputRoot } from '../lib/idr-engine/output-guard';

/**
 * Phase-3 portal-assist bookmarklet generator (INTERNAL-ONLY).
 *
 *   npx tsx scripts/idr-bookmarklet.ts [--out <dir>]
 *
 * Writes an installer page (idr-portal-assist.html) containing:
 *   - the drag-to-bookmarks-bar bookmarklet
 *   - one-time instructions for a non-engineer
 *
 * How the reviewer uses it, in the AWS workspace:
 *   1. Open a case's answer-sheet.json, copy the "portal_fill" block.
 *   2. On the SFFlexSuite screen, click the bookmarklet.
 *   3. Paste the JSON when prompted.
 *   4. The current screen's fields are pre-filled and outlined gold.
 *      IT NEVER SUBMITS. Review every field, type the human-only fields
 *      (DLI number, attestation), then click save yourself.
 *
 * Runs entirely in the reviewer's browser inside the workspace; no network,
 * nothing leaves the page. The fill logic mirrors lib/idr-engine/portal-fill.ts
 * (the tested reference); a build check asserts the emitted code contains no
 * submit call.
 */

// The bookmarklet body — plain ES5-ish JS, a faithful transliteration of
// lib/idr-engine/portal-fill.ts::fillPortal. NO submit path exists here.
const BOOKMARKLET_BODY = `
(function(){
  var HL='2px solid #d9a520';
  var SUBMIT=/\\b(submit|save|finali[sz]e|complete|sign|attest|next|continue|confirm)\\b/i;
  function fire(el,ty){el.dispatchEvent(new Event(ty,{bubbles:true}));}
  function elabel(el){var id=el.getAttribute('id');if(id){var l=document.querySelector('label[for="'+(window.CSS&&CSS.escape?CSS.escape(id):id)+'"]');if(l&&l.textContent)return l.textContent.toLowerCase();}return '';}
  function rowText(el){var r=el.closest('tr,.row,li,div');return (r&&r.textContent||'').toLowerCase();}
  function fieldCtx(el){return elabel(el)||rowText(el);}
  function isSubmit(el){var own=(el.getAttribute('value')||el.textContent||'')+' '+(el.getAttribute('name')||'')+' '+(el.getAttribute('id')||'');return SUBMIT.test(own)||SUBMIT.test(elabel(el))||SUBMIT.test(rowText(el));}
  var raw=window.prompt('Paste the portal_fill JSON from the answer sheet:');
  if(!raw)return;
  var p;try{p=JSON.parse(raw);if(p.portal_fill)p=p.portal_fill;}catch(e){alert('Not valid JSON — copy the portal_fill block from answer-sheet.json.');return;}
  var filled=[],skipped=[];
  var boxes=[].slice.call(document.querySelectorAll('input[type="checkbox"]'));
  var na=boxes.filter(function(c){return /no to all/i.test(rowText(c))||/no to all/i.test(elabel(c));})[0];
  if(na&&!isSubmit(na)){if(!na.checked){na.checked=true;na.style.outline=HL;fire(na,'click');fire(na,'change');}filled.push('COI: No To All');}else skipped.push('COI master checkbox');
  (p.factor_rows||[]).forEach(function(row){['ip','nip'].forEach(function(side){var want=row[side];var box=boxes.filter(function(c){var mk=(row.markers||[]).some(function(m){return rowText(c).indexOf(m)>=0;});return mk&&new RegExp('(^|[^a-z])'+side+'([^a-z]|$)','i').test(elabel(c)||rowText(c));})[0];if(!box||isSubmit(box))return;if(box.checked!==want){box.checked=want;box.style.outline=HL;fire(box,'click');fire(box,'change');}filled.push('factor '+row.factor+' '+side.toUpperCase()+'='+(want?'✓':'✗'));});});
  var tas=[].slice.call(document.querySelectorAll('textarea'));
  var rta=tas.filter(function(t){return /rationale|reason|narrative|explanation/i.test(fieldCtx(t))&&!isSubmit(t);})[0]||tas.filter(function(t){return !t.value.trim()&&!isSubmit(t);}).sort(function(a,b){return (b.rows||0)-(a.rows||0);})[0];
  if(rta&&p.rationale_paste){rta.value=p.rationale_paste;rta.style.outline=HL;fire(rta,'input');fire(rta,'change');filled.push('rationale');}else skipped.push('rationale textarea');
  if(p.decided_party){var pp=p.decided_party;var sels=[].slice.call(document.querySelectorAll('select'));var ps=sels.filter(function(s){return /prevailing|final resolution|party|selected offer/i.test(fieldCtx(s));})[0];if(ps&&!isSubmit(ps)){var opt=[].slice.call(ps.options).filter(function(o){return new RegExp('(^|[^a-z])'+pp+'([^a-z]|$)|'+(pp==='IP'?'initiating':'non-initiating'),'i').test(o.textContent||o.value);})[0];if(opt){ps.value=opt.value;ps.style.outline=HL;fire(ps,'change');filled.push('prevailing party='+pp);}}else skipped.push('prevailing-party control');}else skipped.push('prevailing party (split/flag — human selects)');
  skipped.push('DLI number (human types)');skipped.push('attestation (human only)');skipped.push('SUBMIT/SAVE — review every field, then click yourself');
  alert('IDR portal-assist — DRAFT, NEVER SUBMITTED.\\n\\nPre-filled (outlined gold):\\n  '+filled.join('\\n  ')+'\\n\\nLeft for you:\\n  '+skipped.join('\\n  '));
})();
`.trim();

function toBookmarklet(body: string): string {
  const min = body.replace(/\n\s*/g, '').replace(/\s{2,}/g, ' ');
  return 'javascript:' + encodeURIComponent(min);
}

async function main() {
  // Build-time guardrail: the emitted code must never actuate submit.
  if (/\.submit\s*\(|requestSubmit\s*\(|type=['"]submit['"]/.test(BOOKMARKLET_BODY)) {
    console.error('REFUSING TO BUILD: bookmarklet body contains a submit path.');
    process.exit(1);
  }
  const args = process.argv.slice(2);
  const outArg = ((n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; })('--out');
  const outDir = path.resolve(outArg ?? defaultOutputRoot());
  await mkdir(outDir, { recursive: true });

  const href = toBookmarklet(BOOKMARKLET_BODY);
  const page = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>IDR Portal Assist — install</title>
<style>body{font:15px/1.6 -apple-system,'Segoe UI',Arial,sans-serif;max-width:760px;margin:0 auto;padding:24px;color:#1a2233}
.banner{background:#7a1f1f;color:#fff;font-weight:700;text-align:center;padding:10px;border-radius:4px}
a.bm{display:inline-block;background:#24486f;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:700;margin:14px 0}
ol{line-height:1.9}code{background:#eef1f7;padding:1px 5px;border-radius:3px}</style></head><body>
<div class="banner">INTERNAL WORK PRODUCT — NOT FOR DISTRIBUTION. This tool never submits; a human reviews every field and saves.</div>
<h1>IDR Portal Assist</h1>
<p>Drag this button to your bookmarks bar (inside the workspace browser only):</p>
<p><a class="bm" href="${href}">IDR Portal Assist</a></p>
<h2>How to use it</h2>
<ol>
<li>Run the case: <code>npx tsx scripts/idr-answer-sheet.ts &lt;case-folder&gt;</code>. Open the resulting <code>answer-sheet.json</code> and copy the <code>portal_fill</code> block (or the whole file).</li>
<li>Open the case on the SFFlexSuite portal screen you want to fill.</li>
<li>Click the <strong>IDR Portal Assist</strong> bookmark. Paste the JSON when prompted.</li>
<li>The current screen's fields are pre-filled and <span style="outline:2px solid #d9a520;padding:0 3px">outlined gold</span>. <strong>It does not submit.</strong> Review every field, type the human-only fields (DLI number, attestation name/date), then click Save yourself.</li>
</ol>
<p><strong>Guardrails:</strong> runs entirely in your browser inside the workspace — nothing is sent anywhere. It never clicks submit/save, never fills DLI numbers or attestation, and outlines everything it changed so you can verify it. Re-clicking is safe.</p>
</body></html>`;

  const file = path.join(outDir, 'idr-portal-assist.html');
  await writeFile(file, page, 'utf-8');
  console.log(`\nWrote the portal-assist installer:\n  ${file}\n\nOpen it in the workspace browser and drag the button to your bookmarks bar.\n`);
}

loadLocalEnv();
main().catch((err) => {
  console.error('idr-bookmarklet failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
