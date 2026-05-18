# Project Memory — /Users/jonahmanning

> Auto-populated by dream consolidation. Edit freely.

## 2026-05-18 — Item 4 (Contract admin injection) — OPTION B selected and implemented

- Chose **B**: Admin may only inject specific additional clauses/paragraphs into predefined sections. The rest of the approved MSA+Baa framework (Florida law, Jonathan Arias "Co-Chair, COO, and General Counsel" as signer) stays locked.
- Implementation:
  - Added `additional_provisions` as the single official injection variable (source: override, optional).
  - Template body now contains a conditional `{{#additional_provisions}} ... {{/additional_provisions}}` block that renders ONLY the admin-supplied text inside a clearly labeled "Additional Provisions" section immediately before signatures.
  - `POST /api/admin/signups/[id]/generate-contract` now accepts a top-level `injections: Record<string,string>` (in addition to `overrides`). Injections are merged for resolution and stored in the resulting `contracts.variable_values` + audit log (`injected_sections` array of keys used).
  - Core template comment updated to document the locked-framework + injection-point rule.
  - Signer title default corrected to exact user-specified value as part of locking the framework.
- Files changed: `lib/contracts/templates/msa-with-baa-v1.ts`, `app/api/admin/signups/[id]/generate-contract/route.ts`
- Auditability: every generated contract records exactly which injection keys were used.
- Next (UI wiring): Admin review screen on `/admin/signups/[id]` should expose a textarea for the known injection key(s) before calling the generate endpoint. (Likely next roadmap item.)
- Status: Backend generation logic complete for option B. Ready for admin UI consumption.

## Full 100-Item Roadmap (captured 2026-05-18)
The complete authoritative list was provided by user. Persisted to repo at `docs/roadmap-100-items.md` so future compactions cannot lose it again.

Current position: Item 5.

## 2026-05-18 — Items 5, 6, and 7 Complete

Item 5: Build admin review screen
Item 6: Add ability for admin to generate contract (with injection support)
Item 7: Wire contract generation to HelloSign/Dropbox Sign sending

**Item 7 polish:**
- Improved success message after "Send for signature" to clearly describe the two-signer flow (TPA first, Jonathan Arias countersigns second).
- Added prominent "Ready to send" callout immediately after generation that explains the next action and the two-signer sequence.
- The existing send-for-signature backend + hellosign-client + SignatureStatusRow (with resend/void) were already solid; Item 7 focused on making the generate → send transition obvious and trustworthy for Jonathan.
- Injection text from item 6 remains visible after generation so the admin can confirm what was added before hitting Send.

Item 5: Build admin review screen for signup requests (/admin/signups)
Item 6: Add ability for admin to generate contract from a signup request

**Item 6 changes:**
- Added `additionalProvisions` state in ContractPanel.
- Wired the textarea in two places:
  - Primary generation flow (when no contract yet)
  - Regenerate flow (when contract already exists)
- Generate contract calls now send `injections: { additional_provisions: "..." }` to the backend (from item 4).
- Success message now reflects when additional provisions were included.
- Textarea includes clear guidance that it only affects the dedicated section of the locked template.

**Changes made:**
- List page (`/admin/signups`): Defaults to "Pending Review" filter so the review queue is front-and-center. Pending rows get subtle amber highlight. Heading updated to "TPA Signup Review". Comments clarified as the admin review screen.
- Detail page (`/admin/signups/[id]`): Added prominent "Review this TPA signup request" banner when status is pending. Expanded Company section to show full structured address fields for easier verification. Updated file comments to reflect Item 5 scope.
- Kept contract generation/send UI as-is (will be enhanced in item 6 with injection support).

The review screen is now a polished, focused tool for Jonathan to evaluate incoming TPAs.

