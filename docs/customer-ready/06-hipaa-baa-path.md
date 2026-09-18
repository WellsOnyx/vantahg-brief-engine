# 06 — HIPAA & BAA path

## Honest split

| Surface | PHI allowed? | Why |
|---------|--------------|-----|
| AWS Brief Engine (RDS, S3, SES, Cognito, Fargate) | **Yes**, under BAA | Clinical SoR |
| Grok / VantaUM agent computers / chat | **No** | Not a BAA environment |
| CX relationship memory | **No** live PHI | Status + account only |
| Demo / synthetic packs | Synthetic only | Pre-BAA and training |

## Hard gates before first live PHI case

1. Executed client BAA + required subprocessor BAAs.
2. Merge AWS DB/email path (PR #50) and deploy with `ENABLE_AWS_DB/STORAGE/EMAIL=true`.
3. Cognito auth cutover for clinical users (`ENABLE_AWS_AUTH=true`); kill Supabase Auth hybrid for live tenants.
4. SES domain verified; exit sandbox (or dedicated production identity).
5. Encryption at rest/in transit verified; secrets in SSM/Secrets Manager — not in git.
6. Access logging + admin audit review path documented.
7. Retention + disposal policy written; backup/restore tested once.
8. Breach notification runbook (contacts, 60-hour internal clock discipline).
9. Minimum necessary / role access reviewed with Cole + legal.
10. No PHI in tickets, Slack, Health chat, or email subjects.

## Operational rules

- Synthetic → shadow → live (see 02 Phase E).
- MD sign every live determination at go-live.
- Break-glass access: reason code + time-boxed + weekly review.
- Vendors (Meow, HelloSign, Phaxio, Gravity Rail): production keys only after BAA/DPA as applicable; slots without keys stay dark.

## Explicit non-compliance traps

- Pasting clinical text into Grok for “help drafting.”
- Forwarding denial letters through personal email.
- Using local zip / laptop demo mode with real PHI.
