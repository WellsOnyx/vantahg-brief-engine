import { randomBytes } from 'crypto';
import type { EmailAttachment } from './types';

/**
 * Minimal RFC 2045 multipart MIME builder for SES SendEmail Raw content.
 * No extra dependency — we only need text/html + file attachments.
 */

function encodeHeader(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function foldHeaders(name: string, value: string): string {
  return `${name}: ${encodeHeader(value)}`;
}

function defaultHtml(subject: string, text: string): string {
  const escaped = text.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!));
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#0c2340;line-height:1.5;">
    <div style="max-width:560px;margin:32px auto;padding:24px;">
      <h2 style="margin:0 0 16px 0;color:#0c2340;">${encodeHeader(subject)}</h2>
      <pre style="white-space:pre-wrap;font-family:inherit;font-size:14px;">${escaped}</pre>
    </div></body></html>`;
}

export function buildRawMime(params: {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: EmailAttachment[];
}): Buffer {
  const html = params.html ?? defaultHtml(params.subject, params.text);
  const attachments = params.attachments ?? [];
  const altBoundary = `alt-${randomBytes(8).toString('hex')}`;
  const mixedBoundary = `mixed-${randomBytes(8).toString('hex')}`;

  const alternative = [
    `--${altBoundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    params.text,
    `--${altBoundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    html,
    `--${altBoundary}--`,
  ].join('\r\n');

  const headers = [
    foldHeaders('From', params.from),
    foldHeaders('To', params.to),
    foldHeaders('Subject', params.subject),
    'MIME-Version: 1.0',
  ];

  if (attachments.length === 0) {
    headers.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
    return Buffer.from(`${headers.join('\r\n')}\r\n\r\n${alternative}\r\n`, 'utf8');
  }

  headers.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`);
  const parts: string[] = [
    headers.join('\r\n'),
    '',
    `--${mixedBoundary}`,
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    '',
    alternative,
  ];

  for (const a of attachments) {
    const filename = a.filename.replace(/["\r\n]/g, '_');
    const type = a.contentType ?? 'application/octet-stream';
    parts.push(
      `--${mixedBoundary}`,
      `Content-Type: ${type}; name="${filename}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${filename}"`,
      '',
      a.content.toString('base64').replace(/(.{76})/g, '$1\r\n'),
    );
  }

  parts.push(`--${mixedBoundary}--`, '');
  return Buffer.from(parts.join('\r\n'), 'utf8');
}
