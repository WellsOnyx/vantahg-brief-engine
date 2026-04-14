# Mohammed Call Prep — Gulf TPA Opportunity

**Call date:** Week of April 14, 2026
**Duration:** 60 minutes
**Goal:** Platform credibility + alignment on collaboration structure

---

## His Agenda (6 points) — Your Talking Points

### 1. Current Platform State
**What's fully built and production-ready:**
- End-to-end authorization workflow: intake → AI clinical brief → physician review → determination → letter
- eFax intake pipeline with OCR + AI extraction (handles the #1 intake channel in healthcare)
- AI-powered clinical brief generation — real-time analysis against InterQual, MCG, NCCN, CMS criteria
- Case management with SLA tracking and escalation
- Clinician determination workflow with approval/denial/modification/peer-to-peer paths
- CSR triage interface for concierge team (human-led intake, Chewy-style)
- Provider authorization status portal
- HIPAA-compliant audit logging
- Dashboard and command center with real-time metrics
- Full demo environment at vantaum.com

**In active development (not blockers):**
- Email notification delivery (receipt confirmations, determination letters)
- Determination letter PDF rendering (currently HTML — PDF is formatting, not functionality)
- Quality audit dashboard (framework built, needs case volume to populate)

**How to frame it:** "The core engine is production-ready. What's still in development is delivery formatting and reporting — not the clinical decision-making infrastructure. We're intentionally at about 90% because the final 10% is implementation-specific."

---

### 2. Workflow Walkthrough
**Demo flow (screen share vantaum.com/#demo):**

```
1. INTAKE — Fax/email/call arrives → concierge CSR receives it (human)
2. AI PROCESSING — OCR extracts document → AI parses clinical data → brief generated in minutes (AI)
3. PHYSICIAN REVIEW — Same-specialty physician reviews AI brief + source docs (human)
4. DETERMINATION — Physician renders decision → letter generated → delivered to provider (human + AI)
```

**Key talking points:**
- "Humans own the bookends — intake and determination. AI owns the middle."
- "A nurse reviewer typically spends 45-60 minutes building a clinical summary. Our AI does it in under 3 minutes with the same or better accuracy."
- "The clinician still makes every determination. AI eliminates the administrative bottleneck, not the clinical judgment."
- Average turnaround: 24hr urgent, 72hr standard (vs industry 3-7 days)

---

### 3. Implementation Requirements
**What we need from the TPA (minimal):**
1. Member eligibility feed (834, CSV, or API — we're format-flexible)
2. Benefit plan summaries
3. Preferred clinical criteria (InterQual, MCG, or custom)
4. Designated escalation contact
5. eFax number (we provision or they forward existing)

**Timeline:** 8 weeks to go-live
- Weeks 1-2: Integration planning, credential exchange
- Weeks 3-4: Clinical panel alignment (specialty matching, licensing)
- Weeks 5-6: Intake channel configuration
- Weeks 7-8: Parallel testing with live cases
- Week 9+: Go-live with monitoring

**How to frame it:** "We designed onboarding to be low-friction. Five items from you, eight weeks to live. The heaviest lift is on our side — panel alignment and intake configuration."

---

### 4. Existing Traction
**Be honest, be confident:**
- "We're pre-revenue by design. We built the platform first, not the sales deck."
- "We're in active commercial discussions with TPAs in the US market." (this conversation counts)
- "Our founding partner program is capped at 300-340K member lives at launch pricing."
- "We chose to build depth before breadth — the platform handles the full authorization lifecycle, not a point solution."

**Do NOT say:** "We have no customers yet" — reframe as "We're selecting founding partners carefully."

---

### 5. Roadmap — Next 6-12 Months
**Q2 2026 (now):**
- Founding partner onboarding (US + Gulf)
- Email/PDF notification delivery
- Quality audit dashboard
- Provider portal enhancements

**Q3 2026:**
- Multi-language support (Arabic/English for Gulf)
- Payer EDI integration (X12 278/275)
- Advanced analytics and reporting
- Mobile-responsive provider portal

**Q4 2026:**
- URAC accreditation submission
- Custom clinical criteria rule engine
- Real-time eligibility verification
- Expanded clinician panel (50+ physicians)

**Q1 2027:**
- Gulf regulatory compliance certification
- Regional data residency (GCC hosting)
- White-label capability for TPA branding
- API marketplace for payer integrations

---

### 6. Gulf-Specific Considerations
**What Mohammed will probe — have answers ready:**

**Regulatory:**
- Gulf Cooperation Council (GCC) health authorities have varying requirements by emirate/country
- UAE: Dubai Health Authority (DHA), Health Authority Abu Dhabi (HAAD/DOH)
- Saudi: Council of Cooperative Health Insurance (CCHI)
- "We recognize that regulatory alignment is market-specific. That's exactly why we want a partner like you — someone who knows which doors to knock on and in what order."

**Localization:**
- Arabic language support for member-facing communications (on roadmap)
- Right-to-left UI support
- Local clinical criteria alignment (may differ from US InterQual/MCG)
- Prayer time / working hour considerations for SLA calculations

**Data residency:**
- GCC data sovereignty requirements may require regional hosting
- "Our architecture is cloud-native and portable. We can deploy to any region — AWS Bahrain, Azure UAE — without re-engineering."

**Network:**
- Clinician panel needs Gulf-licensed physicians
- "We'd look to you to help identify the right clinical partners in-region. We bring the platform and workflow. You bring the market knowledge and network."

**How to frame it:** "This is exactly the last 10% I mentioned. We built the platform to be implementation-agnostic precisely because markets like the Gulf have unique requirements. We don't want to guess — we want to build that layer with the right partner."

---

## Call Structure (suggested)

| Time | Topic |
|------|-------|
| 0-5 min | Rapport, confirm agenda |
| 5-20 min | Live demo walkthrough (screen share vantaum.com) |
| 20-30 min | Platform state + what's built vs in development |
| 30-40 min | Implementation requirements + timeline |
| 40-50 min | Gulf-specific considerations + localization |
| 50-55 min | Traction + roadmap |
| 55-60 min | Next steps — what a collaboration structure looks like |

## Key Phrases to Use
- "We buy outcomes, not infrastructure" (your blog post thesis — use it)
- "Humans own the bookends, AI owns the middle"
- "We're at 90% by design — the last 10% is implementation-specific"
- "We're selecting founding partners, not closing sales"
- "Your market knowledge + our platform = something neither of us can build alone"

## What NOT to Say
- Don't name specific vendors (Supabase, Phaxio, Vercel) — those are internal
- Don't say "no customers" — say "founding partner program"
- Don't promise Arabic support is built — it's on the roadmap
- Don't commit to specific PEPM pricing on this call — say "founding partner rates, we'll structure based on volume"
- Don't oversell what's in development as production-ready — Mohammed will respect honesty
