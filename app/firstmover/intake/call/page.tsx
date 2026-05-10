'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  validateIntake,
  formatMissingForCaller,
  getRequiredFieldLabels,
  type IntakeServiceType,
  type IntakePayload,
} from '@/lib/firstmover/required-fields';
import type { EligibilityResult } from '@/lib/firstmover/eligibility';

interface ClientOption {
  id: string;
  name: string;
}

const SERVICE_TYPES: { value: IntakeServiceType; label: string; hint: string }[] = [
  { value: 'outpatient', label: 'Outpatient', hint: 'Procedure, imaging, specialty referral' },
  { value: 'medication', label: 'Medication', hint: 'Drug auth — name, dose, frequency' },
  { value: 'home_health', label: 'Home Health', hint: 'Frequency + duration' },
  { value: 'therapy', label: 'Therapy', hint: 'PT/OT/ST — frequency + duration' },
  { value: 'inpatient', label: 'Inpatient', hint: 'Admission notification (24-48h window)' },
  { value: 'dme', label: 'DME', hint: 'CPT/HCPCS code per item' },
];

export default function ConciergeCallIntake() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-500">Loading intake form&hellip;</div>}>
      <ConciergeCallIntakeForm />
    </Suspense>
  );
}

function ConciergeCallIntakeForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queueId = searchParams.get('queue_id');
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientId, setClientId] = useState('');
  const [serviceType, setServiceType] = useState<IntakeServiceType>('outpatient');
  const [payload, setPayload] = useState<IntakePayload>({});
  const [eligibility, setEligibility] = useState<EligibilityResult | null>(null);
  const [eligibilityChecking, setEligibilityChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [dmeDraft, setDmeDraft] = useState({ description: '', code: '' });
  const [prefillBanner, setPrefillBanner] = useState<{ source: string; supplied: string[]; confidence: number | null } | null>(null);

  useEffect(() => {
    fetch('/api/clients')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setClients(data.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
      })
      .catch(() => setClients([]));
  }, []);

  // Pre-fill from eFax / email queue when ?queue_id=... is present
  useEffect(() => {
    if (!queueId) return;
    fetch(`/api/firstmover/intake/from-queue/${queueId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.payload) {
          setPayload((p) => ({ ...p, ...data.payload }));
        }
        if (data?.service_type_guess) {
          setServiceType(data.service_type_guess as IntakeServiceType);
        }
        setPrefillBanner({
          source: data?.source || 'queue',
          supplied: Array.isArray(data?.supplied_fields) ? data.supplied_fields : [],
          confidence: typeof data?.extraction_confidence === 'number' ? data.extraction_confidence : null,
        });
      })
      .catch(() => {
        setPrefillBanner({ source: 'queue', supplied: [], confidence: null });
      });
  }, [queueId]);

  const validation = useMemo(() => validateIntake(payload, serviceType), [payload, serviceType]);
  const requiredLabels = useMemo(() => getRequiredFieldLabels(serviceType), [serviceType]);

  const canSubmit =
    !!clientId && validation.valid && eligibility?.status === 'green' && !submitting;

  function update<K extends keyof IntakePayload>(key: K, value: IntakePayload[K]) {
    setPayload((p) => ({ ...p, [key]: value }));
  }

  async function runEligibility() {
    if (!clientId || !payload.member_id) return;
    setEligibilityChecking(true);
    try {
      const res = await fetch('/api/firstmover/eligibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          member_id: payload.member_id,
          date_of_service: payload.date_of_service,
        }),
      });
      const data = await res.json();
      setEligibility(data);
    } catch {
      setEligibility({
        status: 'unknown',
        member_id: payload.member_id,
        message: 'Eligibility check failed.',
        next_action: 'Manager must call TPA to confirm.',
      });
    } finally {
      setEligibilityChecking(false);
    }
  }

  async function submitIntake() {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/firstmover/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          service_type: serviceType,
          payload,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error || 'Submission failed');
        return;
      }
      router.push(`/firstmover/cases/${data.case_id}?intake=concierge`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
      <div className="space-y-6">
        <div>
          <h1 className="font-serif text-2xl">Concierge call intake</h1>
          <p className="text-sm text-slate-600 mt-1">
            Take a call from a provider office. Required fields are gated by service type — the
            SLA clock won&apos;t start until everything below is complete and the member shows green.
          </p>
          {prefillBanner && (
            <div className="mt-3 bg-sky-50 border border-sky-200 rounded p-3 text-sm">
              <div className="font-medium text-sky-900">
                Pre-filled from {prefillBanner.source}
                {prefillBanner.confidence !== null && (
                  <span className="text-xs ml-2 text-sky-700">
                    (extraction confidence: {prefillBanner.confidence}%)
                  </span>
                )}
              </div>
              {prefillBanner.supplied.length > 0 ? (
                <p className="text-xs text-sky-800 mt-1">
                  Auto-populated: {prefillBanner.supplied.join(', ')}. Verify each field with the
                  caller and fill any gaps before submitting.
                </p>
              ) : (
                <p className="text-xs text-sky-800 mt-1">
                  No fields could be extracted from the source. Walk through the form with the caller.
                </p>
              )}
            </div>
          )}
        </div>

        <Section title="Client (TPA)">
          <select
            className="w-full border border-slate-300 rounded px-3 py-2 bg-white"
            value={clientId}
            onChange={(e) => {
              setClientId(e.target.value);
              setEligibility(null);
            }}
          >
            <option value="">Select TPA / client&hellip;</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Section>

        <Section title="Service type">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {SERVICE_TYPES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setServiceType(s.value)}
                className={`text-left border rounded p-3 transition ${
                  serviceType === s.value
                    ? 'border-[#0c2340] bg-[#0c2340] text-white'
                    : 'border-slate-300 bg-white hover:border-[#c9a227]'
                }`}
              >
                <div className="font-medium">{s.label}</div>
                <div className={`text-xs mt-0.5 ${serviceType === s.value ? 'text-amber-100' : 'text-slate-500'}`}>
                  {s.hint}
                </div>
              </button>
            ))}
          </div>
        </Section>

        <Section title="Member">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Member name" value={payload.member_name || ''} onChange={(v) => update('member_name', v)} />
            <Field
              label="Member ID"
              value={payload.member_id || ''}
              onChange={(v) => update('member_id', v)}
              onBlur={runEligibility}
            />
            <Field type="date" label="Date of birth" value={payload.member_dob || ''} onChange={(v) => update('member_dob', v)} />
            <Field type="date" label="Date of service" value={payload.date_of_service || ''} onChange={(v) => update('date_of_service', v)} onBlur={runEligibility} />
          </div>
          <EligibilityPanel
            eligibility={eligibility}
            checking={eligibilityChecking}
            onCheck={runEligibility}
            disabled={!clientId || !payload.member_id}
          />
        </Section>

        <Section title="Procedure / service">
          <div className="grid grid-cols-1 gap-3">
            <Field
              label="Procedure or service description"
              value={payload.procedure_description || ''}
              onChange={(v) => update('procedure_description', v)}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field
                label="Servicing provider NPI"
                value={payload.servicing_provider_npi || ''}
                onChange={(v) => update('servicing_provider_npi', v)}
              />
              <Field
                label="Servicing provider name"
                value={payload.servicing_provider || ''}
                onChange={(v) => update('servicing_provider', v)}
              />
            </div>
            <Field
              label="Service location address (for in-network check)"
              value={payload.servicing_provider_address || ''}
              onChange={(v) => update('servicing_provider_address', v)}
            />
          </div>
        </Section>

        {serviceType === 'outpatient' && (
          <Section title="Outpatient — 3-month service window">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field type="date" label="Window start" value={payload.service_window_start || ''} onChange={(v) => update('service_window_start', v)} />
              <Field type="date" label="Window end" value={payload.service_window_end || ''} onChange={(v) => update('service_window_end', v)} />
            </div>
          </Section>
        )}

        {serviceType === 'medication' && (
          <Section title="Medication">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="Drug name" value={payload.drug_name || ''} onChange={(v) => update('drug_name', v)} />
              <Field label="Dosage" value={payload.drug_dosage || ''} onChange={(v) => update('drug_dosage', v)} />
              <Field label="Frequency" value={payload.drug_frequency || ''} onChange={(v) => update('drug_frequency', v)} />
            </div>
          </Section>
        )}

        {(serviceType === 'home_health' || serviceType === 'therapy') && (
          <Section title={serviceType === 'home_health' ? 'Home health' : 'Therapy'}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Visit frequency" value={payload.visit_frequency || ''} onChange={(v) => update('visit_frequency', v)} placeholder="e.g., 3x/week" />
              <Field label="Duration" value={payload.visit_duration || ''} onChange={(v) => update('visit_duration', v)} placeholder="e.g., 6 weeks" />
            </div>
          </Section>
        )}

        {serviceType === 'inpatient' && (
          <Section title="Inpatient admission">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Facility name" value={payload.facility_name || ''} onChange={(v) => update('facility_name', v)} />
              <Field type="date" label="Admission date" value={payload.admission_date || ''} onChange={(v) => update('admission_date', v)} />
            </div>
            <p className="text-xs text-amber-700 mt-2">
              Notification window is 24-48h after admit. If the admit date is more than 2 days ago,
              this case will be flagged for MD review.
            </p>
          </Section>
        )}

        {serviceType === 'dme' && (
          <Section title="DME — CPT/HCPCS code per item">
            <div className="space-y-2">
              {(payload.dme_items || []).map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="font-mono bg-slate-100 px-2 py-0.5 rounded">{item.code}</span>
                  <span className="flex-1">{item.description}</span>
                  <button
                    type="button"
                    onClick={() => update('dme_items', (payload.dme_items || []).filter((_, idx) => idx !== i))}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <input
                  className="border border-slate-300 rounded px-2 py-1.5 text-sm w-32"
                  placeholder="CPT/HCPCS"
                  value={dmeDraft.code}
                  onChange={(e) => setDmeDraft({ ...dmeDraft, code: e.target.value })}
                />
                <input
                  className="border border-slate-300 rounded px-2 py-1.5 text-sm flex-1"
                  placeholder="Item description"
                  value={dmeDraft.description}
                  onChange={(e) => setDmeDraft({ ...dmeDraft, description: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!dmeDraft.code || !dmeDraft.description) return;
                    update('dme_items', [...(payload.dme_items || []), dmeDraft]);
                    setDmeDraft({ code: '', description: '' });
                  }}
                  className="bg-[#0c2340] text-white text-sm px-3 py-1.5 rounded hover:bg-[#173869]"
                >
                  Add item
                </button>
              </div>
            </div>
          </Section>
        )}

        {submitError && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded p-3 text-sm">
            {submitError}
          </div>
        )}

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              setPayload({});
              setEligibility(null);
              setSubmitError(null);
            }}
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            Clear form
          </button>
          <button
            type="button"
            onClick={submitIntake}
            disabled={!canSubmit}
            className="bg-[#c9a227] disabled:bg-slate-300 disabled:cursor-not-allowed text-[#0c2340] disabled:text-slate-500 font-medium px-5 py-2 rounded"
          >
            {submitting ? 'Submitting…' : 'Submit & start SLA clock'}
          </button>
        </div>
      </div>

      <aside className="lg:sticky lg:top-4 self-start space-y-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <h3 className="font-serif text-lg">Validation</h3>
          {validation.valid ? (
            <p className="text-sm text-emerald-700 mt-2">
              All required fields present for <strong>{serviceType}</strong>. Ready to submit when
              eligibility is green.
            </p>
          ) : (
            <>
              <p className="text-sm text-amber-800 mt-2">
                Missing <strong>{validation.missing.length}</strong> of {requiredLabels.length} required:
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {validation.missing.map((m) => (
                  <li key={m.key} className="text-slate-700">• {m.label}</li>
                ))}
              </ul>
              <div className="mt-3 bg-amber-50 border border-amber-200 rounded p-3 text-xs">
                <div className="font-semibold text-amber-900 mb-1">Read to caller:</div>
                <p className="text-amber-900 italic">
                  &ldquo;Before I can open this auth, I need {formatMissingForCaller(validation.missing)}.
                  Please call back when you have those handy — I don&apos;t want to start the clock without
                  the full picture.&rdquo;
                </p>
              </div>
            </>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <h3 className="font-serif text-lg">Required for {serviceType}</h3>
          <ul className="mt-2 space-y-1 text-xs text-slate-600">
            {requiredLabels.map((l) => (
              <li key={l}>• {l}</li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-slate-200 rounded-lg p-4">
      <h2 className="font-serif text-lg mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  onBlur,
  type = 'text',
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-600 mb-1">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:border-[#0c2340] focus:outline-none"
      />
    </label>
  );
}

function EligibilityPanel({
  eligibility,
  checking,
  onCheck,
  disabled,
}: {
  eligibility: EligibilityResult | null;
  checking: boolean;
  onCheck: () => void;
  disabled: boolean;
}) {
  return (
    <div className="mt-3 flex items-center gap-3">
      <button
        type="button"
        onClick={onCheck}
        disabled={disabled || checking}
        className="text-sm border border-slate-300 rounded px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {checking ? 'Checking…' : 'Check eligibility'}
      </button>
      {eligibility && (
        <div className="flex items-center gap-2 text-sm">
          <span
            className={`inline-block w-3 h-3 rounded-full ${
              eligibility.status === 'green' ? 'bg-emerald-500' : eligibility.status === 'red' ? 'bg-red-500' : 'bg-slate-400'
            }`}
          />
          <span className={eligibility.status === 'red' ? 'text-red-700' : 'text-slate-700'}>
            {eligibility.message}
            {eligibility.next_action && (
              <span className="block text-xs italic mt-0.5">{eligibility.next_action}</span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
