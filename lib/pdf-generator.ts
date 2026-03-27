import { jsPDF } from 'jspdf';
import type { Case, Reviewer } from './types';

const NAVY = '#0c2340';
const GOLD = '#c9a227';
const GRAY = '#6b7280';
const RED = '#dc2626';
const GREEN = '#16a34a';

const DETERMINATION_LABELS: Record<string, string> = {
  approve: 'APPROVED',
  deny: 'DENIED',
  partial_approve: 'PARTIALLY APPROVED',
  modify: 'APPROVED WITH MODIFICATIONS',
  pend: 'PENDED — ADDITIONAL INFORMATION REQUIRED',
  peer_to_peer_requested: 'PEER-TO-PEER REVIEW REQUESTED',
};

/**
 * Generate a PDF determination letter for a case.
 * Returns a Buffer containing the PDF binary data.
 */
export async function generateDeterminationPdf(caseData: Case): Promise<Buffer> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const reviewer = (caseData as any).reviewer as Reviewer | undefined;
  const determinationDate = caseData.determination_at
    ? new Date(caseData.determination_at).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
      })
    : 'N/A';
  const isDenial = caseData.determination === 'deny' || caseData.determination === 'partial_approve';

  // ── Header ──
  doc.setFillColor(NAVY);
  doc.rect(0, 0, pageWidth, 22, 'F');
  doc.setTextColor(GOLD);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('V', margin, 14);
  doc.setTextColor('#ffffff');
  doc.setFontSize(14);
  doc.text('VantaUM', margin + 10, 14);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Clinical Brief Engine', margin + 10, 19);

  // Right side header
  doc.setTextColor('#ffffff');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('UTILIZATION REVIEW DETERMINATION', pageWidth - margin, 10, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.text(`Case: ${caseData.case_number}`, pageWidth - margin, 15, { align: 'right' });
  doc.text(`Date: ${determinationDate}`, pageWidth - margin, 19, { align: 'right' });

  y = 30;

  // ── Determination Banner ──
  const detLabel = DETERMINATION_LABELS[caseData.determination!] || caseData.determination!.toUpperCase();
  const bannerColor = isDenial ? '#fef2f2' : '#f0fdf4';
  const textColor = isDenial ? RED : GREEN;

  doc.setFillColor(bannerColor);
  doc.roundedRect(margin, y, contentWidth, 16, 2, 2, 'F');
  doc.setTextColor(GRAY);
  doc.setFontSize(7);
  doc.text('DETERMINATION', pageWidth / 2, y + 5, { align: 'center' });
  doc.setTextColor(textColor);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(detLabel, pageWidth / 2, y + 13, { align: 'center' });

  y += 22;

  // ── Helper functions ──
  function sectionHeader(title: string) {
    if (y > 260) { doc.addPage(); y = margin; }
    doc.setTextColor(GRAY);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text(title.toUpperCase(), margin, y);
    doc.setDrawColor('#e5e7eb');
    doc.line(margin, y + 1.5, margin + contentWidth, y + 1.5);
    y += 6;
  }

  function fieldRow(label: string, value: string, x = margin, width = contentWidth / 2 - 5) {
    doc.setTextColor(GRAY);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(label, x, y);
    doc.setTextColor('#111827');
    doc.setFont('helvetica', 'bold');
    const lines = doc.splitTextToSize(value || '—', width - 30);
    doc.text(lines, x + 28, y);
    y += Math.max(lines.length * 4, 5);
  }

  function wrappedText(text: string, fontSize = 8) {
    if (y > 260) { doc.addPage(); y = margin; }
    doc.setTextColor('#111827');
    doc.setFontSize(fontSize);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(text, contentWidth);
    doc.text(lines, margin, y);
    y += lines.length * (fontSize * 0.5) + 3;
  }

  // ── Patient & Provider Info ──
  const colLeft = margin;
  const colRight = pageWidth / 2 + 5;

  sectionHeader('Patient Information');
  const savedY = y;
  fieldRow('Name', caseData.patient_name || '—', colLeft);
  fieldRow('DOB', caseData.patient_dob || '—', colLeft);
  fieldRow('Gender', caseData.patient_gender || '—', colLeft);
  fieldRow('Member ID', caseData.patient_member_id || '—', colLeft);
  const leftEnd = y;

  y = savedY;
  sectionHeader('Provider Information');
  fieldRow('Provider', caseData.requesting_provider || '—', colRight);
  fieldRow('NPI', caseData.requesting_provider_npi || '—', colRight);
  fieldRow('Specialty', caseData.requesting_provider_specialty || '—', colRight);
  y = Math.max(leftEnd, y) + 4;

  // ── Service Details ──
  sectionHeader('Service Details');
  fieldRow('Category', (caseData.service_category || '—').replace(/_/g, ' '));
  fieldRow('Review Type', (caseData.review_type || '—').replace(/_/g, ' '));
  fieldRow('CPT/HCPCS', caseData.procedure_codes?.join(', ') || '—');
  fieldRow('ICD-10', caseData.diagnosis_codes?.join(', ') || '—');
  y += 2;

  // ── Procedure Description ──
  if (caseData.procedure_description) {
    sectionHeader('Procedure Description');
    wrappedText(caseData.procedure_description);
    y += 2;
  }

  // ── Clinical Rationale ──
  sectionHeader('Clinical Rationale');
  wrappedText(caseData.determination_rationale || 'No rationale provided.');
  y += 2;

  // ── Denial Details ──
  if (isDenial) {
    sectionHeader('Denial Details');
    if (caseData.denial_reason) {
      doc.setTextColor(RED);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.text('REASON FOR DENIAL', margin, y);
      y += 4;
      wrappedText(caseData.denial_reason);
    }
    if (caseData.denial_criteria_cited) {
      doc.setTextColor(RED);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.text('CLINICAL CRITERIA CITED', margin, y);
      y += 4;
      wrappedText(caseData.denial_criteria_cited);
    }
    y += 2;
  }

  // ── Clinical Criteria Reference ──
  if (caseData.ai_brief?.criteria_match) {
    sectionHeader('Clinical Criteria Reference');
    const cm = caseData.ai_brief.criteria_match;
    if (cm.applicable_guideline) {
      doc.setTextColor(GRAY);
      doc.setFontSize(7);
      doc.text('APPLICABLE GUIDELINE', margin, y);
      y += 4;
      wrappedText(cm.applicable_guideline);
    }
    if (cm.criteria_met?.length) {
      doc.setTextColor(GREEN);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.text('CRITERIA MET', margin, y);
      y += 4;
      for (const c of cm.criteria_met) {
        wrappedText(`• ${c}`);
      }
    }
    if (cm.criteria_not_met?.length) {
      doc.setTextColor(RED);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.text('CRITERIA NOT MET', margin, y);
      y += 4;
      for (const c of cm.criteria_not_met) {
        wrappedText(`• ${c}`);
      }
    }
    y += 2;
  }

  // ── Appeal Rights ──
  if (isDenial) {
    if (y > 245) { doc.addPage(); y = margin; }
    sectionHeader('Appeal Rights');
    wrappedText(
      'You have the right to appeal this determination. To initiate an appeal or request a ' +
      'peer-to-peer review with the reviewing physician, please contact VantaUM within 30 days ' +
      'of this notice. Peer-to-peer reviews are available for all denied or partially approved cases.'
    );
    y += 2;
  }

  // ── Signature Block ──
  if (y > 245) { doc.addPage(); y = margin; }
  doc.setDrawColor(NAVY);
  doc.setLineWidth(0.5);
  doc.line(margin, y, margin + contentWidth, y);
  y += 8;

  doc.setDrawColor('#111827');
  doc.setLineWidth(0.2);
  doc.line(margin, y + 6, margin + 60, y + 6);
  doc.setTextColor('#111827');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(reviewer?.name || 'Reviewing Physician', margin, y + 10);
  if (reviewer?.credentials) {
    doc.setFont('helvetica', 'normal');
    doc.text(reviewer.credentials, margin, y + 14);
  }
  if (reviewer?.specialty) {
    doc.text(reviewer.specialty, margin, y + 18);
  }

  // Date signature
  doc.line(colRight, y + 6, colRight + 60, y + 6);
  doc.setFont('helvetica', 'bold');
  doc.text('Date', colRight, y + 10);
  doc.setFont('helvetica', 'normal');
  doc.text(determinationDate, colRight, y + 14);

  // ── Footer ──
  const footerY = doc.internal.pageSize.getHeight() - 12;
  doc.setDrawColor('#e5e7eb');
  doc.line(margin, footerY - 3, margin + contentWidth, footerY - 3);
  doc.setTextColor(GRAY);
  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `This determination was made by ${reviewer?.name || 'a board-certified physician'}. ` +
    'AI-generated clinical briefs assist in preparation but do not render medical determinations.',
    pageWidth / 2, footerY, { align: 'center' }
  );
  doc.text(
    'VantaUM Clinical Brief Engine — A Wells Onyx Service',
    pageWidth / 2, footerY + 4, { align: 'center' }
  );

  // Return as Buffer
  const arrayBuffer = doc.output('arraybuffer');
  return Buffer.from(arrayBuffer);
}
