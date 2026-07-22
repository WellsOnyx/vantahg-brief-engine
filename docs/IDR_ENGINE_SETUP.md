# IDR Engine — Workspace Setup (self-serve, no engineer needed)

This stands the IDR prep engine up **inside the AWS workspace**. One-time
setup is ~15 minutes; after that you use three commands. Nothing here touches
any portal, and nothing is ever written into the shared case folders.

> Internal work product — the engine is never mentioned, shown, or implied
> outside the company. See `lib/idr-engine/README.md` for the doctrine.

---

## One-time setup (inside the workspace)

**Step 1 — Install Node.js.** Download the LTS installer from
https://nodejs.org (v20 or newer) and run it with the defaults. To confirm:
open a terminal (PowerShell on Windows) and run `node --version` — any
`v20.x` or higher is fine.

**Step 2 — Get the code.** If the repo folder is already in the workspace,
skip this. Otherwise clone or copy the `vantahg-brief-engine` repository to a
**local, non-synced** location (e.g. `C:\engine\` — NOT inside OneDrive or
any shared folder).

**Step 3 — Install dependencies.** In a terminal, from the repo folder:

```bash
npm install
```

**Step 4 — Add the API key.** Create a file named exactly **`.env.idr`** in
the repo folder (same level as `package.json`) containing:

```
ANTHROPIC_API_KEY=sk-ant-...        ← paste the real key here
ENABLE_REAL_ANTHROPIC=true
```

That's the only place the key goes. The file is git-ignored and never leaves
the machine. Optional third line if you want outputs somewhere other than
`Desktop\engine-output`:

```
IDR_OUTPUT_DIR=C:\engine-output
```

**Step 5 — Smoke test.** Run any command below against a case folder. If you
see `mode HEURISTIC` in the output, the key isn't being picked up — check the
`.env.idr` filename and contents. `mode LLM` means you're live.

---

## The three commands

Run all of these from the repo folder. **Input folders are strictly
read-only** — the engine refuses to run if you point its output at an input
folder or anywhere under OneDrive, and it never writes into them. Outputs go
to `Desktop\engine-output\` (or your `IDR_OUTPUT_DIR`).

**1 · One case** (folder of the case's searchable PDFs, or pass a folder
containing its files):

```bash
npx tsx scripts/idr-answer-sheet.ts "D:\OneDrive\iMPROve documents\DISP-1234567"
```

Open the printed `answer-sheet.html` in the browser — that's the portal
card: keystrokes and paste blocks in portal order, analysis below the fold.

**2 · A whole folder of cases** (subfolders and/or case ZIPs):

```bash
npx tsx scripts/idr-batch.ts "D:\OneDrive\iMPROve documents\open-cases"
```

Open `_queue\queue.md` in the output folder — work top-down: highest
confidence first, flagged cases at the bottom, errored cases parked and
listed.

**3 · Calibrate** (folder of COMPLETED, QA-approved cases — documents plus
each case's final submitted rationale as `submitted-*.txt`, and optionally a
`decision.json`):

```bash
npx tsx scripts/idr-calibrate.ts "D:\OneDrive\iMPROve documents\completed-cases"
```

This teaches the engine the house's demonstrated judgment (real weight
usage, outcomes, template↔factor mappings) and seeds the template library.

---

## FIRST THING after setup — validate before trusting

A folder of ~20 completed historical cases is waiting in the workspace. In
this order:

1. **Calibrate against it:**
   `npx tsx scripts/idr-calibrate.ts "<path to the completed-cases folder>"`
2. **Run ONE of those completed cases blind** (any one — copy or point at its
   folder; do NOT include its `submitted-*.txt`/`decision.json` in the run
   folder):
   `npx tsx scripts/idr-answer-sheet.ts "<that case folder>"`
3. **Compare against what the arbiter actually submitted:** create a
   `ground-truth.json` from the real submission
   (`{"prevailing_party":"IP","factor_checks":{"ip":[...7 true/false...],"nip":[...]},"rationale_sections":{"close":"..."}}`)
   and run:
   `npx tsx scripts/idr-compare.ts "<output>\answer-sheet.json" ground-truth.json`

The compare prints ✓/✗ per factor check, per line, and per rationale
section, and says **MATCH** or lists mismatches. Only after a MATCH (or
explainable near-match) do the 3 live transcribed cases, then the backlog
with the batch runner.

## If something goes wrong

- **`READ-ONLY INPUT: refusing to run…`** — you pointed the output at an
  input/OneDrive folder. Use the default output or set `--out` to a local
  folder. This refusal is a feature, not a bug.
- **`mode HEURISTIC` when you expected the real analysis** — the API key
  isn't loading; check `.env.idr` (Step 4).
- **A case errored in the batch** — it's listed under "Parked" in the queue
  with the reason; fix (usually a missing/unreadable file) and re-run. Cases
  never disappear silently.
- **`No PDF/TXT documents found`** — the folder has no searchable documents;
  check you pointed at the case folder itself, not its parent.
- Anything else: every artifact is a draft; nothing was submitted anywhere;
  re-running is always safe.
