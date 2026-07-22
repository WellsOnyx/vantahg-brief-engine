# IDR Engine — Answer-Sheet Generator (single case + batch)

Built from **IDR Engine Build Spec v1.1** (`docs/IDR_ENGINE_BUILD_SPEC_v1.1.pdf`). One arbitration case folder in → one portal-ordered answer sheet out; or a whole directory of case folders in → a review queue sorted by confidence. Plywood doctrine: no auth, no web app, no config screens — run against a folder, get an HTML answer sheet.

**The engine recommends, it never decides.** Every artifact is stamped `DRAFT FOR ARBITER REVIEW — INTERNAL WORK PRODUCT`. This code submits nothing, contacts no portal of any kind, and on every §6 edge case it **flags instead of guessing**.

**Confidentiality doctrine:** this tooling is internal secret sauce. It is never mentioned, shown, or implied to anyone outside the company — the only externally visible thing is output quality. Answer sheets and queues are internal work product; don't leave them on a shared screen, don't attach them to anything outbound, and never reference the tooling in portal text, log notes, or client communication.

---

## How to run it (no engineering background needed)

**One-time setup: follow `docs/IDR_ENGINE_SETUP.md`** — install Node, `npm install`, put the API key in `.env.idr`, done. **First thing after setup:** run `idr-calibrate` against the folder of ~20 completed historical cases waiting in the workspace, then run one of those cases blind and check it with `idr-compare` (the setup doc walks through it).

> **⛔ READ-ONLY INPUT (hard rule):** the shared case folders are OneDrive-synced to every workspace on the team. The engine **never writes anything** into an input folder or anywhere under OneDrive — no outputs, no unzipped files, nothing. Everything it produces goes to a separate **local** output folder (default: `Desktop/engine-output`; change with `--out <dir>` or the `IDR_OUTPUT_DIR` environment variable). This is enforced in code: the engine **refuses to run** if the output target is inside the input folder or inside a OneDrive path, and a test proves a full run leaves the input tree byte-for-byte untouched.

**Run ONE case.** A case folder is just a folder containing the case's searchable PDFs — the IP notice of offer, NIP notice of offer, IP brief, NIP brief, and any exhibits. From the repo folder, run:

```bash
npx tsx scripts/idr-answer-sheet.ts "/path/to/DISP-123456"
```

When it finishes it prints where it wrote the results — by default `Desktop/engine-output/DISP-123456/`. **Open `answer-sheet.html` there in the workspace browser** — that's the **MIRROR FORM**: an exact replica of the SFFlexSuite screens, in order (Conflict of Interest → Non-AA Questions/Factors → one Case Info and Final Resolution screen per line → Attestation), every field pre-filled and every checkbox drawn in the state you should click it to. Each text field has a **Copy** button (the only JavaScript on the page — a tiny inline copy handler, no network). Human-only fields are drawn as blanks in yellow: the DLI number and the attestation name/date, which you type yourself. All analysis (evidence quotes, case facts, fingerprints, prior determinations, inventory) sits **below a fold** — open it when you need the why. If the NIP filed an eligibility **objection** letter instead of a merits brief, the mirror **leads** with: check the staff eligibility notes; no ruling recorded → send the case back. (A markdown twin is saved as `answer-sheet.md`; the log row also as `cases-log-row.tsv`.)

**Optional — the portal-assist bookmarklet (internal-only).** For even less transcription, `npx tsx scripts/idr-bookmarklet.ts` writes an installer page; drag its button to the workspace browser's bookmarks bar. On a portal screen, click it and paste the `portal_fill` block from `answer-sheet.json` — it pre-fills that screen's fields and outlines them gold. **It never submits, never fills the DLI number or attestation, and sends nothing anywhere** — you review every field and click Save yourself. See `docs/IDR_ENGINE_SETUP.md`.

**Run a WHOLE FOLDER of cases.** Point it at a directory of case folders **or case ZIPs** (cases arrive as ZIPs of up to ~60 files — they're unzipped into the **output** tree, never next to the source):

```bash
npx tsx scripts/idr-batch.ts "/path/to/open-cases"
```

Everything lands under the output root (default `Desktop/engine-output/<batch-name>/`): one subfolder of artifacts per case, `_unzipped/` for extracted ZIPs, and `_queue/queue.md` — the work list, **sorted so the fastest reviews are first**: high-confidence unflagged cases at the top, anything flagged at the bottom (those need a full read), and any case that errored listed under "Parked" so nothing silently disappears. Re-running is safe: outputs are regenerated; the input folder is never touched.

**Reading the sheet:**
- ⚠ / ⛔ **flags** — read these first. ⛔ means the engine refused to recommend on that line; you rule.
- **Confidence %** is a triage signal, not a probability: high = fast transcribe-check-decide; low = read closely. In keyword mode it never exceeds 60%.
- Anything shown as `— NOT EXTRACTED —` or `[fill]` means the engine couldn't find it with certainty — fill it from the documents yourself. It never guesses.
- The **DLI number** on batch continuation lines is intentionally blank: read it off the portal screen and type it. The engine never fills it.

## Milestone 1 — validate before the backlog (spec §7)

Do **not** run this at scale until it has matched a human. **First blind-validation case: DISP-5552798** (ground truth already captured). Run it through the single-case command, then:

```bash
npx tsx scripts/idr-compare.ts "<case>/engine-output/answer-sheet.json" "ground-truth.json"
```

The compare reports factor checks per party (7 each), prevailing party per line, and the rationale **section-by-section** (¶2, IP discussion, NIP discussion, close — `answer-sheet.json` carries `rationale_sections` for exactly this). When it matches, run the 3 live cases with the test partner transcribing; only then go to the backlog with the batch runner.

## Calibration corpus (few-shot grounding)

Feed the engine COMPLETED, QA-approved cases so its drafts match the house's demonstrated judgment, not just its format:

```bash
npx tsx scripts/idr-calibrate.ts "/path/to/completed-cases"
```

Each subfolder = one completed case: its documents **plus** the final submitted rationale (`submitted-*.txt` or `final-*.txt`) and optionally `decision.json` (`{"prevailing_party": "IP", "factor_checks": {"ip": [7 bools], "nip": [7 bools]}}`). The ingest builds `calibration-library.json` (real weight-ladder usage per factor, outcomes, exemplar rationales used as few-shot grounding in LLM mode) **and seeds the fingerprint library** — observed factor checks become each template's `factorMap`. Note: the current template catalog doc is titled "…REV 02" and marked SUPERSEDED — re-run the ingest when the v3 catalog lands.

## Modes

- **LLM mode** (key set, as above): Claude runs extraction (parties, per-line offers, QPA, CPT, batch) and the 7-factor check-rule analysis with verbatim evidence quotes + page cites. This is the real mode — run it inside the workspace, where the PHI lives; the engine goes to the data.
- **Keyword mode** (no key): deterministic fallback so the pipeline never dies silently — confidence capped at 60%, a `HEURISTIC_MODE` flag on every sheet, blanks + flags instead of guesses. Fine for smoke-testing the plumbing; not for live case prep.

## What the engine enforces (spec §3–§6)

- **Check rule (§3):** a party's factor is checked **only if their brief actually raises it**, and every check carries at least one verbatim quote with a page cite (an AI check without evidence is structurally demoted to unchecked). The rationale must prove the brief was read.
- **House rationale (§4):** the exact house paragraphs from the live portal walkthrough — ¶1 (the NSA/prohibited-factors paragraph; portal-injected, rendered for comparison only, never re-pasted) → ¶2 (the chart-reference paragraph, pasted verbatim) → IP discussion **ordered by importance: factor 5 (good-faith/contracted rates) first, factor 3 (acuity) second** → NIP discussion → verbatim close with the prevailing party (full name at first mention, IP/NIP at second). Every discussed factor carries one rung of the **weight ladder — `modest` / `some` / `less` weight** (observed usage: negotiation emails = modest, acuity op report = some, provider CV = less).
- **Edge cases (§6) → flags, never guesses:** `IDENTICAL_OFFERS` (IP == NIP on a line → no recommendation, human rules) · `MISSING_DOC` · `MISSING_CITED_EXHIBIT` (brief cites exhibits absent from the folder) · `SPLIT_DECISION` (PP differs across batch lines → full rationale per divergent line, no DLI chaining across the split) · `NIP_OFFER_EQUALS_QPA` · `EXTRACTION_GAP` · `TEMPLATE_DEVIATION` · `HEURISTIC_MODE`. Blocking flags turn the affected line's recommendation into `FLAG`.
- **QPA (§2):** extracted and displayed, never used as an anchor — it is the NIP's own number.

## Template fingerprint (§5)

Every brief is fingerprinted: a **shell hash** (numbers/dates/amounts stripped → the reusable template) plus a **content hash** (this exact filing). Familiar shell + different case numbers = normal reuse, quiet. Familiar shell + **changed wording or a shifted exhibit count** = 🚨 `TEMPLATE_DEVIATION`, blocking — the lazy-arbiter trap, industrialized. New templates auto-register into `lib/idr-engine/template-library.json`; the batch runner shares one library across the run. **The QA team's v3 template catalog is the seed library** — when it arrives it is ingested into that same JSON (entries carry a `factorMap` slot for its pre-mapped factor selections).

## Portal interaction doctrine

Today, the answer sheet IS the interface: the reviewer transcribes it into the submission portal by hand. The planned later phase is an **in-workspace browser assist** that pre-fills the submission portal's checkboxes and fields directly from `answer-sheet.json` and **hard-stops before submit** — the human reviews every pre-filled field and personally clicks. No CMS portal automation, ever. Like everything else here, that assist is internal-only tooling and is never disclosed externally.

## PHI

Case documents never leave the workspace/VPC — this tool reads a local folder and writes next to it. The only network call is the Anthropic API in LLM mode (the same path the UM brief engine uses). No portal automation, no uploads, nothing else. `.txt` files are accepted alongside PDFs for fixtures and smoke tests; scanned/image-only PDFs yield empty text and produce flags, not guesses (OCR is a later phase).
