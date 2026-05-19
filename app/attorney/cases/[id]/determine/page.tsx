'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { DeterminationForm } from '@/components/DeterminationForm';
import type { DeterminationFields } from '@/components/DeterminationForm';

interface IdrCase {
  id: string;
  case_number: string;
  status: string;
  patient_name: string | null;
  procedure_description: string | null;
  payer_name: string | null;
  case_type: string;
}

/**
 * Attorney Determination Screen for Payer IDR cases.
 * Attorneys can review the case details and submit their determination + rationale.
 */
export default function AttorneyDeterminePage() {
  const params = useParams();
  const router = useRouter();
  const caseId = params.id as string;

  const [caseData, setCaseData] = useState<IdrCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!caseId) return;

    async function loadCase() {
      try {
        const res = await fetch(`/api/cases/${caseId}`, { cache: 'no-store' });
        if (!res.ok) {
          if (res.status === 403) {
            setError('You do not have access to this case.');
          } else {
            setError('Failed to load case details.');
          }
          return;
        }
        const data = await res.json();
        if (data.case_type !== 'payer_idr') {
          setError('This determination screen is only for Payer IDR cases.');
          return;
        }
        setCaseData(data);
      } catch {
        setError('Network error while loading case.');
      } finally {
        setLoading(false);
      }
    }

    loadCase();
  }, [caseId]);

  async function handleSubmit(fields: DeterminationFields) {
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/cases/${caseId}/attorney-determination`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to submit determination.');
      }

      setSuccess(true);
      // Redirect back to attorney queue after short delay
      setTimeout(() => {
        router.push('/attorney/review');
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Submission failed.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted">Loading case…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-3xl mx-auto">
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
            {error}
          </div>
          <Link href="/attorney/review" className="mt-4 inline-block text-navy hover:underline">
            ← Back to Attorney Queue
          </Link>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-4xl">
            ✓
          </div>
          <h1 className="text-2xl font-bold text-navy">Determination Submitted</h1>
          <p className="text-muted mt-2">Returning to the Attorney Review Queue…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <Link href="/attorney/review" className="text-sm text-muted hover:text-navy">
            ← Back to Attorney Review Queue
          </Link>
          <h1 className="font-[family-name:var(--font-dm-serif)] text-3xl text-navy mt-2">
            Attorney Determination
          </h1>
          <p className="text-muted mt-1">
            Case <span className="font-mono font-semibold">{caseData?.case_number}</span>
            {caseData?.patient_name && ` • ${caseData.patient_name}`}
          </p>
          {caseData?.payer_name && (
            <p className="text-sm text-muted">Payer: {caseData.payer_name}</p>
          )}
        </div>

        <div className="bg-surface rounded-xl border border-border p-6 md:p-8">
          <DeterminationForm
            onSubmit={handleSubmit}
            isSubmitting={submitting}
            // We can later pass IDR-specific guidance or options here
          />
        </div>

        <div className="mt-6 text-xs text-muted">
          Your determination and rationale will be permanently recorded and visible to the TPA and internal teams.
        </div>
      </div>
    </div>
  );
}
