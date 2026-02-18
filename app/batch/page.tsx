'use client';

import { useState, useCallback, useRef } from 'react';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ParsedRow {
  rowIndex: number;
  data: Record<string, string>;
  valid: boolean;
  errors: string[];
}

interface BatchResults {
  created: number;
  failed: number;
  errors: { row: number; error: string }[];
  case_numbers: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CSV_HEADERS = [
  'patient_name',
  'patient_dob',
  'patient_gender',
  'patient_member_id',
  'requesting_provider',
  'requesting_provider_npi',
  'requesting_provider_specialty',
  'procedure_codes',
  'diagnosis_codes',
  'procedure_description',
  'service_category',
  'review_type',
  'priority',
  'payer_name',
  'plan_type',
  'facility_name',
  'facility_type',
];

const VALID_SERVICE_CATEGORIES = [
  'imaging', 'surgery', 'specialty_referral', 'dme', 'infusion',
  'behavioral_health', 'rehab_therapy', 'home_health', 'skilled_nursing',
  'transplant', 'genetic_testing', 'pain_management', 'cardiology', 'oncology', 'other',
];

const VALID_PRIORITIES = ['standard', 'urgent', 'expedited'];

const VALID_REVIEW_TYPES = [
  'prior_auth', 'medical_necessity', 'concurrent', 'retrospective',
  'peer_to_peer', 'appeal', 'second_level_review',
];

const VALID_FACILITY_TYPES = ['inpatient', 'outpatient', 'asc', 'office', 'home'];

// ---------------------------------------------------------------------------
// CSV parsing / validation helpers
// ---------------------------------------------------------------------------

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ''));
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = (values[idx] || '').trim();
    });
    rows.push(row);
  }

  return rows;
}

/** Handle quoted fields that may contain commas */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function validateRow(row: Record<string, string>, index: number): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!row.patient_name?.trim()) errors.push('patient_name is required');
  if (!row.patient_dob?.trim()) errors.push('patient_dob is required');
  if (!row.requesting_provider?.trim()) errors.push('requesting_provider is required');
  if (!row.procedure_codes?.trim()) errors.push('procedure_codes is required');
  if (!row.diagnosis_codes?.trim()) errors.push('diagnosis_codes is required');

  if (row.service_category?.trim() && !VALID_SERVICE_CATEGORIES.includes(row.service_category.trim())) {
    errors.push(`invalid service_category "${row.service_category.trim()}"`);
  }
  if (row.priority?.trim() && !VALID_PRIORITIES.includes(row.priority.trim())) {
    errors.push(`invalid priority "${row.priority.trim()}"`);
  }
  if (row.review_type?.trim() && !VALID_REVIEW_TYPES.includes(row.review_type.trim())) {
    errors.push(`invalid review_type "${row.review_type.trim()}"`);
  }
  if (row.facility_type?.trim() && !VALID_FACILITY_TYPES.includes(row.facility_type.trim())) {
    errors.push(`invalid facility_type "${row.facility_type.trim()}"`);
  }

  return { valid: errors.length === 0, errors };
}

function downloadCSVTemplate() {
  const sampleRow = [
    'Jane Smith',
    '1985-03-15',
    'F',
    'MBR-1234567',
    'Dr. Michael Chen',
    '1234567890',
    'Orthopedics',
    '27447|27486',
    'M17.11|M17.12',
    'Total knee arthroplasty',
    'surgery',
    'prior_auth',
    'standard',
    'Aetna',
    'PPO',
    'Memorial Hospital',
    'inpatient',
  ];

  const csvContent = [CSV_HEADERS.join(','), sampleRow.join(',')].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'vantahg_batch_template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BatchUploadPage() {
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [dragCounter, setDragCounter] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<BatchResults | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validCount = parsedRows.filter((r) => r.valid).length;
  const invalidCount = parsedRows.filter((r) => !r.valid).length;

  // ─── File handling ──────────────────────────────────────────────────────

  const processFile = useCallback((file: File) => {
    if (!file.name.endsWith('.csv')) {
      alert('Please upload a .csv file');
      return;
    }

    setFileName(file.name);
    setResults(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const rawRows = parseCSV(text);

      const validated: ParsedRow[] = rawRows.map((data, i) => {
        const validation = validateRow(data, i);
        return {
          rowIndex: i + 1,
          data,
          valid: validation.valid,
          errors: validation.errors,
        };
      });

      setParsedRows(validated);
    };
    reader.readAsText(file);
  }, []);

  const handleDragIn = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter((c) => c + 1);
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setDragActive(true);
    }
  };

  const handleDragOut = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter((c) => {
      const next = c - 1;
      if (next === 0) setDragActive(false);
      return next;
    });
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    setDragCounter(0);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) processFile(files[0]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
      e.target.value = '';
    }
  };

  // ─── Submission ─────────────────────────────────────────────────────────

  async function handleSubmit() {
    const validRows = parsedRows.filter((r) => r.valid);
    if (validRows.length === 0) return;

    setIsSubmitting(true);
    setProgress(0);

    // Transform rows for the API (pipe-separated arrays are handled by the API)
    const cases = validRows.map((r) => ({
      ...r.data,
      // Ensure pipe-separated format for API normalisation
      procedure_codes: r.data.procedure_codes,
      diagnosis_codes: r.data.diagnosis_codes,
    }));

    // Simulate progress for UX
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + Math.random() * 15;
      });
    }, 200);

    try {
      console.log('=== BATCH SUBMISSION ===');
      console.log(`Submitting ${cases.length} valid cases`);
      console.log(JSON.stringify({ cases }, null, 2));
      console.log('========================');

      const response = await fetch('/api/cases/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cases }),
      });

      clearInterval(progressInterval);
      setProgress(100);

      const data = await response.json();

      if (!response.ok) {
        setResults({
          created: 0,
          failed: validRows.length,
          errors: [{ row: 0, error: data.error || 'Submission failed' }],
          case_numbers: [],
        });
      } else {
        setResults(data as BatchResults);
      }
    } catch (err) {
      clearInterval(progressInterval);
      setProgress(100);
      console.error('Batch submission error:', err);
      setResults({
        created: 0,
        failed: validRows.length,
        errors: [{ row: 0, error: 'Network error. Please try again.' }],
        case_numbers: [],
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleReset() {
    setParsedRows([]);
    setFileName(null);
    setResults(null);
    setProgress(0);
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Page header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Dashboard
          </Link>
        </div>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-[family-name:var(--font-dm-serif)] text-3xl text-navy mb-2">
              Batch Case Upload
            </h1>
            <p className="text-muted text-base">
              Upload multiple cases via CSV for bulk processing
            </p>
          </div>

          <button
            onClick={downloadCSVTemplate}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-white text-sm font-medium text-foreground hover:bg-gray-50 hover:shadow-sm transition-all"
          >
            <svg className="w-4 h-4 text-gold-dark" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Download CSV Template
          </button>
        </div>
      </div>

      {/* Results summary */}
      {results && (
        <div className="mb-6 bg-surface rounded-2xl border border-border shadow-sm p-6">
          <div className="flex items-center gap-3 mb-4">
            {results.created > 0 ? (
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
            ) : (
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
            )}
            <div>
              <h2 className="font-[family-name:var(--font-dm-serif)] text-xl text-navy">
                Batch Upload Complete
              </h2>
              <p className="text-sm text-muted mt-0.5">
                {results.created} created, {results.failed} failed
              </p>
            </div>
          </div>

          {/* Stats cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="bg-green-50 rounded-lg p-3 border border-green-100">
              <p className="text-2xl font-bold text-green-700">{results.created}</p>
              <p className="text-xs text-green-600 font-medium">Cases Created</p>
            </div>
            <div className="bg-red-50 rounded-lg p-3 border border-red-100">
              <p className="text-2xl font-bold text-red-700">{results.failed}</p>
              <p className="text-xs text-red-600 font-medium">Failed</p>
            </div>
            <div className="bg-navy/5 rounded-lg p-3 border border-navy/10">
              <p className="text-2xl font-bold text-navy">{results.case_numbers.length}</p>
              <p className="text-xs text-muted font-medium">Case Numbers</p>
            </div>
            <div className="bg-gold/10 rounded-lg p-3 border border-gold/20">
              <p className="text-2xl font-bold text-gold-dark">{results.errors.length}</p>
              <p className="text-xs text-gold-dark font-medium">Errors</p>
            </div>
          </div>

          {/* Case numbers */}
          {results.case_numbers.length > 0 && (
            <div className="mb-4">
              <p className="text-sm font-medium text-foreground mb-2">Created Case Numbers:</p>
              <div className="flex flex-wrap gap-2">
                {results.case_numbers.map((cn) => (
                  <span
                    key={cn}
                    className="inline-flex items-center px-2.5 py-1 bg-navy/8 text-navy rounded-md text-xs font-mono font-semibold border border-navy/10"
                  >
                    {cn}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Errors */}
          {results.errors.length > 0 && (
            <div className="mb-4">
              <p className="text-sm font-medium text-red-700 mb-2">Errors:</p>
              <div className="max-h-40 overflow-y-auto bg-red-50 rounded-lg p-3 border border-red-100">
                {results.errors.map((err, i) => (
                  <p key={i} className="text-xs text-red-700 py-0.5">
                    {err.row > 0 ? `Row ${err.row}: ` : ''}{err.error}
                  </p>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={handleReset}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-gray-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Upload Another Batch
          </button>
        </div>
      )}

      {/* Upload zone (hide after results) */}
      {!results && (
        <>
          {/* Drop zone */}
          <div className="bg-surface rounded-2xl border border-border shadow-sm p-6 sm:p-8 mb-6">
            <div
              onDragEnter={handleDragIn}
              onDragLeave={handleDragOut}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`
                relative cursor-pointer border-2 border-dashed rounded-xl p-10 text-center
                transition-all duration-300 group
                ${dragActive
                  ? 'border-gold bg-gold/5 scale-[1.01] shadow-lg shadow-gold/10'
                  : 'border-border hover:border-gold/50 hover:bg-gold/[0.02]'
                }
              `}
            >
              {dragActive && (
                <div className="absolute inset-0 rounded-xl border-2 border-gold pointer-events-none animate-pulse" />
              )}

              <div className={`transition-transform duration-300 ${dragActive ? 'scale-110' : ''}`}>
                <div className={`
                  mx-auto w-16 h-16 rounded-2xl flex items-center justify-center mb-4
                  transition-all duration-300
                  ${dragActive
                    ? 'bg-gold/20 text-gold'
                    : 'bg-navy/5 text-navy/30 group-hover:bg-gold/10 group-hover:text-gold/60'
                  }
                `}>
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                  </svg>
                </div>

                <p className="text-base font-medium text-foreground">
                  {dragActive ? (
                    <span className="text-gold">Drop CSV file to upload</span>
                  ) : (
                    <>
                      Drag & drop your CSV file here, or{' '}
                      <span className="text-gold-dark hover:text-gold underline underline-offset-2">browse your device</span>
                    </>
                  )}
                </p>
                <p className="mt-2 text-sm text-muted">
                  CSV files only. Use pipe-separated values (|) for multiple codes.
                </p>
                {fileName && (
                  <p className="mt-3 text-sm font-medium text-navy">
                    Loaded: {fileName}
                  </p>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                className="sr-only"
              />
            </div>
          </div>

          {/* Preview table */}
          {parsedRows.length > 0 && (
            <div className="bg-surface rounded-2xl border border-border shadow-sm overflow-hidden mb-6">
              <div className="p-6 border-b border-border">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <h2 className="font-[family-name:var(--font-dm-serif)] text-xl text-navy">
                      Preview
                    </h2>
                    <p className="text-sm text-muted mt-1">
                      {parsedRows.length} rows parsed from {fileName}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-50 text-green-700 rounded-full text-xs font-semibold border border-green-100">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      {validCount} valid
                    </span>
                    {invalidCount > 0 && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-50 text-red-700 rounded-full text-xs font-semibold border border-red-100">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        {invalidCount} invalid
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-navy/[0.03] border-b border-border">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider w-12">
                        #
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider w-16">
                        Status
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider">
                        Patient Name
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider">
                        DOB
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider">
                        Provider
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider">
                        Procedure Codes
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider">
                        Dx Codes
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider">
                        Category
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider">
                        Priority
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider min-w-[200px]">
                        Errors
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {parsedRows.map((row) => (
                      <tr
                        key={row.rowIndex}
                        className={`transition-colors ${
                          row.valid
                            ? 'hover:bg-green-50/30'
                            : 'bg-red-50/40 hover:bg-red-50/60'
                        }`}
                      >
                        <td className="px-4 py-3 text-xs font-mono text-muted">{row.rowIndex}</td>
                        <td className="px-4 py-3">
                          {row.valid ? (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-100">
                              <svg className="w-3.5 h-3.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                              </svg>
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-100">
                              <svg className="w-3.5 h-3.5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">
                          {row.data.patient_name || <span className="text-red-400 italic">missing</span>}
                        </td>
                        <td className="px-4 py-3 text-muted whitespace-nowrap">
                          {row.data.patient_dob || <span className="text-red-400 italic">missing</span>}
                        </td>
                        <td className="px-4 py-3 text-muted whitespace-nowrap">
                          {row.data.requesting_provider || <span className="text-red-400 italic">missing</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {row.data.procedure_codes ? (
                              row.data.procedure_codes.split('|').map((code) => (
                                <span key={code} className="px-1.5 py-0.5 bg-navy/8 text-navy rounded text-xs font-mono font-semibold">
                                  {code.trim()}
                                </span>
                              ))
                            ) : (
                              <span className="text-red-400 italic text-xs">missing</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {row.data.diagnosis_codes ? (
                              row.data.diagnosis_codes.split('|').map((code) => (
                                <span key={code} className="px-1.5 py-0.5 bg-blue-50 text-blue-800 rounded text-xs font-mono font-semibold">
                                  {code.trim()}
                                </span>
                              ))
                            ) : (
                              <span className="text-red-400 italic text-xs">missing</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted capitalize whitespace-nowrap">
                          {(row.data.service_category || 'other').replace(/_/g, ' ')}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`
                            inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold
                            ${(row.data.priority || 'standard') === 'urgent'
                              ? 'bg-orange-100 text-orange-700'
                              : (row.data.priority || 'standard') === 'expedited'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-gray-100 text-gray-600'
                            }
                          `}>
                            {(row.data.priority || 'standard')}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {row.errors.length > 0 ? (
                            <div className="space-y-0.5">
                              {row.errors.map((err, i) => (
                                <p key={i} className="text-xs text-red-600">{err}</p>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-green-600">All checks passed</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Submit bar */}
              <div className="px-6 py-5 bg-gray-50/50 border-t border-border">
                {/* Progress bar */}
                {isSubmitting && (
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium text-navy">Submitting cases...</span>
                      <span className="text-sm text-muted">{Math.round(progress)}%</span>
                    </div>
                    <div className="h-2 bg-border rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-gold-dark via-gold to-gold-light rounded-full transition-all duration-300 ease-out"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between flex-wrap gap-3">
                  <p className="text-sm text-muted">
                    {validCount > 0 ? (
                      <>
                        <span className="font-semibold text-foreground">{validCount}</span> valid {validCount === 1 ? 'case' : 'cases'} ready to submit
                        {invalidCount > 0 && (
                          <> ({invalidCount} invalid will be skipped)</>
                        )}
                      </>
                    ) : (
                      <span className="text-red-600">No valid cases to submit. Please fix errors and re-upload.</span>
                    )}
                  </p>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleReset}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-white hover:shadow-sm transition-all"
                    >
                      Clear
                    </button>
                    <button
                      onClick={handleSubmit}
                      disabled={validCount === 0 || isSubmitting}
                      className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-gold text-navy font-bold text-sm hover:bg-gold-light transition-colors shadow-md shadow-gold/20 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? (
                        <>
                          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Submitting...
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                          </svg>
                          Submit All Valid Cases
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Info cards */}
          {parsedRows.length === 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
              <div className="bg-surface rounded-xl border border-border p-5">
                <div className="w-10 h-10 rounded-lg bg-navy/5 flex items-center justify-center mb-3">
                  <svg className="w-5 h-5 text-navy/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold text-foreground mb-1">1. Download Template</h3>
                <p className="text-xs text-muted leading-relaxed">
                  Download the CSV template with the correct headers and a sample row for reference.
                </p>
              </div>

              <div className="bg-surface rounded-xl border border-border p-5">
                <div className="w-10 h-10 rounded-lg bg-navy/5 flex items-center justify-center mb-3">
                  <svg className="w-5 h-5 text-navy/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold text-foreground mb-1">2. Fill in Case Data</h3>
                <p className="text-xs text-muted leading-relaxed">
                  Add your cases to the CSV. Use pipe (|) to separate multiple procedure or diagnosis codes.
                </p>
              </div>

              <div className="bg-surface rounded-xl border border-border p-5">
                <div className="w-10 h-10 rounded-lg bg-navy/5 flex items-center justify-center mb-3">
                  <svg className="w-5 h-5 text-navy/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold text-foreground mb-1">3. Upload & Submit</h3>
                <p className="text-xs text-muted leading-relaxed">
                  Drag your CSV file above. Preview the parsed rows, fix any errors, and submit all valid cases at once.
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {/* Compliance footer */}
      <div className="mt-8 flex items-start gap-3 px-2">
        <svg className="w-5 h-5 text-green-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
        </svg>
        <p className="text-xs text-muted leading-relaxed">
          All uploaded data is encrypted in transit and at rest. Clinical information is handled in accordance with HIPAA regulations. VantaHG maintains SOC 2 Type II compliance for all data processing operations. Maximum batch size: 500 cases.
        </p>
      </div>
    </div>
  );
}
