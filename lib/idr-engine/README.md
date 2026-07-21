# IDR Engine — Answer-Sheet Generator (single case + batch)

Built from **IDR Engine Build Spec v1.1** (`docs/IDR_ENGINE_BUILD_SPEC_v1.1.pdf`). One arbitration case folder in → one portal-ordered answer sheet out; or a whole directory of case folders in → a review queue sorted by confidence. Plywood doctrine: no auth, no web app, no config screens — run against a folder, get an HTML answer sheet.

**The engine recommends, it never decides.** Every artifact is stamped `DRAFT FOR ARBITER REVIEW — INTERNAL WORK PRODUCT`. This code submits nothing, contacts no portal of any kind, and on every §6 edge case it **flags instead of guessing**.

**Confidentiality doctrine:** this tooling is internal secret sauce. It is never mentioned, shown, or implied to anyone outside the company — the only externally visible thing is output quality. Answer sheets and queues are internal work product; don't leave them on a shared screen, don't attach them to anything outbound, and never reference the tooling in portal text, log notes, or client communication.

---

## How to run it (no engineering background needed)

**One-time setup** (someone technical does this once per machine/workspace):
1. Install Node.js (v20+), then in this repo run `npm install`.
2. For the real AI analysis, set two environment variables: `ANTHROPIC_API_KEY=<key>` and `ENABLE_REAL_ANTHROPIC=true`. (Without them the tool still runs, but in a limited keyword mode — see "Modes" below.)

**Run ONE case.** A case folder is just a folder containing the case's searchable PDFs — the IP notice of offer, NIP notice of offer, IP brief, NIP brief, and any exhibits. From the repo folder, run:

```bash
npx tsx scripts/idr-answer-sheet.ts "/path/to/DISP-123456"
```

When it finishes it prints where it wrote the results. **Open `engine-output/answer-sheet.html` in the workspace browser** — that's your answer sheet, laid out to mirror the portal's module flow (COI → Non-AA questions → attestation). Work through it **top to bottom next to the portal**: flags first, then COI, factor checkboxes, the rationale paste block, prevailing party (entered in **two** portal places), DLI slots, attestation. The last section is a row you can paste into the IDR Cases Log sheet (also saved as `cases-log-row.tsv`; a markdown twin of the sheet is saved as `answer-sheet.md`).

**Run a WHOLE FOLDER of cases.** Point it at a directory whose subfolders are case folders:

```bash
npx tsx scripts/idr-batch.ts "/path/to/open-cases"
```

Every case gets its own `engine-output/`, and the top-level folder gets `_engine-queue/queue.md` — the work list, **sorted so the fastest reviews are first**: high-confidence unflagged cases at the top, anything flagged at the bottom (those need a full read), and any case that errored listed under "Parked" so nothing silently disappears. Re-running is safe: outputs are regenerated, nothing else is touched.

**Reading the sheet:**
- ⚠ / ⛔ **flags** — read these first. ⛔ means the engine refused to recommend on that line; you rule.
- **Confidence %** is a triage signal, not a probability: high = fast transcribe-check-decide; low = read closely. In keyword mode it never exceeds 60%.
- Anything shown as `— NOT EXTRACTED —` or `[fill]` means the engine couldn't find it with certainty — fill it from the documents yourself. It never guesses.
- The **DLI number** on batch continuation lines is intentionally blank: read it off the portal screen and type it. The engine never fills it.

## Milestone 1 — validate before the backlog (spec §7)

Do **not** run this at scale until it has matched a human. Take a case an arbiter already completed, run it through the single-case command, and compare `engine-output/answer-sheet.json` against her real submission — it contains the discrete answers in comparable form: factor checks as two 7-item true/false arrays (factors 1–7 in order, IP and NIP), the recommended prevailing party + confidence per line, DLI chaining, COI answer, QPA, offers per line, and the rationale text. When the factor grid and prevailing party match her submission (and the rationale reads like the house style), run the 3 live cases with the test partner transcribing; only then go to the backlog with the batch runner.

## Modes

- **LLM mode** (key set, as above): Claude runs extraction (parties, per-line offers, QPA, CPT, batch) and the 7-factor check-rule analysis with verbatim evidence quotes + page cites. This is the real mode — run it inside the workspace, where the PHI lives; the engine goes to the data.
- **Keyword mode** (no key): deterministic fallback so the pipeline never dies silently — confidence capped at 60%, a `HEURISTIC_MODE` flag on every sheet, blanks + flags instead of guesses. Fine for smoke-testing the plumbing; not for live case prep.

## What the engine enforces (spec §3–§6)

- **Check rule (§3):** a party's factor is checked **only if their brief actually raises it**, and every check carries at least one verbatim quote with a page cite (an AI check without evidence is structurally demoted to unchecked). The rationale must prove the brief was read.
- **House rationale (§4):** ¶1 portal-injected (the sheet warns not to paste over it) → ¶2 standard → IP discussion **ordered by importance: factor 5 (good-faith/contracted rates) first, factor 3 (acuity) second**, with CMS weight language (`considerable/some/modest weight`) → NIP discussion → verbatim close with the prevailing party. **VERIFY-VERBATIM before first live use:** ¶2 and the close came from the spec transcript — check them once against a completed case (§4 build note); the output carries a non-pasting reminder until then.
- **Edge cases (§6) → flags, never guesses:** `IDENTICAL_OFFERS` (IP == NIP on a line → no recommendation, human rules) · `MISSING_DOC` · `MISSING_CITED_EXHIBIT` (brief cites exhibits absent from the folder) · `SPLIT_DECISION` (PP differs across batch lines → full rationale per divergent line, no DLI chaining across the split) · `NIP_OFFER_EQUALS_QPA` · `EXTRACTION_GAP` · `TEMPLATE_DEVIATION` · `HEURISTIC_MODE`. Blocking flags turn the affected line's recommendation into `FLAG`.
- **QPA (§2):** extracted and displayed, never used as an anchor — it is the NIP's own number.

## Template fingerprint (§5)

Every brief is fingerprinted: a **shell hash** (numbers/dates/amounts stripped → the reusable template) plus a **content hash** (this exact filing). Familiar shell + different case numbers = normal reuse, quiet. Familiar shell + **changed wording or a shifted exhibit count** = 🚨 `TEMPLATE_DEVIATION`, blocking — the lazy-arbiter trap, industrialized. New templates auto-register into `lib/idr-engine/template-library.json`; the batch runner shares one library across the run. **The QA team's v3 template catalog is the seed library** — when it arrives it is ingested into that same JSON (entries carry a `factorMap` slot for its pre-mapped factor selections).

## Portal interaction doctrine

Today, the answer sheet IS the interface: the reviewer transcribes it into the submission portal by hand. The planned later phase is an **in-workspace browser assist** that pre-fills the submission portal's checkboxes and fields directly from `answer-sheet.json` and **hard-stops before submit** — the human reviews every pre-filled field and personally clicks. No CMS portal automation, ever. Like everything else here, that assist is internal-only tooling and is never disclosed externally.

## PHI

Case documents never leave the workspace/VPC — this tool reads a local folder and writes next to it. The only network call is the Anthropic API in LLM mode (the same path the UM brief engine uses). No portal automation, no uploads, nothing else. `.txt` files are accepted alongside PDFs for fixtures and smoke tests; scanned/image-only PDFs yield empty text and produce flags, not guesses (OCR is a later phase).
