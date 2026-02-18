'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { commonMedicalCodes } from '@/lib/medical-criteria';

// ─── Types ───────────────────────────────────────────────────────────────────

interface UploadedFile {
  file: File;
  id: string;
  category: string;
  preview?: string;
}

interface PatientInfo {
  name: string;
  dob: string;
  memberId: string;
  insurancePlan: string;
  groupNumber: string;
}

interface ProcedureInfo {
  procedureCodes: string[];
  treatingProvider: string;
  dateOfService: string;
  diagnosisCodes: string[];
  procedureDescription: string;
}

interface StepValidation {
  valid: boolean;
  errors: string[];
}

const DOCUMENT_CATEGORIES = [
  { value: 'clinical_notes', label: 'Clinical Notes', icon: 'notes' },
  { value: 'imaging_reports', label: 'Imaging Reports', icon: 'xray' },
  { value: 'lab_results', label: 'Lab Results', icon: 'chart' },
  { value: 'operative_notes', label: 'Operative Notes', icon: 'notes' },
  { value: 'pt_records', label: 'Physical Therapy Records', icon: 'plan' },
  { value: 'preauth', label: 'Prior Authorization Forms', icon: 'form' },
  { value: 'pathology', label: 'Pathology Reports', icon: 'chart' },
  { value: 'other', label: 'Other', icon: 'other' },
];

const ACCEPTED_TYPES = '.pdf,.jpg,.jpeg,.png,.dicom,.dcm';
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

// ─── Helper Components ───────────────────────────────────────────────────────

function StepIndicator({ currentStep, steps }: { currentStep: number; steps: string[] }) {
  return (
    <div className="w-full">
      {/* Progress bar */}
      <div className="relative mb-2">
        <div className="h-1.5 bg-border rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-gold-dark via-gold to-gold-light rounded-full transition-all duration-700 ease-out"
            style={{ width: `${((currentStep) / (steps.length - 1)) * 100}%` }}
          />
        </div>
      </div>

      {/* Step labels */}
      <div className="flex justify-between">
        {steps.map((label, i) => {
          const isComplete = i < currentStep;
          const isCurrent = i === currentStep;
          return (
            <div key={label} className="flex flex-col items-center" style={{ width: `${100 / steps.length}%` }}>
              <div
                className={`
                  w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold
                  transition-all duration-500 mb-1.5
                  ${isComplete
                    ? 'bg-gold text-navy shadow-md shadow-gold/25'
                    : isCurrent
                      ? 'bg-navy text-gold ring-4 ring-gold/20 shadow-lg shadow-navy/20'
                      : 'bg-border text-muted'
                  }
                `}
              >
                {isComplete ? (
                  <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={`text-xs text-center font-medium transition-colors duration-300 ${
                  isCurrent ? 'text-navy' : isComplete ? 'text-gold-dark' : 'text-muted'
                }`}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SectionTitle({ children, subtitle }: { children: React.ReactNode; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h2 className="font-[family-name:var(--font-dm-serif)] text-xl text-navy">
        {children}
      </h2>
      {subtitle && <p className="text-sm text-muted mt-1">{subtitle}</p>}
    </div>
  );
}

function Label({ htmlFor, children, required }: { htmlFor: string; children: React.ReactNode; required?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground mb-1.5">
      {children}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}

function InputField({
  id,
  type = 'text',
  value,
  onChange,
  placeholder,
  required,
  error,
}: {
  id: string;
  type?: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  required?: boolean;
  error?: boolean;
}) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      className={`
        w-full px-3.5 py-2.5 text-sm border rounded-lg bg-white
        focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold
        transition-all duration-200 placeholder:text-muted/60
        ${error ? 'border-red-300 ring-2 ring-red-100' : 'border-border'}
      `}
    />
  );
}

function ValidationBanner({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null;
  return (
    <div className="mb-5 p-4 bg-red-50 border border-red-200 rounded-lg animate-in slide-in-from-top-2">
      <div className="flex items-start gap-3">
        <svg className="w-5 h-5 text-red-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <div>
          <p className="text-sm font-medium text-red-800">Please complete the following:</p>
          <ul className="mt-1 space-y-0.5">
            {errors.map((err, i) => (
              <li key={i} className="text-sm text-red-700">{err}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ─── Code Input with CPT/HCPCS helper ───────────────────────────────────────

function CodeInput({
  codes,
  onCodesChange,
  showCodeHelper,
  placeholder,
  error,
}: {
  codes: string[];
  onCodesChange: (codes: string[]) => void;
  showCodeHelper?: boolean;
  placeholder: string;
  error?: boolean;
}) {
  const [inputValue, setInputValue] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredCodes = useMemo(() => {
    if (!showCodeHelper || !inputValue.trim()) return commonMedicalCodes.slice(0, 10);
    const term = inputValue.toLowerCase();
    return commonMedicalCodes.filter(
      (c) =>
        c.code.toLowerCase().includes(term) ||
        c.description.toLowerCase().includes(term)
    );
  }, [inputValue, showCodeHelper]);

  const addCode = useCallback((code: string) => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed && !codes.includes(trimmed)) {
      onCodesChange([...codes, trimmed]);
    }
    setInputValue('');
    setShowDropdown(false);
    inputRef.current?.focus();
  }, [codes, onCodesChange]);

  const removeCode = useCallback((code: string) => {
    onCodesChange(codes.filter((c) => c !== code));
  }, [codes, onCodesChange]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (inputValue.trim()) addCode(inputValue);
    }
    if (e.key === 'Backspace' && !inputValue && codes.length > 0) {
      removeCode(codes[codes.length - 1]);
    }
  };

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative">
      <div className={`
        flex flex-wrap gap-1.5 p-2.5 border rounded-lg bg-white
        focus-within:ring-2 focus-within:ring-gold/50 focus-within:border-gold
        transition-all duration-200 min-h-[42px]
        ${error ? 'border-red-300 ring-2 ring-red-100' : 'border-border'}
      `}>
        {codes.map((code) => (
          <span
            key={code}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-navy/8 text-navy rounded-md text-xs font-mono font-semibold border border-navy/10"
          >
            {code}
            <button
              type="button"
              onClick={() => removeCode(code)}
              className="text-navy/40 hover:text-red-500 transition-colors"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            if (showCodeHelper) setShowDropdown(true);
          }}
          onFocus={() => { if (showCodeHelper) setShowDropdown(true); }}
          onKeyDown={handleKeyDown}
          placeholder={codes.length === 0 ? placeholder : 'Add code...'}
          className="flex-1 min-w-[140px] px-1 py-0.5 text-sm bg-transparent focus:outline-none placeholder:text-muted/60"
        />
      </div>

      {showCodeHelper && showDropdown && filteredCodes.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-30 left-0 right-0 mt-1.5 bg-white border border-border rounded-lg shadow-xl shadow-navy/5 max-h-56 overflow-y-auto"
        >
          {filteredCodes.map((medCode) => {
            const alreadyAdded = codes.includes(medCode.code);
            return (
              <button
                key={medCode.code}
                type="button"
                disabled={alreadyAdded}
                onClick={() => addCode(medCode.code)}
                className={`w-full text-left px-3.5 py-2.5 text-sm hover:bg-gold/5 border-b border-border/50 last:border-b-0 flex items-start gap-2.5 transition-colors ${
                  alreadyAdded ? 'opacity-40 cursor-not-allowed' : ''
                }`}
              >
                <span className="font-mono font-bold text-navy shrink-0">{medCode.code}</span>
                <span className="text-muted">{medCode.description}</span>
                {alreadyAdded && (
                  <span className="ml-auto text-xs text-green-600 font-medium shrink-0">Added</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── File Upload Zone ────────────────────────────────────────────────────────

function FileUploadZone({
  files,
  onFilesAdd,
  onFileRemove,
  onCategoryChange,
}: {
  files: UploadedFile[];
  onFilesAdd: (files: File[]) => void;
  onFileRemove: (id: string) => void;
  onCategoryChange: (id: string, category: string) => void;
}) {
  const [dragActive, setDragActive] = useState(false);
  const [dragCounter, setDragCounter] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

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

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    setDragCounter(0);
    const dropped = Array.from(e.dataTransfer.files);
    onFilesAdd(dropped);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      onFilesAdd(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  function getFileIcon(type: string) {
    if (type.includes('pdf')) return 'pdf';
    if (type.includes('image') || type.includes('jpeg') || type.includes('png')) return 'image';
    if (type.includes('dicom')) return 'dicom';
    return 'file';
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragEnter={handleDragIn}
        onDragLeave={handleDragOut}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`
          relative cursor-pointer border-2 border-dashed rounded-xl p-10 text-center
          transition-all duration-300 group
          ${dragActive
            ? 'border-gold bg-gold/5 scale-[1.01] shadow-lg shadow-gold/10'
            : 'border-border hover:border-gold/50 hover:bg-gold/[0.02]'
          }
        `}
      >
        {/* Animated dashed border overlay when dragging */}
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
              <span className="text-gold">Drop files to upload</span>
            ) : (
              <>
                Drag & drop files here, or{' '}
                <span className="text-gold-dark hover:text-gold underline underline-offset-2">browse your device</span>
              </>
            )}
          </p>
          <p className="mt-2 text-sm text-muted">
            PDF, JPEG, PNG, or DICOM files up to 25 MB each
          </p>
        </div>

        <input
          ref={inputRef}
          type="file"
          multiple
          onChange={handleFileSelect}
          className="sr-only"
          accept={ACCEPTED_TYPES}
        />
      </div>

      {/* Document type hints */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {DOCUMENT_CATEGORIES.map((cat) => (
          <div
            key={cat.value}
            className="flex items-center gap-2 px-3 py-2 bg-navy/[0.03] rounded-lg border border-transparent"
          >
            <div className="w-6 h-6 rounded-md bg-navy/8 flex items-center justify-center shrink-0">
              {cat.icon === 'notes' && (
                <svg className="w-3.5 h-3.5 text-navy/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              )}
              {cat.icon === 'xray' && (
                <svg className="w-3.5 h-3.5 text-navy/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                </svg>
              )}
              {cat.icon === 'chart' && (
                <svg className="w-3.5 h-3.5 text-navy/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
                </svg>
              )}
              {cat.icon === 'plan' && (
                <svg className="w-3.5 h-3.5 text-navy/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                </svg>
              )}
              {cat.icon === 'form' && (
                <svg className="w-3.5 h-3.5 text-navy/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.125 2.25h-4.5c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125v-9M10.125 2.25h.375a9 9 0 019 9v.375M10.125 2.25A3.375 3.375 0 0113.5 5.625v1.5c0 .621.504 1.125 1.125 1.125h1.5a3.375 3.375 0 013.375 3.375M9 15l2.25 2.25L15 12" />
                </svg>
              )}
              {cat.icon === 'other' && (
                <svg className="w-3.5 h-3.5 text-navy/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                </svg>
              )}
            </div>
            <span className="text-xs text-muted font-medium">{cat.label}</span>
          </div>
        ))}
      </div>

      {/* Uploaded file cards */}
      {files.length > 0 && (
        <div className="space-y-2.5 mt-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">
              {files.length} {files.length === 1 ? 'file' : 'files'} uploaded
            </p>
            <p className="text-xs text-muted">
              Total: {formatFileSize(files.reduce((sum, f) => sum + f.file.size, 0))}
            </p>
          </div>
          {files.map((uploadedFile) => {
            const iconType = getFileIcon(uploadedFile.file.type);
            const tooLarge = uploadedFile.file.size > MAX_FILE_SIZE;
            return (
              <div
                key={uploadedFile.id}
                className={`
                  flex items-center gap-3 px-4 py-3 rounded-lg border transition-all duration-200
                  ${tooLarge
                    ? 'bg-red-50 border-red-200'
                    : 'bg-white border-border hover:border-gold/30 hover:shadow-sm'
                  }
                `}
              >
                {/* File icon */}
                <div className={`
                  w-10 h-10 rounded-lg flex items-center justify-center shrink-0
                  ${iconType === 'pdf' ? 'bg-red-100 text-red-600' :
                    iconType === 'image' ? 'bg-blue-100 text-blue-600' :
                    iconType === 'dicom' ? 'bg-purple-100 text-purple-600' :
                    'bg-gray-100 text-gray-500'
                  }
                `}>
                  {iconType === 'pdf' && (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                  )}
                  {iconType === 'image' && (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                    </svg>
                  )}
                  {iconType === 'dicom' && (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                    </svg>
                  )}
                  {iconType === 'file' && (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                  )}
                </div>

                {/* File details */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{uploadedFile.file.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted">{formatFileSize(uploadedFile.file.size)}</span>
                    {tooLarge && (
                      <span className="text-xs text-red-600 font-medium">Exceeds 25 MB limit</span>
                    )}
                  </div>
                </div>

                {/* Category selector */}
                <select
                  value={uploadedFile.category}
                  onChange={(e) => onCategoryChange(uploadedFile.id, e.target.value)}
                  className="text-xs px-2 py-1.5 border border-border rounded-md bg-white text-muted focus:outline-none focus:ring-1 focus:ring-gold/50 shrink-0"
                >
                  {DOCUMENT_CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>

                {/* Remove button */}
                <button
                  type="button"
                  onClick={() => onFileRemove(uploadedFile.id)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-red-500 hover:bg-red-50 transition-all shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Review Summary ──────────────────────────────────────────────────────────

function ReviewSummary({
  patient,
  procedure,
  files,
}: {
  patient: PatientInfo;
  procedure: ProcedureInfo;
  files: UploadedFile[];
}) {
  function SummarySection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
      <div className="p-5 bg-white rounded-xl border border-border">
        <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">{title}</h4>
        {children}
      </div>
    );
  }

  function SummaryRow({ label, value }: { label: string; value: string }) {
    return (
      <div className="flex justify-between py-1.5 text-sm">
        <span className="text-muted">{label}</span>
        <span className="font-medium text-foreground text-right">{value || '--'}</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SummarySection title="Patient Information">
        <SummaryRow label="Patient Name" value={patient.name} />
        <SummaryRow label="Date of Birth" value={patient.dob ? new Date(patient.dob + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : ''} />
        <SummaryRow label="Member ID" value={patient.memberId} />
        <SummaryRow label="Insurance Plan" value={patient.insurancePlan} />
        <SummaryRow label="Group Number" value={patient.groupNumber} />
      </SummarySection>

      <SummarySection title="Procedure Details">
        <SummaryRow label="Treating Provider" value={procedure.treatingProvider} />
        <SummaryRow label="Date of Service" value={procedure.dateOfService ? new Date(procedure.dateOfService + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : ''} />
        <div className="py-1.5">
          <p className="text-sm text-muted mb-1.5">Procedure Codes</p>
          <div className="flex flex-wrap gap-1.5">
            {procedure.procedureCodes.map((code) => (
              <span key={code} className="px-2.5 py-1 bg-navy/8 text-navy rounded-md text-xs font-mono font-semibold border border-navy/10">
                {code}
              </span>
            ))}
          </div>
        </div>
        {procedure.diagnosisCodes.length > 0 && (
          <div className="py-1.5">
            <p className="text-sm text-muted mb-1.5">Diagnosis Codes</p>
            <div className="flex flex-wrap gap-1.5">
              {procedure.diagnosisCodes.map((code) => (
                <span key={code} className="px-2.5 py-1 bg-blue-50 text-blue-800 rounded-md text-xs font-mono font-semibold border border-blue-100">
                  {code}
                </span>
              ))}
            </div>
          </div>
        )}
        {procedure.procedureDescription && (
          <div className="py-1.5">
            <p className="text-sm text-muted mb-1">Procedure Description</p>
            <p className="text-sm text-foreground">{procedure.procedureDescription}</p>
          </div>
        )}
      </SummarySection>

      <SummarySection title={`Clinical Documentation (${files.length} ${files.length === 1 ? 'file' : 'files'})`}>
        {files.length === 0 ? (
          <p className="text-sm text-muted italic">No files uploaded</p>
        ) : (
          <div className="space-y-2">
            {files.map((f) => {
              const cat = DOCUMENT_CATEGORIES.find((c) => c.value === f.category);
              return (
                <div key={f.id} className="flex items-center gap-3 py-1.5">
                  <div className="w-8 h-8 rounded-md bg-navy/5 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-navy/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground truncate">{f.file.name}</p>
                    <p className="text-xs text-muted">{cat?.label || 'Other'}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SummarySection>
    </div>
  );
}

// ─── Success State ───────────────────────────────────────────────────────────

function SubmissionSuccess({ caseRef }: { caseRef: string }) {
  return (
    <div className="text-center py-12">
      {/* Animated checkmark */}
      <div className="mx-auto w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6 animate-[bounce_0.6s_ease-in-out]">
        <svg className="w-10 h-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </div>

      <h2 className="font-[family-name:var(--font-dm-serif)] text-2xl text-navy mb-2">
        Case Submitted Successfully
      </h2>
      <p className="text-muted text-base max-w-md mx-auto mb-8">
        Your case has been received and is being processed. Our AI-powered system will generate a clinical brief for physician review.
      </p>

      {/* Case reference card */}
      <div className="inline-block bg-white border border-border rounded-xl p-6 shadow-sm mb-8">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">Case Reference Number</p>
        <p className="text-2xl font-mono font-bold text-navy tracking-wide">{caseRef}</p>
        <p className="text-xs text-muted mt-2">Save this number for your records</p>
      </div>

      {/* Timeline */}
      <div className="max-w-sm mx-auto text-left mb-10">
        <p className="text-sm font-medium text-foreground mb-3">What happens next:</p>
        <div className="space-y-3">
          {[
            { step: '1', text: 'AI analysis of your clinical documentation', time: 'Within minutes' },
            { step: '2', text: 'Board-certified physician review', time: 'Within 24-48 hrs' },
            { step: '3', text: 'Determination delivered to your portal', time: 'After review' },
          ].map((item) => (
            <div key={item.step} className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-navy/10 text-navy flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                {item.step}
              </div>
              <div>
                <p className="text-sm text-foreground">{item.text}</p>
                <p className="text-xs text-muted">{item.time}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-center gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-navy text-gold font-semibold text-sm hover:bg-navy-light transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
          </svg>
          Track Your Case
        </Link>
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border text-foreground font-medium text-sm hover:bg-gray-50 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Submit Another Case
        </button>
      </div>
    </div>
  );
}

// ─── Main Upload Page ────────────────────────────────────────────────────────

const STEPS = ['Patient Info', 'Procedure', 'Documents', 'Review'];

function generateCaseRef(): string {
  const prefix = 'VHG';
  const year = new Date().getFullYear();
  const num = Math.floor(100000 + Math.random() * 900000);
  return `${prefix}-${year}-${num}`;
}

export default function UploadPage() {
  const [currentStep, setCurrentStep] = useState(0);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [caseRef, setCaseRef] = useState('');

  // Step 1: Patient Info
  const [patient, setPatient] = useState<PatientInfo>({
    name: '',
    dob: '',
    memberId: '',
    insurancePlan: '',
    groupNumber: '',
  });

  // Step 2: Procedure Details
  const [procedure, setProcedure] = useState<ProcedureInfo>({
    procedureCodes: [],
    treatingProvider: '',
    dateOfService: '',
    diagnosisCodes: [],
    procedureDescription: '',
  });

  // Step 3: Files
  const [files, setFiles] = useState<UploadedFile[]>([]);

  const updatePatient = (field: keyof PatientInfo, value: string) => {
    setPatient((prev) => ({ ...prev, [field]: value }));
    setValidationErrors([]);
  };

  const updateProcedure = (field: keyof ProcedureInfo, value: string | string[]) => {
    setProcedure((prev) => ({ ...prev, [field]: value }));
    setValidationErrors([]);
  };

  const handleFilesAdd = (newFiles: File[]) => {
    const uploads: UploadedFile[] = newFiles.map((file) => ({
      file,
      id: `${file.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      category: 'clinical_notes',
    }));
    setFiles((prev) => [...prev, ...uploads]);
    setValidationErrors([]);
  };

  const handleFileRemove = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleCategoryChange = (id: string, category: string) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, category } : f))
    );
  };

  // ─── Validation ──────────────────────────────────────────────────────────

  function validateStep(step: number): StepValidation {
    const errors: string[] = [];

    switch (step) {
      case 0: // Patient Info
        if (!patient.name.trim()) errors.push('Patient name is required');
        if (!patient.dob) errors.push('Date of birth is required');
        if (!patient.memberId.trim()) errors.push('Member ID is required');
        if (!patient.insurancePlan.trim()) errors.push('Insurance plan is required');
        if (!patient.groupNumber.trim()) errors.push('Group number is required');
        break;

      case 1: // Procedure
        if (procedure.procedureCodes.length === 0) errors.push('At least one procedure code is required');
        if (!procedure.treatingProvider.trim()) errors.push('Treating provider name is required');
        if (!procedure.dateOfService) errors.push('Date of service is required');
        break;

      case 2: // Documents
        // Files are encouraged but not strictly required for demo
        if (files.some((f) => f.file.size > MAX_FILE_SIZE)) {
          errors.push('One or more files exceed the 25 MB limit. Please remove them before continuing.');
        }
        break;

      case 3: // Review - all prior validations
        break;
    }

    return { valid: errors.length === 0, errors };
  }

  function handleNext() {
    const validation = validateStep(currentStep);
    if (!validation.valid) {
      setValidationErrors(validation.errors);
      // Scroll to top of form area
      window.scrollTo({ top: 200, behavior: 'smooth' });
      return;
    }
    setValidationErrors([]);
    setCurrentStep((prev) => Math.min(prev + 1, STEPS.length - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleBack() {
    setValidationErrors([]);
    setCurrentStep((prev) => Math.max(prev - 1, 0));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSubmit() {
    setIsSubmitting(true);
    setValidationErrors([]);

    // Simulate submission
    const ref = generateCaseRef();
    const submissionData = {
      caseReference: ref,
      patient,
      procedure,
      files: files.map((f) => ({
        name: f.file.name,
        size: f.file.size,
        type: f.file.type,
        category: f.category,
      })),
      submittedAt: new Date().toISOString(),
    };

    console.log('=== CASE SUBMISSION ===');
    console.log(JSON.stringify(submissionData, null, 2));
    console.log('=======================');

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 2000));

    setCaseRef(ref);
    setIsSubmitting(false);
    setSubmitted(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  if (submitted) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="bg-surface rounded-2xl border border-border shadow-sm p-8">
          <SubmissionSuccess caseRef={caseRef} />
        </div>

        {/* Compliance footer */}
        <div className="mt-8 flex items-start gap-3 px-2">
          <svg className="w-5 h-5 text-green-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
          <p className="text-xs text-muted leading-relaxed">
            All uploaded documents are encrypted in transit and at rest. Clinical information is handled in accordance with HIPAA regulations. VantaHG maintains SOC 2 Type II compliance for all data processing operations.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Page header */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-gold/10 text-gold-dark rounded-full text-xs font-semibold mb-4 border border-gold/20">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
          </svg>
          AI-Powered Clinical Review
        </div>
        <h1 className="font-[family-name:var(--font-dm-serif)] text-3xl sm:text-4xl text-navy mb-3">
          Submit a Case for Review
        </h1>
        <p className="text-muted text-base max-w-xl mx-auto leading-relaxed">
          Upload clinical documentation for AI-powered medical review by our board-certified physician panel. Prior authorization, medical necessity, and concurrent review cases are typically reviewed within 24-48 hours.
        </p>
      </div>

      {/* Step indicator */}
      <div className="bg-surface rounded-2xl border border-border shadow-sm p-6 mb-6">
        <StepIndicator currentStep={currentStep} steps={STEPS} />
      </div>

      {/* Main form area */}
      <div className="bg-surface rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="p-6 sm:p-8">

          {/* Validation errors */}
          <ValidationBanner errors={validationErrors} />

          {/* Step 1: Patient Information */}
          {currentStep === 0 && (
            <div>
              <SectionTitle subtitle="Please provide the patient's demographic and insurance information.">
                Patient Information
              </SectionTitle>

              <div className="space-y-5">
                <div>
                  <Label htmlFor="patientName" required>Patient Full Name</Label>
                  <InputField
                    id="patientName"
                    value={patient.name}
                    onChange={(v) => updatePatient('name', v)}
                    placeholder="e.g., Jane A. Smith"
                    required
                    error={validationErrors.length > 0 && !patient.name.trim()}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <Label htmlFor="patientDob" required>Date of Birth</Label>
                    <InputField
                      id="patientDob"
                      type="date"
                      value={patient.dob}
                      onChange={(v) => updatePatient('dob', v)}
                      required
                      error={validationErrors.length > 0 && !patient.dob}
                    />
                  </div>
                  <div>
                    <Label htmlFor="memberId" required>Member ID</Label>
                    <InputField
                      id="memberId"
                      value={patient.memberId}
                      onChange={(v) => updatePatient('memberId', v)}
                      placeholder="e.g., MBR-1234567890"
                      required
                      error={validationErrors.length > 0 && !patient.memberId.trim()}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <Label htmlFor="insurancePlan" required>Insurance Plan</Label>
                    <InputField
                      id="insurancePlan"
                      value={patient.insurancePlan}
                      onChange={(v) => updatePatient('insurancePlan', v)}
                      placeholder="e.g., Aetna PPO, UnitedHealthcare HMO"
                      required
                      error={validationErrors.length > 0 && !patient.insurancePlan.trim()}
                    />
                  </div>
                  <div>
                    <Label htmlFor="groupNumber" required>Group Number</Label>
                    <InputField
                      id="groupNumber"
                      value={patient.groupNumber}
                      onChange={(v) => updatePatient('groupNumber', v)}
                      placeholder="e.g., GRP-00012345"
                      required
                      error={validationErrors.length > 0 && !patient.groupNumber.trim()}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Procedure Details */}
          {currentStep === 1 && (
            <div>
              <SectionTitle subtitle="Specify the procedure codes and provider details for this review.">
                Procedure Details
              </SectionTitle>

              <div className="space-y-5">
                <div>
                  <Label htmlFor="procedureCodes" required>CPT/HCPCS Procedure Codes</Label>
                  <p className="text-xs text-muted mb-2">
                    Search CPT/HCPCS codes or type a code and press Enter to add.
                  </p>
                  <CodeInput
                    codes={procedure.procedureCodes}
                    onCodesChange={(codes) => updateProcedure('procedureCodes', codes)}
                    showCodeHelper
                    placeholder="Search CPT codes (e.g., 72148, 27447)"
                    error={validationErrors.length > 0 && procedure.procedureCodes.length === 0}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <Label htmlFor="treatingProvider" required>Treating Provider Name</Label>
                    <InputField
                      id="treatingProvider"
                      value={procedure.treatingProvider}
                      onChange={(v) => updateProcedure('treatingProvider', v)}
                      placeholder="e.g., Dr. Michael Chen, MD"
                      required
                      error={validationErrors.length > 0 && !procedure.treatingProvider.trim()}
                    />
                  </div>
                  <div>
                    <Label htmlFor="dateOfService" required>Date of Service</Label>
                    <InputField
                      id="dateOfService"
                      type="date"
                      value={procedure.dateOfService}
                      onChange={(v) => updateProcedure('dateOfService', v)}
                      required
                      error={validationErrors.length > 0 && !procedure.dateOfService}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="diagnosisCodes">Diagnosis Codes (ICD-10)</Label>
                  <p className="text-xs text-muted mb-2">
                    Type ICD-10 codes and press Enter to add. Optional but recommended.
                  </p>
                  <CodeInput
                    codes={procedure.diagnosisCodes}
                    onCodesChange={(codes) => updateProcedure('diagnosisCodes', codes)}
                    placeholder="Enter ICD-10 code (e.g., M17.11, G47.33)..."
                  />
                </div>

                <div>
                  <Label htmlFor="procedureDescription">Procedure Description</Label>
                  <p className="text-xs text-muted mb-2">
                    Provide any additional context about the proposed procedure.
                  </p>
                  <textarea
                    id="procedureDescription"
                    value={procedure.procedureDescription}
                    onChange={(e) => updateProcedure('procedureDescription', e.target.value)}
                    rows={4}
                    placeholder="Describe the proposed procedure(s), including clinical justification, anatomical site, relevant findings, conservative treatment history, and any pertinent patient history..."
                    className="w-full px-3.5 py-2.5 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold resize-y transition-all duration-200 placeholder:text-muted/60"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Clinical Documentation */}
          {currentStep === 2 && (
            <div>
              <SectionTitle subtitle="Upload all supporting clinical documentation. Comprehensive records help ensure accurate and timely review.">
                Clinical Documentation
              </SectionTitle>

              <FileUploadZone
                files={files}
                onFilesAdd={handleFilesAdd}
                onFileRemove={handleFileRemove}
                onCategoryChange={handleCategoryChange}
              />

              {/* Helpful tips */}
              <div className="mt-6 p-4 bg-blue-50/60 rounded-xl border border-blue-100">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-blue-900">Tips for faster review</p>
                    <ul className="mt-1.5 space-y-1 text-xs text-blue-800">
                      <li>Include complete operative notes and procedure reports</li>
                      <li>Attach relevant imaging reports (MRI, CT, X-ray findings)</li>
                      <li>Include lab results and pathology reports if applicable</li>
                      <li>Attach physical therapy or conservative treatment records</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Review & Submit */}
          {currentStep === 3 && (
            <div>
              <SectionTitle subtitle="Please review all information before submitting. You can go back to any step to make changes.">
                Review & Submit
              </SectionTitle>

              <ReviewSummary patient={patient} procedure={procedure} files={files} />

              {/* Submission confirmation */}
              <div className="mt-6 p-4 bg-navy/[0.03] rounded-xl border border-navy/10">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-navy shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-navy">Ready for submission</p>
                    <p className="text-xs text-muted mt-0.5">
                      By submitting, you confirm that all information is accurate and that you are authorized to share this clinical documentation for utilization review purposes.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Navigation buttons */}
        <div className="px-6 sm:px-8 py-5 bg-gray-50/50 border-t border-border flex items-center justify-between">
          <div>
            {currentStep > 0 && (
              <button
                type="button"
                onClick={handleBack}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border text-foreground font-medium text-sm hover:bg-white hover:shadow-sm transition-all"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
                Back
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-muted hidden sm:inline">
              Step {currentStep + 1} of {STEPS.length}
            </span>

            {currentStep < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={handleNext}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-navy text-gold font-semibold text-sm hover:bg-navy-light transition-colors shadow-sm shadow-navy/10"
              >
                Continue
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 px-8 py-2.5 rounded-lg bg-gold text-navy font-bold text-sm hover:bg-gold-light transition-colors shadow-md shadow-gold/20 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Submitting Case...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                    </svg>
                    Submit Case for Review
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Compliance footer */}
      <div className="mt-8 flex items-start gap-3 px-2">
        <svg className="w-5 h-5 text-green-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
        </svg>
        <p className="text-xs text-muted leading-relaxed">
          All uploaded documents are encrypted in transit and at rest. Clinical information is handled in accordance with HIPAA regulations. VantaHG maintains SOC 2 Type II compliance for all data processing operations.
        </p>
      </div>
    </div>
  );
}
