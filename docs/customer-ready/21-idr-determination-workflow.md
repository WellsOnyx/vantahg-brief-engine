# 21 — Federal IDR determination workflow

**Date:** 2026-10-21  
**Status:** In-memory draft workflow on synthetic tokens. No live PHI. No IDR Gateway call. No November 1 batching decision. Template prose is still the `TODO-LIVE-TEXT` placeholder.

The Brief Engine prepares a federal IDR determination. The record is tagged `VANTA_HG` / `IDR`. An IRO or Medical Review actor is denied, and the denial is audited. A Medical Review contract does not open this line.

## Content files

Reviewer wording lives in files, not in TypeScript. Live determination prose is not in the repo yet. Every template body is four placeholder paragraphs marked `TODO-LIVE-TEXT`.

| File | What it holds |
|---|---|
| `config/idr/templates/ip-*.md` | Four initiating-party templates: brief present or absent × single or batch. |
| `config/idr/templates/nip-*.md` | Eight non-initiating-party branches. See the list below. |
| `config/idr/qa-checklist.yaml` | Factor names, gate labels, CPT pattern, neutral-tone phrases, factor 7 credit patterns, structural slots, and ops-markup tokens. `version` is stamped on every draft. |

`loadIdrCatalog` parses the YAML subset and validates it. A missing gate, an unknown gate, a factor 7 credit rule aimed at anyone but the initiating party, or a template whose shape disagrees with its id fails the load. The CV sentence slot in the checklist must name `{{board_certification}}` and `{{specialty}}`.

### Templates still waiting for live text

Each of these files is a shell. The body is `TODO-LIVE-TEXT` plus one slot: chart, IP, NIP, winner.

- `config/idr/templates/ip-brief-single.md`
- `config/idr/templates/ip-brief-batch.md`
- `config/idr/templates/ip-no-brief-single.md`
- `config/idr/templates/ip-no-brief-batch.md`
- `config/idr/templates/nip-ineligible.md`
- `config/idr/templates/nip-zero-offer.md`
- `config/idr/templates/nip-no-qpa.md`
- `config/idr/templates/nip-batch-qpa-discrepancy.md`
- `config/idr/templates/nip-qpa-higher-than-brief.md`
- `config/idr/templates/nip-qpa-lower-than-brief.md`
- `config/idr/templates/nip-no-substantive-factors.md`
- `config/idr/templates/nip-nip-offer-higher.md`

## What the draft does

1. **Intake.** One line item is a single dispute. More than one is batched. A document with role `nip_brief` means the brief is present. Line items are stored. An asserted shape or brief that disagrees with the file blocks. This count is not the November 1 batching test.
2. **Offers and QPA.** Each initiating-party offer, non-initiating-party offer, and qualifying payment amount needs a document id and a page. A missing amount, a value with more than two decimal places, a missing page, or an unknown document is `MISSING`. The amount stays null. Another figure is not copied in. A missing QPA selects the `nip-no-qpa` branch when the prevailing party is the non-initiating party, and the draft still cannot become ready for review.
3. **Factors.** The checklist lists the seven statutory factors. IP factor text and NIP factor text are separate paragraphs. Training and experience is the CV slot: board certification and specialty, both taken from the CV file. An empty board certification or specialty is a hard stop. Acuity uses an attachment token when records or an operative report were filed, and the checklist `no_acuity_paragraph` slot when neither was filed. An empty no-acuity slot is a hard stop. The shipped slot is `TODO-LIVE-TEXT`, so a no-acuity draft stays blocked until that slot is replaced. Factor 7 is never credited to the initiating party. It is credited to the non-initiating party when `chart_supports_factor_7_nip` is true and a `chart` document is on the request. Notes are not copied.
4. **Template.** An initiating-party win uses brief × shape. A non-initiating-party win uses the first matching branch: ineligible, zero offer, no QPA, batch QPA discrepancy, QPA higher than the sourced brief QPA, QPA lower than the sourced brief QPA, no substantive factors on factors 2–7, NIP offer higher on the primary line. Anything else returns `nip_branch_unmatched`. Applying a different file returns `wrong_template`.
5. **Four paragraphs.** Chart, initiating party, non-initiating party, then the winner paragraph with the supplied prevailing party and reason. Batch lines after the first say `same as` plus the primary line id. The system does not pick the prevailing party or the reason.
6. **QA.** All seven gates are hard stops: template match, no CPT in acuity, CV from the file, batch link, factor 7, neutral tone, numbers match the source. Identical IP and NIP offers stop before a winner paragraph is issued. Any failure leaves status `blocked` and `clean_text` null. Clean text has no `MISSING`, `TODO-LIVE-TEXT`, template markers, or engine flags. The internal reviewer copy is prefixed with the existing DRAFT stamp.
7. **Board.** On a clean draft the fields are prevailing party, reason, date completed in `America/New_York`, and the note `ready for review`. `signed` and `submitted` are false.

`signDetermination` returns `human_signs`. `submitDetermination` returns `never_submit`. Neither function changes a draft.

## Reviewer feedback

`proposeContentEdit` takes a reviewer ref, a comment, and one find/replace against `config/idr/templates/*.md` or `config/idr/qa-checklist.yaml`. It returns a unified diff when the edited file still loads. A `.ts` path is refused. An edit that breaks the schema is refused. The function does not write the file and does not change the catalog already in memory.

## Stubs

| Seam | Behavior |
|---|---|
| `november1BatchingRules` | Effective `2026-11-01`. `implemented: false`. `eligible: null`. The same answer for every fact set. A rules object that claims to be implemented is refused before intake. |
| `stubIdrGateway` | `vendor: null`, `live_call: false`, `implemented: false`, `settled: false`. `pullDispute` returns `IDR_GATEWAY_UNIMPLEMENTED` and no offers. A port that claims a live call is refused before figures are read. |

## Left intact

IDR never-submit guards, the IRO portal, the financial billing books, Med Review packaging, and the UM price card. No screen, API route, or RDS migration in this slice.
