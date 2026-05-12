'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { STEP_KEYS, STEP_LABELS, type OnboardingData, type StepKey } from '@/lib/onboarding/types';

/**
 * Authenticated onboarding wizard. Lands here after the TPA clicks their
 * magic link. Saves each step to /api/onboarding on Next, and on the
 * final step calls PATCH { complete: true } which transitions the
 * signup row from in_progress → completed.
 *
 * Resumes from `next_step` returned by GET /api/onboarding, so a TPA
 * can drop off and pick up where they left off.
 *
 * Design: navy + gold matching marketing site, generous whitespace,
 * one question block per row, single-column. Three buttons: Save & exit
 * (writes current step, returns to /client/cases), Back, Next.
 */

interface OnboardingResponse {
  signup_id: string;
  legal_name?: string;
  status: 'not_started' | 'in_progress' | 'completed';
  data: OnboardingData;
  next_step: StepKey | null;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signup, setSignup] = useState<OnboardingResponse | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [draft, setDraft] = useState<OnboardingData>({});
  const [saving, setSaving] = useState(false);

  const stepKey = STEP_KEYS[stepIdx];
  const isLastStep = stepIdx === STEP_KEYS.length - 1;
  const stepCount = STEP_KEYS.length;

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/onboarding', { cache: 'no-store' });
        if (res.status === 401) {
          router.replace('/login?next=/onboarding');
          return;
        }
        if (!res.ok) {
          setError(`Could not load onboarding (${res.status}).`);
          return;
        }
        const body = (await res.json()) as OnboardingResponse;
        setSignup(body);
        setDraft(body.data ?? {});
        if (body.status === 'completed') {
          router.replace('/client/cases');
          return;
        }
        if (body.next_step) {
          const idx = STEP_KEYS.indexOf(body.next_step);
          if (idx >= 0) setStepIdx(idx);
        }
      } catch {
        setError('Network error. Refresh to try again.');
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  async function saveStep(opts: { complete?: boolean; advance?: boolean } = {}) {
    setSaving(true);
    setError(null);
    try {
      const body: { data: Partial<OnboardingData>; complete?: boolean } = {
        data: { [stepKey]: draft[stepKey] ?? {} } as Partial<OnboardingData>,
      };
      if (opts.complete) body.complete = true;
      const res = await fetch('/api/onboarding', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Save failed (${res.status})`);
        return false;
      }
      if (opts.complete) {
        router.replace('/client/cases?onboarded=1');
        return true;
      }
      if (opts.advance) {
        if (isLastStep) {
          // Last step but not yet complete — try complete.
          return await saveStep({ complete: true });
        }
        setStepIdx((i) => Math.min(i + 1, STEP_KEYS.length - 1));
      }
      return true;
    } catch {
      setError('Network error. Try again.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  function updateStepField<K extends StepKey>(key: K, partial: Partial<NonNullable<OnboardingData[K]>>) {
    setDraft((prev) => {
      const existing = (prev[key] ?? {}) as NonNullable<OnboardingData[K]>;
      return { ...prev, [key]: { ...existing, ...partial } as OnboardingData[K] };
    });
  }

  if (loading) {
    return (
      <Frame>
        <p className="text-sm text-muted">Loading onboarding…</p>
      </Frame>
    );
  }

  if (error && !signup) {
    return (
      <Frame>
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 px-4 py-3 text-sm">{error}</div>
      </Frame>
    );
  }

  return (
    <Frame>
      <Header legalName={signup?.legal_name ?? null} stepIdx={stepIdx} stepCount={stepCount} />

      <section className="bg-surface rounded-xl border border-border shadow-sm p-6 md:p-8">
        <div className="mb-6">
          <h2 className="text-xl md:text-2xl font-bold text-navy">{STEP_LABELS[stepKey].title}</h2>
          <p className="text-sm text-muted mt-1.5 max-w-2xl">{STEP_LABELS[stepKey].blurb}</p>
        </div>

        <StepBody stepKey={stepKey} data={draft} onChange={updateStepField} />

        {error && (
          <div className="mt-5 rounded-lg bg-red-50 border border-red-200 text-red-800 px-3 py-2 text-xs">{error}</div>
        )}

        <div className="mt-7 flex items-center justify-between border-t border-border pt-5">
          <button
            onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
            disabled={stepIdx === 0 || saving}
            className="text-sm text-navy/70 hover:text-navy disabled:opacity-30"
          >
            ← Back
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={() => saveStep().then((ok) => ok && router.push('/client/cases'))}
              disabled={saving}
              className="text-sm text-navy/70 hover:text-navy disabled:opacity-50"
            >
              Save & exit
            </button>
            <button
              onClick={() => saveStep({ advance: true })}
              disabled={saving}
              className="bg-navy text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-navy/90 disabled:opacity-50"
            >
              {saving ? 'Saving…' : isLastStep ? 'Finish onboarding' : 'Next →'}
            </button>
          </div>
        </div>
      </section>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="py-10 md:py-16 bg-background min-h-screen">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">{children}</div>
    </div>
  );
}

function Header({ legalName, stepIdx, stepCount }: { legalName: string | null; stepIdx: number; stepCount: number }) {
  return (
    <header>
      <p className="text-xs uppercase tracking-wide text-muted font-semibold">Welcome to VantaUM</p>
      <h1 className="text-3xl md:text-4xl font-bold text-navy mt-1">
        {legalName ? `Let's get ${legalName} set up` : "Let's get you set up"}
      </h1>
      <p className="text-sm text-muted mt-2 max-w-2xl">
        Five short steps. Your Delivery Lead will reach out within one business day to confirm everything and schedule
        the kickoff.
      </p>
      <div className="mt-5 flex gap-1.5">
        {Array.from({ length: stepCount }).map((_, i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${i <= stepIdx ? 'bg-navy' : 'bg-border'}`}
          />
        ))}
      </div>
      <p className="text-xs text-muted mt-2">
        Step {stepIdx + 1} of {stepCount}
      </p>
    </header>
  );
}

// ── Step bodies ────────────────────────────────────────────────────────────

function StepBody({
  stepKey,
  data,
  onChange,
}: {
  stepKey: StepKey;
  data: OnboardingData;
  onChange: <K extends StepKey>(key: K, partial: Partial<NonNullable<OnboardingData[K]>>) => void;
}) {
  switch (stepKey) {
    case 'brand':
      return <BrandStep data={data.brand ?? {}} onChange={(p) => onChange('brand', p)} />;
    case 'team':
      return <TeamStep data={data.team ?? {}} onChange={(p) => onChange('team', p)} />;
    case 'intake':
      return <IntakeStep data={data.intake ?? {}} onChange={(p) => onChange('intake', p)} />;
    case 'clinical':
      return <ClinicalStep data={data.clinical ?? {}} onChange={(p) => onChange('clinical', p)} />;
    case 'kickoff':
      return <KickoffStep data={data.kickoff ?? {}} onChange={(p) => onChange('kickoff', p)} />;
  }
}

function BrandStep({ data, onChange }: { data: NonNullable<OnboardingData['brand']>; onChange: (p: Partial<NonNullable<OnboardingData['brand']>>) => void }) {
  return (
    <div className="space-y-4">
      <TextField label="Display name" hint="Shown on member letters and the portal." value={data.display_name ?? ''} onChange={(v) => onChange({ display_name: v })} />
      <TextField label="Support email" hint="What members see when they need help." value={data.support_email ?? ''} type="email" onChange={(v) => onChange({ support_email: v })} />
      <TextField label="Support phone" value={data.support_phone ?? ''} type="tel" onChange={(v) => onChange({ support_phone: v })} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextField label="Brand color (hex)" hint="e.g. #0c2340" value={data.brand_color ?? ''} onChange={(v) => onChange({ brand_color: v })} />
        <div className="flex items-end">
          <p className="text-xs text-muted">Logo upload comes in the next iteration — your Delivery Lead can collect a high-res file at kickoff.</p>
        </div>
      </div>
    </div>
  );
}

function TeamStep({ data, onChange }: { data: NonNullable<OnboardingData['team']>; onChange: (p: Partial<NonNullable<OnboardingData['team']>>) => void }) {
  return (
    <div className="space-y-6">
      <Contact label="Operations lead" hint="Day-to-day contact. Your weekly check-in goes on their calendar." value={data.operations_lead} onChange={(v) => onChange({ operations_lead: v })} />
      <Contact label="Clinical lead" hint="Optional. Looped in on clinical questions and escalations." value={data.clinical_lead} onChange={(v) => onChange({ clinical_lead: v })} />
      <Contact label="Billing contact" hint="Receives the monthly PEPM invoice." value={data.billing_contact} onChange={(v) => onChange({ billing_contact: v })} />
    </div>
  );
}

function IntakeStep({ data, onChange }: { data: NonNullable<OnboardingData['intake']>; onChange: (p: Partial<NonNullable<OnboardingData['intake']>>) => void }) {
  const channels: Array<'portal' | 'efax' | 'email' | 'api'> = ['portal', 'efax', 'email', 'api'];
  const selected = new Set(data.channels ?? []);
  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs text-muted uppercase tracking-wide font-medium block mb-2">Intake channels</label>
        <div className="flex flex-wrap gap-2">
          {channels.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                const next = new Set(selected);
                if (next.has(c)) next.delete(c);
                else next.add(c);
                onChange({ channels: Array.from(next) });
              }}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${selected.has(c) ? 'bg-navy text-white border-navy' : 'bg-white text-navy border-border hover:border-navy/40'}`}
            >
              {c === 'portal' ? 'Member portal' : c === 'efax' ? 'eFax' : c === 'email' ? 'Email' : 'API / EDI'}
            </button>
          ))}
        </div>
      </div>
      <TextField label="Existing TPA system" hint="Optional. e.g. Javelina, Eldorado, custom." value={data.existing_system ?? ''} onChange={(v) => onChange({ existing_system: v })} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <NumberField label="Expected weekly auths" value={data.expected_weekly_auths} onChange={(v) => onChange({ expected_weekly_auths: v })} />
        <NumberField label="Standard SLA (hours)" value={data.standard_sla_hours ?? 72} onChange={(v) => onChange({ standard_sla_hours: v })} />
        <NumberField label="Urgent SLA (hours)" value={data.urgent_sla_hours ?? 24} onChange={(v) => onChange({ urgent_sla_hours: v })} />
      </div>
    </div>
  );
}

function ClinicalStep({ data, onChange }: { data: NonNullable<OnboardingData['clinical']>; onChange: (p: Partial<NonNullable<OnboardingData['clinical']>>) => void }) {
  const guidelines: Array<{ value: NonNullable<OnboardingData['clinical']>['primary_guideline']; label: string }> = [
    { value: 'interqual', label: 'InterQual' },
    { value: 'mcg', label: 'MCG' },
    { value: 'cms', label: 'CMS NCD / LCD' },
    { value: 'custom', label: 'Custom plan rules' },
  ];
  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs text-muted uppercase tracking-wide font-medium block mb-2">Primary guideline source</label>
        <div className="flex flex-wrap gap-2">
          {guidelines.map((g) => (
            <button
              key={g.value}
              type="button"
              onClick={() => onChange({ primary_guideline: g.value })}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${data.primary_guideline === g.value ? 'bg-navy text-white border-navy' : 'bg-white text-navy border-border hover:border-navy/40'}`}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>
      <TextField
        label="Service categories"
        hint="Comma-separated. e.g. DME, imaging, surgical, behavioral health."
        value={(data.service_categories ?? []).join(', ')}
        onChange={(v) => onChange({ service_categories: v.split(',').map((s) => s.trim()).filter(Boolean) })}
      />
      <TextArea label="Notes for our medical directors" hint="Plan carve-outs, special preferences, anything we should know." value={data.medical_director_notes ?? ''} onChange={(v) => onChange({ medical_director_notes: v })} />
    </div>
  );
}

function KickoffStep({ data, onChange }: { data: NonNullable<OnboardingData['kickoff']>; onChange: (p: Partial<NonNullable<OnboardingData['kickoff']>>) => void }) {
  const days: Array<NonNullable<OnboardingData['kickoff']>['weekly_checkin_day']> = ['mon', 'tue', 'wed', 'thu', 'fri'];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextField label="Target go-live date" type="date" value={data.target_go_live_date ?? ''} onChange={(v) => onChange({ target_go_live_date: v })} />
        <TextField label="Time zone" hint="e.g. America/New_York" value={data.timezone ?? 'America/New_York'} onChange={(v) => onChange({ timezone: v })} />
      </div>
      <div>
        <label className="text-xs text-muted uppercase tracking-wide font-medium block mb-2">Weekly check-in day</label>
        <div className="flex flex-wrap gap-2">
          {days.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onChange({ weekly_checkin_day: d })}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors uppercase ${data.weekly_checkin_day === d ? 'bg-navy text-white border-navy' : 'bg-white text-navy border-border hover:border-navy/40'}`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>
      <TextField label="Preferred time" type="time" hint="Local to your time zone." value={data.weekly_checkin_time ?? '10:00'} onChange={(v) => onChange({ weekly_checkin_time: v })} />
    </div>
  );
}

// ── Form primitives ───────────────────────────────────────────────────────

function TextField({ label, value, onChange, hint, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; hint?: string; type?: string }) {
  return (
    <div>
      <label className="text-xs text-muted uppercase tracking-wide font-medium block mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white border border-border rounded-lg px-3 py-2 text-sm text-navy focus:outline-none focus:border-navy"
      />
      {hint && <p className="text-[11px] text-muted mt-1">{hint}</p>}
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number | undefined; onChange: (v: number | undefined) => void }) {
  return (
    <div>
      <label className="text-xs text-muted uppercase tracking-wide font-medium block mb-1.5">{label}</label>
      <input
        type="number"
        min={0}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        className="w-full bg-white border border-border rounded-lg px-3 py-2 text-sm text-navy focus:outline-none focus:border-navy"
      />
    </div>
  );
}

function TextArea({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <div>
      <label className="text-xs text-muted uppercase tracking-wide font-medium block mb-1.5">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        className="w-full bg-white border border-border rounded-lg px-3 py-2 text-sm text-navy focus:outline-none focus:border-navy"
      />
      {hint && <p className="text-[11px] text-muted mt-1">{hint}</p>}
    </div>
  );
}

function Contact({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: { name: string; email: string; phone?: string } | undefined;
  onChange: (v: { name: string; email: string; phone?: string }) => void;
}) {
  const v = value ?? { name: '', email: '', phone: '' };
  return (
    <div>
      <p className="text-sm font-semibold text-navy">{label}</p>
      {hint && <p className="text-xs text-muted mb-2">{hint}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <input
          type="text"
          placeholder="Name"
          value={v.name}
          onChange={(e) => onChange({ ...v, name: e.target.value })}
          className="bg-white border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy"
        />
        <input
          type="email"
          placeholder="Email"
          value={v.email}
          onChange={(e) => onChange({ ...v, email: e.target.value })}
          className="bg-white border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy"
        />
        <input
          type="tel"
          placeholder="Phone"
          value={v.phone ?? ''}
          onChange={(e) => onChange({ ...v, phone: e.target.value })}
          className="bg-white border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy"
        />
      </div>
    </div>
  );
}
