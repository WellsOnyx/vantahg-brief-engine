-- 027: Labor-reduction metric — per-case cockpit fields.
-- Populated only when ENABLE_LABOR_METRIC=true (see docs/LABOR_METRIC.md).
-- Nullable JSONB; no backfill. Weights are estimates pending calibration.

alter table cases add column if not exists labor_metric jsonb;
alter table cases add column if not exists confidence_resolution jsonb;

comment on column cases.labor_metric is 'Labor-reduction metric (engine vs human labor units). Canonical: lib/labor-metric.ts. Estimated weights pending calibration.';
comment on column cases.confidence_resolution is 'Confidence-resolution signals: directional_confidence, brief_complete, recommendation, resolved (>=85% + complete brief + directional).';
