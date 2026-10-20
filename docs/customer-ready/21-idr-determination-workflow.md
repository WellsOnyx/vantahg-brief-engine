# 21 — Federal IDR determination workflow

**Date:** 2026-10-20  
**Status:** In-memory draft workflow on synthetic tokens. No live PHI. No IDR Gateway call. No November 1 batching decision.

The Brief Engine prepares a federal IDR determination. The record is tagged `VANTA_HG` / `IDR`. An IRO or Medical Review actor is denied, and the denial is audited. A Medical Review contract does not open this line.

## Content files

Reviewer wording lives in files, not in TypeScript.

| File | What it holds |
|---|---|
| `config/idr/templates/*.md` | Eight templates. Prevailing party (IP or NIP) × non-initiating brief present or absent × single or batch QPA wording. Four paragraphs. Frontmatter carries `version`. |
| `config/idr/qa-checklist.yaml` | Factor names, gate labels, CPT pattern, neutral-tone phrases, factor 7 credit patterns, standard sentences, and ops-markup tokens. `version` is stamped on every draft. |

`loadIdrCatalog` parses the YAML subset and validates it. A missing gate, an unknown gate, a factor 7 credit aimed at anyone but the initiating party, or a template whose QPA wording disagrees with its dispute shape fails the load. Editing a sentence in the checklist changes the next draft without a code change.

## What the draft does

1. **Intake.** One line item is a single dispute. More than one is batched. A document with role `nip_brief` means the brief is present. Line items are stored. An asserted shape or brief that disagrees with the file blocks. This count is not the November 1 batching test.
2. **Offers and QPA.** Each initiating-party offer, non-initiating-party offer, and qualifying payment amount needs a document id and a page. A missing amount, a value with more than two decimal places, a missing page, or an unknown document is `MISSING`. The amount stays null. Another figure is not copied in.
3. **Factors.** The checklist lists the seven statutory factors. The evidence map records what each party filed. Training and experience text is an excerpt of the submitted curriculum vitae. Acuity and complexity says only that medical records and/or an operative report are attached: no CPT code and no clinical argument. Factor 7 is never credited to the initiating party. Notes on the submission are not copied into the narrative.
4. **Template.** The file is chosen from prevailing party, brief, and dispute shape. Applying a different file returns `wrong_template` and does not advance.
5. **Four paragraphs.** Identification, offers and QPA, factor block, then the selected offer and the supplied reason. The system does not pick the prevailing party or the reason.
6. **QA.** All seven gates are hard stops: template match, no CPT in acuity, CV from the file, QPA variant, factor 7, neutral tone, numbers match the source. Any failure leaves status `blocked` and `clean_text` null. Clean text has no `MISSING`, template markers, or engine flags. The internal reviewer copy is prefixed with the existing DRAFT stamp.
7. **Board.** On a clean draft the fields are prevailing party, reason, date completed, and the note `ready for review`. `signed` and `submitted` are false.

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
