'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Shared case-upload form used by both portals.
 *
 * Props:
 *   - scope.client_id  — required. Constrains the case to this TPA.
 *   - scope.practice_id — optional. When set (provider portal), pre-fills
 *                         and locks the practice field. When absent (TPA
 *                         portal), shows a dropdown of practices.
 *   - practiceOptions   — only used when practice_id is unset. Each row is
 *                         { id, name } for the TPA's practices.
 *   - onSuccess         — callback invoked with the created case_id so the
 *                         portal can route to the case detail page.
 *
 * Posts to /api/cases. Documents are uploaded as a second step (V1: text
 * description of attached docs; V2: real PDF uploads via the storage adapter).
 */

export interface CaseUploadFormScope {
  client_id: string;
  practice_id?: string;
}

export interface PracticeOption {
  id: string;
  name: string;
}

export interface CaseUploadFormProps {
  scope: CaseUploadFormScope;
  practiceOptions?: PracticeOption[];
  onSuccess?: (caseId: string, caseNumber: string) => void;
  caseType?: 'um' | 'payer_idr'; // defaults to 'um'
}

type Priority = 'standard' | 'urgent' | 'expedited';

interface FormState {
  patient_name: string;
  patient_dob: string;
  patient_member_id: string;
  procedure_codes: string;        // comma-separated CPT/HCPCS
  procedure_description: string;
  clinical_question: string;
  service_category: string;
  priority: Priority;
  practice_id: string;
  documents_description: string;  // free text — backup when the user has no PDF to attach

  // IDR-specific fields (only relevant when caseType === 'payer_idr')
  billed_amount: string;          // dollars, converted to cents on submit
  denial_reason: string;
  is_out_of_network: boolean;
}

interface UploadFeedback {
  accepted_count: number;
  rejected: { filename: string; reason: string; detail?: string }[];
}

const SERVICE_CATEGORIES = [
  'Outpatient',
  'Inpatient',
  'DME',
  'Imaging',
  'Behavioral Health',
  'Home Health',
  'Pharmacy',
  'Surgical',
  'Continued Stay',
  'Other',
];

export default function CaseUploadForm({ scope, practiceOptions = [], onSuccess, caseType = 'um' }: CaseUploadFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>({
    patient_name: '',
    patient_dob: '',
    patient_member_id: '',
    procedure_codes: '',
    procedure_description: '',
    clinical_question: '',
    service_category: 'Outpatient',
    priority: 'standard',
    practice_id: scope.practice_id ?? (practiceOptions[0]?.id ?? ''),
    documents_description: '',
    billed_amount: '',
    denial_reason: '',
    is_out_of_network: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateInfo, setDuplicateInfo] = useState<{ case_id: string; case_number: string; message: string } | null>(null);

  // PDF attachments. Two-phase submit: create the case via JSON POST,
  // then upload selected files via multipart POST to the documents
  // endpoint. A failed upload does NOT roll back case creation —
  // the user can retry from the case detail page.
  const [files, setFiles] = useState<File[]>([]);
  const [uploadFeedback, setUploadFeedback] = useState<UploadFeedback | null>(null);
  const [uploading, setUploading] = useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  function handleFilesPicked(picked: FileList | null) {
    if (!picked) return;
    const next = Array.from(picked);
    // Client-side guard rails — the API does the authoritative checks.
    const tooMany = next.length > 5;
    const tooLarge = next.find((f) => f.size > 10 * 1024 * 1024);
    const wrongType = next.find((f) => f.type !== 'application/pdf');
    if (tooMany) {
      setError('Pick at most 5 PDF files per submission.');
      return;
    }
    if (tooLarge) {
      setError(`"${tooLarge.name}" is larger than 10 MB.`);
      return;
    }
    if (wrongType) {
      setError(`"${wrongType.name}" is not a PDF. Only PDF attachments are accepted.`);
      return;
    }
    setError(null);
    setFiles(next);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDuplicateInfo(null);

    // Minimal validation - the API does deeper validation server-side.
    if (!form.patient_name.trim() && !form.patient_member_id.trim()) {
      setError('Patient name OR member ID is required.');
      return;
    }
    if (!form.procedure_codes.trim()) {
      setError('At least one procedure code (CPT or HCPCS) is required.');
      return;
    }
    if (!form.clinical_question.trim()) {
      setError('Clinical justification is required.');
      return;
    }

    const codes = form.procedure_codes
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);

    setSubmitting(true);
    try {
      const res = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_name: form.patient_name.trim() || null,
          patient_dob: form.patient_dob || null,
          patient_member_id: form.patient_member_id.trim() || null,
          procedure_codes: codes,
          procedure_description: form.procedure_description.trim() || null,
          clinical_question: form.clinical_question.trim(),
          service_category: form.service_category,
          priority: form.priority,
          client_id: scope.client_id,
          practice_id: form.practice_id || null,
          intake_channel: 'portal',
          status: 'intake',
          // Documents are V2 - capture the description for now so reviewers
          // know what's expected.
          internal_notes: form.documents_description.trim()
            ? `Documents (from portal): ${form.documents_description.trim()}`
            : null,

          // IDR-specific data (only sent when relevant)
          ...(caseType === 'payer_idr' && {
            case_type: 'payer_idr',
            billed_amount_cents: form.billed_amount
              ? Math.round(parseFloat(form.billed_amount) * 100)
              : null,
            denial_reason: form.denial_reason.trim() || null,
            is_out_of_network: form.is_out_of_network,
          }),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 409 && data.duplicate) {
        setDuplicateInfo({
          case_id: data.case_id,
          case_number: data.case_number,
          message: data.message ?? 'Duplicate of an existing case',
        });
        return;
      }

      if (!res.ok) {
        setError(data.error ?? `Submission failed (${res.status})`);
        return;
      }

      const caseId = data.id ?? data.case_id;
      const caseNumber = data.case_number;

      // Phase 2: upload any selected PDFs. We do this AFTER case creation
      // so a partial upload still leaves a valid case the user can
      // re-attach to from the case detail page. Failures here surface as
      // a non-fatal banner rather than blocking navigation.
      if (caseId && files.length > 0) {
        setUploading(true);
        try {
          const fd = new FormData();
          for (const f of files) fd.append('files', f);
          const uploadRes = await fetch(`/api/cases/${caseId}/documents`, {
            method: 'POST',
            body: fd,
          });
          const uploadData = (await uploadRes.json().catch(() => ({}))) as {
            accepted?: { filename: string; storage_path: string; bytes: number }[];
            rejected?: { filename: string; reason: string; detail?: string }[];
            error?: string;
          };
          if (!uploadRes.ok) {
            setUploadFeedback({
              accepted_count: 0,
              rejected: files.map((f) => ({
                filename: f.name,
                reason: 'server_error',
                detail: uploadData.error ?? `HTTP ${uploadRes.status}`,
              })),
            });
          } else {
            setUploadFeedback({
              accepted_count: uploadData.accepted?.length ?? 0,
              rejected: uploadData.rejected ?? [],
            });
          }
        } catch {
          setUploadFeedback({
            accepted_count: 0,
            rejected: files.map((f) => ({
              filename: f.name,
              reason: 'network_error',
            })),
          });
        } finally {
          setUploading(false);
        }
      }

      if (onSuccess && caseId) {
        onSuccess(caseId, caseNumber);
      } else if (caseId) {
        router.push(`/cases/${caseId}`);
      }

      // Clear attachments after successful submission path (prevents carry-over on re-use of form instance)
      setFiles([]);
      setUploadFeedback(null);
    } catch {
      setError('Network error. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <Section title="Patient">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Patient name" hint="Or use member ID below if name shouldn't be in the request">
            <input
              type="text"
              value={form.patient_name}
              onChange={(e) => update('patient_name', e.target.value)}
              className="w-full bg-white border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-navy/40"
            />
          </Field>
          <Field label="Date of birth">
            <input
              type="date"
              value={form.patient_dob}
              onChange={(e) => update('patient_dob', e.target.value)}
              className="w-full bg-white border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-navy/40"
            />
          </Field>
        </div>
        <Field label="Member ID">
          <input
            type="text"
            value={form.patient_member_id}
            onChange={(e) => update('patient_member_id', e.target.value)}
            className="w-full bg-white border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-navy/40"
            placeholder="Plan-assigned member identifier"
          />
        </Field>
      </Section>

      <Section title="Authorization request">
        <Field label="Procedure codes" hint="Comma-separated CPT or HCPCS codes (e.g. 70553, E0601)">
          <input
            type="text"
            value={form.procedure_codes}
            onChange={(e) => update('procedure_codes', e.target.value)}
            required
            className="w-full bg-white border border-border rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-navy/40"
            placeholder="70553, 99213"
          />
        </Field>
        <Field label="Procedure description">
          <input
            type="text"
            value={form.procedure_description}
            onChange={(e) => update('procedure_description', e.target.value)}
            className="w-full bg-white border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-navy/40"
            placeholder="MRI lumbar spine without contrast"
          />
        </Field>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium text-navy">Clinical justification <span className="text-red-500">*</span></label>
            <span className={`text-xs tabular-nums ${form.clinical_question.trim().length >= 80 ? 'text-emerald-600 font-medium' : 'text-muted'}`}>
              {form.clinical_question.trim().length} / min 40 chars
            </span>
          </div>
          <textarea
            value={form.clinical_question}
            onChange={(e) => update('clinical_question', e.target.value)}
            required
            rows={4}
            className="w-full bg-white border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-navy/40"
            placeholder="Patient has documented chronic low back pain for 8 weeks despite conservative PT and NSAIDs. MRI requested to evaluate for..."
          />
          <p className="text-[11px] text-muted mt-1.5">
            Strong clinical detail produces dramatically better AI briefs and faster determinations.
          </p>
        </div>
        <div>
          <Field label="Service category">
            <CategorySelector
              value={form.service_category}
              onChange={(v) => update('service_category', v)}
            />
          </Field>
        </div>
        <div>
          <Field label="Priority">
            <PrioritySelector
              value={form.priority}
              onChange={(v) => update('priority', v)}
            />
          </Field>
        </div>
      </Section>

      {caseType === 'payer_idr' && (
        <Section title="Payer IDR Details">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Billed Amount (USD)" hint="Total amount billed on the claim">
              <input
                type="number"
                step="0.01"
                value={form.billed_amount}
                onChange={(e) => update('billed_amount', e.target.value)}
                className="w-full bg-white border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-navy/40"
                placeholder="1250.00"
              />
            </Field>
            <Field label="Out of Network?">
              <div className="flex items-center h-10">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_out_of_network}
                    onChange={(e) => update('is_out_of_network', e.target.checked)}
                  />
                  <span>Provider was out-of-network</span>
                </label>
              </div>
            </Field>
          </div>
          <Field label="Denial Reason" hint="Why was the claim denied?">
            <textarea
              value={form.denial_reason}
              onChange={(e) => update('denial_reason', e.target.value)}
              rows={3}
              className="w-full bg-white border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-navy/40"
              placeholder="Not medically necessary per policy XYZ-123..."
            />
          </Field>
        </Section>
      )}

      {!scope.practice_id && practiceOptions.length > 0 && (
        <Section title="Submitting on behalf of">
          <Field label="Physician practice">
            <select
              value={form.practice_id}
              onChange={(e) => update('practice_id', e.target.value)}
              required
              className="w-full bg-white border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-navy/40"
            >
              <option value="">— Select practice —</option>
              {practiceOptions.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </Field>
        </Section>
      )}

      <Section title="Clinical documents">
        <div>
          <div className="text-sm font-medium text-navy mb-1.5">Attach PDFs (optional but recommended)</div>
          <div
            onDragOver={(e) => { e.preventDefault(); }}
            onDragEnter={(e) => { e.preventDefault(); }}
            onDrop={(e) => {
              e.preventDefault();
              handleFilesPicked(e.dataTransfer.files);
            }}
            onClick={() => document.getElementById('pdf-input')?.click()}
            className="group border-2 border-dashed border-border hover:border-navy/60 rounded-2xl bg-white px-6 py-8 text-center cursor-pointer transition-all active:scale-[0.995]"
          >
            <div className="mx-auto mb-3 w-10 h-10 rounded-full bg-navy/5 flex items-center justify-center text-navy group-hover:bg-navy/10 transition">
              📄
            </div>
            <div className="text-sm font-semibold text-navy">Drop PDFs here or click to browse</div>
            <div className="text-[12px] text-muted mt-1">Maximum 5 files • 10 MB each • PDF only</div>
            <input
              id="pdf-input"
              type="file"
              accept="application/pdf"
              multiple
              className="hidden"
              onChange={(e) => handleFilesPicked(e.target.files)}
            />
          </div>

          {files.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {files.map((f, i) => (
                <div key={`${f.name}-${i}`} className="flex items-center justify-between rounded-xl border border-border bg-white px-4 py-2.5 text-sm">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="text-navy">📄</div>
                    <div className="min-w-0">
                      <div className="font-medium text-navy truncate">{f.name}</div>
                      <div className="text-[11px] text-muted tabular-nums">{(f.size / 1024 / 1024).toFixed(1)} MB</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const next = files.filter((_, idx) => idx !== i);
                      setFiles(next);
                    }}
                    className="text-xs font-medium text-red-600 hover:text-red-700 px-3 py-1 rounded-md hover:bg-red-50"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <Field
          label="Additional document notes (optional)"
          hint="Any extra context for the clinical reviewer about the attached files."
        >
          <textarea
            value={form.documents_description}
            onChange={(e) => update('documents_description', e.target.value)}
            rows={2}
            className="w-full bg-white border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-navy/40"
            placeholder="Face-to-face notes, recent imaging, sleep study report..."
          />
        </Field>
      </Section>

      {uploadFeedback && (
        <div className={`rounded-lg border text-sm px-4 py-3 ${
          uploadFeedback.rejected.length === 0
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-amber-50 border-amber-200 text-amber-900'
        }`}>
          <p className="font-semibold">
            {uploadFeedback.accepted_count} of {uploadFeedback.accepted_count + uploadFeedback.rejected.length} file(s) uploaded.
          </p>
          {uploadFeedback.rejected.length > 0 && (
            <ul className="mt-1 list-disc list-inside text-xs">
              {uploadFeedback.rejected.map((r, i) => (
                <li key={i}>
                  <span className="font-mono">{r.filename}</span> — {r.reason}
                  {r.detail ? `: ${r.detail}` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm px-4 py-3">
          {error}
        </div>
      )}

      {duplicateInfo && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm px-4 py-3">
          <p className="font-semibold">Possible duplicate detected.</p>
          <p className="mt-1">
            {duplicateInfo.message}. Existing case: <span className="font-mono">{duplicateInfo.case_number}</span>.
          </p>
          <button
            type="button"
            onClick={() => router.push(`/cases/${duplicateInfo.case_id}`)}
            className="mt-2 text-amber-900 underline text-sm font-semibold"
          >
            Open existing case →
          </button>
        </div>
      )}

      <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
        <button
          type="submit"
          disabled={submitting || uploading}
          className="bg-navy text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-navy/90 disabled:opacity-50"
        >
          {uploading
            ? `Uploading ${files.length} file${files.length === 1 ? '' : 's'}…`
            : submitting
              ? 'Submitting…'
              : 'Submit authorization request'}
        </button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-surface border border-border rounded-xl p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <div className="h-px flex-1 bg-gradient-to-r from-navy/10 to-transparent" />
        <h3 className="text-[11px] uppercase tracking-[1.5px] text-navy font-semibold">{title}</h3>
        <div className="h-px flex-1 bg-gradient-to-l from-navy/10 to-transparent" />
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-sm font-medium text-navy block mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-muted mt-1.5 leading-tight">{hint}</p>}
    </div>
  );
}

// Premium visual selectors for TPA intake
function PrioritySelector({ value, onChange }: { value: Priority; onChange: (v: Priority) => void }) {
  const options: { val: Priority; label: string; desc: string; tone: string }[] = [
    { val: 'standard', label: 'Standard', desc: 'Normal turnaround', tone: 'border-border bg-white text-foreground' },
    { val: 'urgent', label: 'Urgent', desc: 'Expedited review', tone: 'border-amber-300 bg-amber-50 text-amber-900' },
    { val: 'expedited', label: 'Expedited', desc: 'Fastest possible', tone: 'border-red-300 bg-red-50 text-red-900' },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {options.map((opt) => (
        <button
          key={opt.val}
          type="button"
          onClick={() => onChange(opt.val)}
          className={`rounded-xl border px-3 py-3 text-left transition-all active:scale-[0.985] ${
            value === opt.val
              ? 'border-navy bg-navy text-white shadow-sm'
              : `${opt.tone} hover:border-navy/40`
          }`}
        >
          <div className={`text-sm font-semibold ${value === opt.val ? 'text-white' : ''}`}>{opt.label}</div>
          <div className={`text-[11px] mt-0.5 ${value === opt.val ? 'text-white/70' : 'text-muted'}`}>{opt.desc}</div>
        </button>
      ))}
    </div>
  );
}

function CategorySelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
      {SERVICE_CATEGORIES.map((cat) => (
        <button
          key={cat}
          type="button"
          onClick={() => onChange(cat)}
          className={`rounded-xl border px-3 py-2 text-sm font-medium transition-all active:scale-[0.985] text-left ${
            value === cat
              ? 'border-navy bg-navy text-white shadow-sm'
              : 'border-border bg-white text-foreground hover:border-navy/40'
          }`}
        >
          {cat}
        </button>
      ))}
    </div>
  );
}
