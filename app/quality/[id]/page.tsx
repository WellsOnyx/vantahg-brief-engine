'use client';

/**
 * /quality/[id] — the auditor's scoring page.
 *
 * The /api/quality/audits POST creates a quality_audits row in
 * `pending` status. The auditing RN comes to this page, fills in
 * the four scoring fields + notes, and submits. The PATCH endpoint
 * (lib/quality-audit.ts:submitAudit) computes overall_score as the
 * average of the two percentage scores and flips status to
 * `completed`.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import type { QualityAudit } from '@/lib/types';

interface FormState {
  criteria_accuracy: number;
  documentation_quality: number;
  sla_compliance: boolean;
  determination_appropriate: boolean;
  notes: string;
}

const DEFAULT_FORM: FormState = {
  criteria_accuracy: 90,
  documentation_quality: 90,
  sla_compliance: true,
  determination_appropriate: true,
  notes: '',
};

export default function AuditDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [audit, setAudit] = useState<QualityAudit | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/quality/audits/${id}`);
      if (res.status === 404) {
        setFetchError('Audit not found. It may have been deleted, or your demo mode has no per-id fixture.');
        return;
      }
      if (!res.ok) {
        setFetchError(`Failed to load (${res.status})`);
        return;
      }
      const data = (await res.json()) as QualityAudit;
      setAudit(data);
      // Seed the form from existing values if the audit is already
      // scored (re-edits) — otherwise leave defaults.
      if (data.status === 'completed') {
        setForm({
          criteria_accuracy: data.criteria_accuracy ?? 90,
          documentation_quality: data.documentation_quality ?? 90,
          sla_compliance: data.sla_compliance ?? true,
          determination_appropriate: data.determination_appropriate ?? true,
          notes: data.notes ?? '',
        });
      }
    } catch {
      setFetchError('Network error');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/quality/audits/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitError(data?.error || `Failed (${res.status})`);
        return;
      }
      router.push('/quality');
    } catch {
      setSubmitError('Network error');
    } finally {
      setSubmitting(false);
    }
  }

  const computedOverall = Math.round(
    (form.criteria_accuracy + form.documentation_quality) / 2,
  );

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-8 py-12">
        <div className="skeleton skeleton-heading w-64 mb-4" />
        <div className="skeleton skeleton-text w-full" />
      </div>
    );
  }

  if (fetchError || !audit) {
    return (
      <div className="max-w-3xl mx-auto px-8 py-12 text-center">
        <h1 className="text-xl font-semibold">{fetchError || 'Audit not found'}</h1>
        <Link href="/quality" className="text-navy hover:underline text-sm mt-4 inline-block">
          ← Back to Quality
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-8 py-10">
      <Link href="/quality" className="text-sm text-muted hover:text-navy">
        ← Back to Quality
      </Link>

      <div className="flex items-center justify-between mt-3 mb-6 flex-wrap gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-dm-serif)] text-2xl text-navy">Quality audit scoring</h1>
          <p className="text-xs text-muted mt-0.5">
            Case <span className="font-mono">{audit.case_id}</span>
            {' • '}Status:{' '}
            <span className={`font-semibold ${audit.status === 'completed' ? 'text-green-700' : 'text-amber-700'}`}>
              {audit.status}
            </span>
          </p>
        </div>
        <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-bold ${
          computedOverall >= 90 ? 'bg-green-100 text-green-800' :
          computedOverall >= 70 ? 'bg-yellow-100 text-yellow-800' :
          'bg-red-100 text-red-800'
        }`}>
          Overall {computedOverall}%
        </span>
      </div>

      <div className="bg-surface rounded-xl border border-border shadow-sm p-6 space-y-5">
        <ScoreField
          label="Criteria accuracy"
          hint="Did the nurse apply the correct review criteria to this case?"
          value={form.criteria_accuracy}
          onChange={(v) => setForm({ ...form, criteria_accuracy: v })}
        />
        <ScoreField
          label="Documentation quality"
          hint="Is the rationale specific, citation-backed, and free of PHI in summaries?"
          value={form.documentation_quality}
          onChange={(v) => setForm({ ...form, documentation_quality: v })}
        />

        <ToggleField
          label="SLA compliance"
          hint="Was this case completed within its turnaround deadline?"
          value={form.sla_compliance}
          onChange={(v) => setForm({ ...form, sla_compliance: v })}
        />
        <ToggleField
          label="Determination appropriate"
          hint="Would you have made the same determination given the same evidence?"
          value={form.determination_appropriate}
          onChange={(v) => setForm({ ...form, determination_appropriate: v })}
        />

        <div>
          <label className="block text-xs font-semibold text-navy uppercase tracking-wider mb-1">Notes</label>
          <p className="text-xs text-muted mb-2">
            Optional. Coaching feedback, escalation flags, or context for the next reviewer.
          </p>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={4}
            className="w-full bg-white border border-border rounded-lg px-3 py-2 text-sm"
            placeholder="What did the nurse do well? What should they do differently next time?"
          />
        </div>

        {submitError && (
          <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {submitError}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <Link
            href="/quality"
            className="px-4 py-2 rounded-lg border border-border text-sm text-muted hover:bg-gray-50"
          >
            Cancel
          </Link>
          <button
            type="button"
            disabled={submitting}
            onClick={handleSubmit}
            className="px-5 py-2 rounded-lg bg-navy text-gold text-sm font-semibold hover:bg-navy-light disabled:opacity-50"
          >
            {submitting ? 'Submitting…' : audit.status === 'completed' ? 'Save changes' : 'Submit audit'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ScoreField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="block text-xs font-semibold text-navy uppercase tracking-wider">{label}</label>
        <span className={`text-sm font-bold tabular-nums ${
          value >= 90 ? 'text-green-700' : value >= 70 ? 'text-yellow-700' : 'text-red-700'
        }`}>
          {value}%
        </span>
      </div>
      <p className="text-xs text-muted mb-2">{hint}</p>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="w-full accent-navy"
      />
    </div>
  );
}

function ToggleField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <label className="block text-xs font-semibold text-navy uppercase tracking-wider">{label}</label>
          <p className="text-xs text-muted">{hint}</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onChange(true)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors ${
              value
                ? 'bg-green-50 border-green-200 text-green-800'
                : 'bg-white border-border text-muted hover:bg-gray-50'
            }`}
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => onChange(false)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors ${
              !value
                ? 'bg-red-50 border-red-200 text-red-800'
                : 'bg-white border-border text-muted hover:bg-gray-50'
            }`}
          >
            No
          </button>
        </div>
      </div>
    </div>
  );
}
