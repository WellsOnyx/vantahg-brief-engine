# IDR Field Intel — Live Portal Walkthrough + First Real Case Run

> **PROVENANCE NOTE:** the original `IDR_FIELD_INTEL_v1.md` attachment did not
> come through with Jonah's instruction (2026-07-21) — only the two build-spec
> documents arrived. This file reconstructs the five rulings **exactly as
> itemized in Jonah's instruction text**, which is authoritative on its own
> terms ("where it conflicts with prior assumptions, the intel wins"). When
> the original file surfaces, replace this document with it; if it contains
> anything beyond the five rulings below, apply the difference.
>
> Internal — no external disclosure. Contains no PHI.

All five rulings are **implemented and tested** in `lib/idr-engine/` as of the
commit that added this file.

## 1 · Verbatim house language + three-step weight ladder

The exact house paragraphs replace all placeholders (already landed in the
prior walkthrough commit): the NSA/prohibited-factors ¶1 (portal-injected —
rendered for comparison, never re-pasted), the chart-reference ¶2, and the
verbatim close with the prevailing party (full name at first mention, IP/NIP
at second, "…at issue in this dispute."). The weight vocabulary is a
three-step ladder — **"given modest weight" / "given some weight" / "given
less weight"** — one rung per discussed factor. Observed real usage:
good-faith negotiation emails = modest · acuity operating report = some ·
provider CV/training = less.

## 2 · The PORTAL CARD is the primary output

The report-style sheet is replaced by a **card**: keystrokes and paste blocks
only, in exact module order — COI keystrokes → factor-checkbox keystrokes
("IP: check 3, 5, 6 · NIP: check 3, 7") → rationale paste block → one Case
Info and Final Resolution record per line (DLI name slot, PP selection, DLI
sentence paste) → attestation → Cases Log row paste. **All analysis lives
below a fold** (evidence quotes, case facts, fingerprints, document
inventory, reasoning) — opened only when the reviewer needs the why.

## 3 · Eligibility-objection detection

When the NIP submission is an **objection letter instead of a merits brief**,
the card **leads** with: *check the staff eligibility notes; no recorded
ruling → send the case back.* Merits are not decided on an unresolved
eligibility objection — all lines flag until eligibility is ruled.

## 4 · Three-dimensional fingerprint library

Templates are cataloged along three dimensions that never cross-match:
**payer-vendor merits templates** (NIP), **eligibility-objection templates**
(NIP objection letters), and **provider-side templates** (IP). Deviation
alarms (changed wording / shifted exhibit count within a familiar shell)
apply per dimension.

## 5 · New guards

- **Prohibited-factor guard:** billed charges NEVER inform recommendations
  (NSA-prohibited). Enforced structurally — the engine does not extract
  billed charges — and by a leak-style test proving billed-charge amounts in
  the documents never appear in recommendations or rationale.
- **Identical-offer lines are no-ops:** both offers equal → outcome-neutral;
  either selection yields the same amount. The card says so and the line
  doesn't block the queue (supersedes the old block-flag behavior).
- **Prior determinations** among the exhibits are parsed — outcome (IP/NIP)
  and date — and listed below the fold for the reviewer.
- **Duplicate files** are deduped **by content**: identical bytes under
  different names are analyzed once and listed as duplicates in the
  inventory.
