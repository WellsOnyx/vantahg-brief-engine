'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CaseForm } from '@/components/CaseForm';
import type { Client, CaseFormData } from '@/lib/types';

export default function NewCasePage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/clients')
      .then((res) => res.json())
      .then(setClients)
      .catch(() => setClients([]));
  }, []);

  async function handleSubmit(data: CaseFormData) {
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create case');
      }
      const newCase = await res.json();
      router.push(`/cases/${newCase.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create case');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="font-[family-name:var(--font-dm-serif)] text-3xl text-navy">
          New Case Intake
        </h1>
        <p className="text-muted mt-1">Submit a new case for AI-powered clinical brief generation</p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
          {error}
        </div>
      )}

      <div className="bg-surface rounded-lg border border-border shadow-sm p-6">
        <CaseForm clients={clients} onSubmit={handleSubmit} isSubmitting={isSubmitting} />
      </div>
    </div>
  );
}
