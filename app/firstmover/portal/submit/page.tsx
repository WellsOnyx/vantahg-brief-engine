'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  validateIntake,
  type IntakeServiceType,
  type IntakePayload,
} from '@/lib/firstmover/required-fields';

interface ClientOption {
  id: string;
  name: string;
}

const SERVICE_OPTIONS: { value: IntakeServiceType; label: string }[] = [
  { value: 'outpatient', label: 'Outpatient procedure / imaging' },
  { value: 'medication', label: 'Medication' },
  { value: 'home_health', label: 'Home health' },
  { value: 'therapy', label: 'Therapy (PT/OT/ST)' },
  { value: 'inpatient', label: 'Inpatient admission' },
  { value: 'dme', label: 'DME' },
];

export default function ProviderSubmitPage() {
  const router = useRouter();
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientId, setClientId] = useState('');
  const [serviceType, setServiceType] = useState<IntakeServiceType>('outpatient');
  const [payload, setPayload] = useState<IntakePayload>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missingFields, setMissingFields] = useState<{ key: string; label: string }[]>([]);
  const [eligibilityError, setEligibilityError] = useState<string | null>(null);
  const [docNames, setDocNames] = useState<string[]>([]);
  const [dmeDraft, setDmeDraft] = useState({ description: '', code: '' });

  useEffect(() => {
    fetch('/api/clients')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setClients(data.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
      })
      .catch(() => setClients([]));
  }, []);

  const validation = useMemo(() => validateIntake(payload, serviceType), [payload, serviceType]);

  function update<K extends keyof IntakePayload>(key: K, value: IntakePayload[K]) {
    setPayload((p) => ({ ...p, [key]: value }));
  }

  async function submit() {
    if (!clientId || !validation.valid) return;
    setSubmitting(true);
    setError(null);
    setMissingFields([]);
    setEligibilityError(null);

    try {
      const res = await fetch('/api/firstmover/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          service_type: serviceType,
          payload,
          intake_channel: 'provider_portal',
        }),
      });
      const data = await res.json();

      if (res.status === 422) {
        setMissingFields(data.missing || []);
        setError(data.error || 'Some required fields are missing.');
        return;
      }
      if (res.status === 409) {
        setEligibilityError(data.eligibility?.message || 'Member coverage could not be confirmed.');
        return;
      }
      if (!res.ok) {
        setError(data.error || 'Submission failed.');
        return;
      }

      router.push(`/firstmover/portal/cases/submitted?ref=${data.case_number}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="font-serif text-2xl">Submit a pre-authorization</h1>
        <p className="text-sm text-slate-600 mt-1">
          We&apos;ll only open the case once everything required for the service type is captured —
          this prevents a stuck auth on your end.
        </p>
      </div>

      <Section title="Plan / TPA">
        <select
          className="w-full border border-slate-300 rounded px-3 py-2 bg-white"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
        >
          <option value="">Select your patient&apos;s plan&hellip;</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </Section>

      <Section title="Service type">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {SERVICE_OPTIONS.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setServiceType(s.value)}
              className={`text-left text-sm border rounded px-3 py-2 transition ${
                serviceType === s.value
                  ? 'border-[#0c2340] bg-[#0c2340] text-white'
                  : 'border-slate-300 bg-white hover:border-[#c9a227]'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Member">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Member name" value={payload.member_name || ''} onChange={(v) => update('member_name', v)} />
          <Field label="Member ID" value={payload.member_id || ''} onChange={(v) => update('member_id', v)} />
          <Field type="date" label="Date of birth" value={payload.member_dob || ''} onChange={(v) => update('member_dob', v)} />
          <Field type="date" label="Date of service" value={payload.date_of_service || ''} onChange={(v) => update('date_of_service', v)} />
        </div>
      </Section>

      <Section title="Procedure / service">
        <Field label="Procedure or service description" value={payload.procedure_description || ''} onChange={(v) => update('procedure_description', v)} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <Field label="Servicing provider NPI" value={payload.servicing_provider_npi || ''} onChange={(v) => update('servicing_provider_npi', v)} />
          <Field label="Servicing provider name" value={payload.servicing_provider || ''} onChange={(v) => update('servicing_provider', v)} />
        </div>
        <div className="mt-3">
          <Field label="Service location address" value={payload.servicing_provider_address || ''} onChange={(v) => update('servicing_provider_address', v)} />
        </div>
      </Section>

      {serviceType === 'outpatient' && (
        <Section title="3-month service window">
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
            Notification is required within 24-48 hours of admission.
          </p>
        </Section>
      )}

      {serviceType === 'dme' && (
        <Section title="DME — one CPT/HCPCS code per item">
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
              <input className="border border-slate-300 rounded px-2 py-1.5 text-sm w-32" placeholder="CPT/HCPCS" value={dmeDraft.code} onChange={(e) => setDmeDraft({ ...dmeDraft, code: e.target.value })} />
              <input className="border border-slate-300 rounded px-2 py-1.5 text-sm flex-1" placeholder="Item description" value={dmeDraft.description} onChange={(e) => setDmeDraft({ ...dmeDraft, description: e.target.value })} />
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

      <Section title="Supporting clinicals (optional)">
        <input
          type="file"
          multiple
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            setDocNames(files.map((f) => f.name));
          }}
          className="text-sm"
        />
        {docNames.length > 0 && (
          <ul className="mt-2 text-xs text-slate-600 space-y-0.5">
            {docNames.map((n) => <li key={n}>• {n}</li>)}
          </ul>
        )}
        <p className="text-xs text-slate-500 mt-2">
          Demo: filenames captured but not uploaded. Real storage is in the next sprint.
        </p>
      </Section>

      {missingFields.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm">
          <p className="font-semibold text-amber-900">Please add:</p>
          <ul className="mt-1 text-amber-900 space-y-0.5">
            {missingFields.map((m) => <li key={m.key}>• {m.label}</li>)}
          </ul>
        </div>
      )}

      {eligibilityError && (
        <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-800">
          <p className="font-semibold">Member eligibility could not be confirmed.</p>
          <p className="mt-1">{eligibilityError}</p>
          <p className="mt-2 text-xs italic">Please verify the member ID with your patient and try again, or contact your TPA representative.</p>
        </div>
      )}

      {error && !missingFields.length && !eligibilityError && (
        <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-800">{error}</div>
      )}

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => { setPayload({}); setDocNames([]); setMissingFields([]); setError(null); setEligibilityError(null); }}
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!clientId || !validation.valid || submitting}
          className="bg-[#c9a227] disabled:bg-slate-300 disabled:cursor-not-allowed text-[#0c2340] disabled:text-slate-500 font-medium px-5 py-2 rounded"
        >
          {submitting ? 'Submitting…' : 'Submit pre-authorization'}
        </button>
      </div>
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
  label, value, onChange, type = 'text', placeholder,
}: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-600 mb-1">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:border-[#0c2340] focus:outline-none"
      />
    </label>
  );
}
