'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { BackLink, PageFocused, PageHero } from '@/components/layouts/PageLayouts';
import { SectionCard } from '@/components/SectionCard';
import type {
  CanonicalCase,
  DeterminationPackage,
  SpineBrief,
  SpineDetermination,
} from '@/lib/case-spine/types';

const DETERMINATIONS: SpineDetermination[] = ['approve', 'deny', 'pend', 'partial'];

export default function MedReviewSignPage() {
  const params = useParams();
  const id = params.id as string;

  const [caseData, setCaseData] = useState<CanonicalCase | null>(null);
  const [brief, setBrief] = useState<SpineBrief | null>(null);
  const [pkg, setPkg] = useState<DeterminationPackage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [determination, setDetermination] = useState<SpineDetermination>('approve');
  const [rationale, setRationale] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [fanningOut, setFanningOut] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [caseRes, briefRes, pkgRes] = await Promise.all([
        fetch(`/api/case-spine/${id}`),
        fetch(`/api/case-spine/${id}/brief`),
        fetch(`/api/case-spine/${id}/package`),
      ]);
      const caseJson = await caseRes.json();
      if (!caseRes.ok) throw new Error(caseJson.error || 'Case not found');
      setCaseData(caseJson.case);

      if (briefRes.ok) {
        const briefJson = await briefRes.json();
        setBrief(briefJson.brief);
        if (!rationale && briefJson.brief?.content?.ai_recommendation?.rationale) {
          setRationale(briefJson.brief.content.ai_recommendation.rationale);
        }
        const rec = briefJson.brief?.draft_determination;
        if (rec && DETERMINATIONS.includes(rec)) setDetermination(rec);
      }

      if (pkgRes.ok) {
        const pkgJson = await pkgRes.json();
        setPkg(pkgJson.package);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load packet');
    } finally {
      setLoading(false);
    }
    // rationale seed is one-shot; omit from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSign() {
    setSubmitting(true);
    setBanner(null);
    try {
      const res = await fetch(`/api/case-spine/${id}/sign`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ determination, rationale }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBanner(data.error || `Sign failed (${data.code || res.status})`);
        return;
      }
      setCaseData(data.case);
      setPkg(data.package);
      setBrief(data.brief);
      setBanner('Signed. Immutable package written. Deliver to fan out portal + ledger.');
    } catch (err) {
      setBanner(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-8 py-12 text-sm text-muted">Loading packet…</div>
    );
  }

  if (error || !caseData) {
    return (
      <div className="max-w-5xl mx-auto px-8 py-12">
        <h1 className="text-xl font-semibold text-navy">{error || 'Not found'}</h1>
        <Link href="/med-review" className="text-sm text-navy underline mt-3 inline-block">
          Back to queue
        </Link>
      </div>
    );
  }

  const signed = caseData.state === 'determined' || Boolean(pkg);

  return (
    <PageFocused
      hero={
        <PageHero
          eyebrow="Med review lens"
          title={caseData.case_number}
          subtitle={`${caseData.type} · ${caseData.state} · SLA ${caseData.sla_status} · fan-out ${caseData.fanout_status} · tokenized member ${caseData.intake.member_ref || 'n/a'}`}
          actions={<BackLink href="/med-review" label="Back to queue" />}
        />
      }
    >
      <PageFocused.Body
        main={
          <>
            <SectionCard eyebrow="Packet" title="Clinical packet (synthetic)">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted">Member ref</dt>
                  <dd>{caseData.intake.member_ref || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Provider</dt>
                  <dd>{caseData.intake.requesting_provider || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Service / Rx</dt>
                  <dd>{caseData.intake.service_or_rx || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Urgency</dt>
                  <dd>{caseData.priority}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs text-muted">Storage keys</dt>
                  <dd className="font-mono text-xs break-all">
                    {caseData.packet_storage_keys.length
                      ? caseData.packet_storage_keys.join(', ')
                      : caseData.intake.clinicals_pointer || '—'}
                  </dd>
                </div>
              </dl>
            </SectionCard>

            <SectionCard eyebrow="Brief" title={brief ? `Brief ${brief.brief_id.slice(0, 8)}` : 'No brief attached'}>
              {!brief && (
                <p className="text-sm text-muted">
                  A brief must be attached before sign. This case cannot be silently approved.
                </p>
              )}
              {brief && (
                <div className="space-y-3 text-sm">
                  <p className="text-xs text-muted">
                    Source {brief.source}
                    {brief.existing_brief_ref ? ` · existing id ${brief.existing_brief_ref}` : ''}
                    {` · draft ${brief.draft_determination}`}
                  </p>
                  <p>{brief.content.clinical_question}</p>
                  <p className="text-muted">{brief.content.patient_summary}</p>
                  <div>
                    <div className="text-xs uppercase tracking-wider text-muted mb-1">Criteria</div>
                    <p>{brief.content.criteria_match.applicable_guideline}</p>
                    <ul className="list-disc pl-5 mt-1">
                      {brief.content.criteria_match.criteria_met.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                      {brief.content.criteria_match.criteria_not_met.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                      {brief.content.criteria_match.criteria_unable_to_assess.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wider text-muted mb-1">Draft rationale</div>
                    <p>{brief.content.ai_recommendation.rationale}</p>
                  </div>
                </div>
              )}
            </SectionCard>
          </>
        }
        aside={
          <>
            <SectionCard eyebrow="Sign" title="MD determination" accent>
              {signed ? (
                <div className="space-y-2 text-sm">
                  <p>
                    Signed <strong>{caseData.determination}</strong>
                  </p>
                  <p className="text-muted">{caseData.signed_rationale}</p>
                  <p className="text-xs text-muted">
                    Package {caseData.determination_package_key || pkg?.storage_key}
                  </p>
                  <p className="text-xs text-muted">
                    Fan-out: {caseData.fanout_status}
                    {caseData.fanout_stub ? ` · ${caseData.fanout_stub.targets.join(', ')}` : ''}
                  </p>
                  <p className="text-xs text-muted">
                    Billable event: {caseData.billable_event_id || caseData.billable_event_stub?.billable_event_id}
                  </p>
                  {caseData.fanout_status === 'pending' && (
                    <button
                      type="button"
                      className="btn-primary w-full text-sm mt-2"
                      disabled={fanningOut}
                      onClick={async () => {
                        setFanningOut(true);
                        setBanner(null);
                        try {
                          const res = await fetch(`/api/case-spine/${id}/fanout`, { method: 'POST' });
                          const data = await res.json();
                          if (!res.ok) throw new Error(data.error || 'Fan-out failed');
                          setBanner(`Fan-out ${data.fanout.fanout_status}`);
                          await load();
                        } catch (err) {
                          setBanner(err instanceof Error ? err.message : 'Fan-out failed');
                        } finally {
                          setFanningOut(false);
                        }
                      }}
                    >
                      {fanningOut ? 'Delivering…' : 'Deliver determination'}
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <fieldset className="space-y-2">
                    <legend className="text-xs uppercase tracking-wider text-muted">Decision</legend>
                    {DETERMINATIONS.map((value) => (
                      <label key={value} className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="determination"
                          value={value}
                          checked={determination === value}
                          onChange={() => setDetermination(value)}
                        />
                        <span className="capitalize">{value}</span>
                      </label>
                    ))}
                  </fieldset>
                  <label className="block text-sm">
                    <span className="text-xs uppercase tracking-wider text-muted">Rationale</span>
                    <textarea
                      className="mt-1 w-full min-h-[140px] rounded-lg border border-border px-3 py-2 text-sm"
                      value={rationale}
                      onChange={(e) => setRationale(e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn-primary w-full text-sm"
                    disabled={submitting || !brief}
                    onClick={() => void handleSign()}
                  >
                    {submitting ? 'Signing…' : 'Sign determination'}
                  </button>
                  {!brief && (
                    <p className="text-xs text-muted">Sign is blocked until a brief is attached.</p>
                  )}
                </div>
              )}
              {banner && <p className="text-sm mt-3">{banner}</p>}
            </SectionCard>

            {pkg && (
              <SectionCard eyebrow="Write-once" title={`Package v${pkg.version}`}>
                <dl className="space-y-2 text-xs">
                  <div>
                    <dt className="text-muted">Storage key</dt>
                    <dd className="font-mono break-all">{pkg.storage_key}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Content hash</dt>
                    <dd className="font-mono break-all">{pkg.content_hash}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Immutable</dt>
                    <dd>{pkg.immutable ? 'yes' : 'no'}</dd>
                  </div>
                </dl>
              </SectionCard>
            )}
          </>
        }
      />
    </PageFocused>
  );
}
