'use client';

import { useState, useEffect } from 'react';

interface Document {
  storage_path: string;
  filename: string;
  category?: string | null;
  bytes?: number;
  uploaded_at?: string;
}

interface IDRDocumentsProps {
  caseId: string;
}

const IDR_CATEGORIES = [
  'Denial Letter',
  'Claim Form',
  'Medical Records',
  'Explanation of Benefits (EOB)',
  'Provider Submission',
  'Other',
];

export function IDRDocuments({ caseId }: IDRDocumentsProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(IDR_CATEGORIES[0]);
  const [error, setError] = useState<string | null>(null);

  async function loadDocuments() {
    try {
      const res = await fetch(`/api/cases/${caseId}`);
      if (res.ok) {
        const data = await res.json();
        // Support both old submitted_documents and new documents structure
        const docs: Document[] = data.documents || 
          (data.submitted_documents || []).map((path: string) => ({ storage_path: path, filename: path.split('/').pop() || path }));
        setDocuments(docs);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDocuments();
  }, [caseId]);

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fileInput = form.elements.namedItem('files') as HTMLInputElement;
    if (!fileInput?.files?.length) return;

    setUploading(true);
    setError(null);

    const formData = new FormData();
    Array.from(fileInput.files).forEach(file => formData.append('files', file));
    formData.append('category', selectedCategory);

    try {
      const res = await fetch(`/api/cases/${caseId}/documents`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Upload failed');
      }

      // Refresh list
      await loadDocuments();
      fileInput.value = '';
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <form onSubmit={handleUpload} className="mb-6">
        <div className="flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1">Document Category</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm"
            >
              {IDR_CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1">Files (PDF only)</label>
            <input 
              type="file" 
              name="files" 
              multiple 
              accept=".pdf" 
              className="block w-full text-sm" 
            />
          </div>
          <button
            type="submit"
            disabled={uploading}
            className="px-4 py-2 bg-navy text-white rounded-lg text-sm font-medium hover:bg-navy-light disabled:opacity-60"
          >
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
        </div>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      </form>

      {loading ? (
        <div className="text-sm text-muted">Loading documents…</div>
      ) : documents.length === 0 ? (
        <div className="text-sm text-muted border border-dashed border-border rounded-lg p-4 text-center">
          No documents uploaded yet for this IDR case.
        </div>
      ) : (
        <ul className="space-y-2 text-sm">
          {documents.map((doc, index) => (
            <li key={index} className="flex items-center justify-between border border-border rounded-lg px-4 py-2">
              <div>
                <div className="font-medium">{doc.filename}</div>
                {doc.category && <div className="text-xs text-muted">{doc.category}</div>}
              </div>
              <a
                href={`/api/cases/${caseId}/documents/sign?path=${encodeURIComponent(doc.storage_path)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-navy hover:underline text-sm"
              >
                View
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
