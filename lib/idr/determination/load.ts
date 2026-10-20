import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { IdrContentError, parseChecklistDocument, parseTemplateMeta } from './schema';
import type { IdrContentCatalog, QaChecklist, QpaWording, TemplateFile } from './types';

const CHECKLIST_KEY = 'config/idr/qa-checklist.yaml';

const SINGLE_PLACEHOLDERS = ['dispute_ref', 'ip_offer', 'nip_offer', 'qpa', 'factor_block', 'reason'] as const;
const BATCH_PLACEHOLDERS = ['dispute_ref', 'line_count', 'offer_lines', 'factor_block', 'reason'] as const;

export function defaultIdrContentRoot(): string {
  return path.join(process.cwd(), 'config', 'idr');
}

export function templateKey(party: 'IP' | 'NIP', brief: 'present' | 'absent', shape: 'single' | 'batched'): string {
  const briefToken = brief === 'present' ? 'brief' : 'no-brief';
  const shapeToken = shape === 'single' ? 'single' : 'batch';
  return `${party.toLowerCase()}-${briefToken}-${shapeToken}`;
}

export function readIdrContentFiles(root = defaultIdrContentRoot()): Record<string, string> {
  const files: Record<string, string> = {};
  files[CHECKLIST_KEY] = readFileSync(path.join(root, 'qa-checklist.yaml'), 'utf8');
  const templateDir = path.join(root, 'templates');
  for (const name of readdirSync(templateDir)) {
    if (!name.endsWith('.md')) continue;
    files[`config/idr/templates/${name}`] = readFileSync(path.join(templateDir, name), 'utf8');
  }
  return files;
}

export function loadIdrCatalog(root = defaultIdrContentRoot()): IdrContentCatalog {
  return loadIdrCatalogFromFiles(readIdrContentFiles(root));
}

export function loadIdrCatalogFromFiles(files: Readonly<Record<string, string>>): IdrContentCatalog {
  const checklistSource = files[CHECKLIST_KEY];
  if (checklistSource === undefined) {
    throw new IdrContentError(`Missing ${CHECKLIST_KEY}.`);
  }
  const checklist = parseChecklistDocument(checklistSource, CHECKLIST_KEY);
  const templates: TemplateFile[] = [];
  for (const [filePath, source] of Object.entries(files)) {
    if (filePath === CHECKLIST_KEY) continue;
    if (!/^config\/idr\/templates\/[a-z0-9-]+\.md$/.test(filePath)) {
      throw new IdrContentError(`Unexpected IDR content path ${filePath}.`);
    }
    templates.push(parseTemplateDocument(filePath, source, checklist));
  }
  return indexTemplates(checklist, templates);
}

export function parseTemplateDocument(filePath: string, source: string, checklist: QaChecklist): TemplateFile {
  const front = splitFrontmatter(source, filePath);
  const meta = parseTemplateMeta(front.meta, filePath);
  const stem = path.basename(filePath, '.md');
  if (meta.id !== stem) {
    throw new IdrContentError(`${filePath}: id ${meta.id} does not match the file name.`);
  }
  const expectedId = templateKey(meta.party_variant, meta.nip_brief, meta.dispute_shape);
  if (meta.id !== expectedId) {
    throw new IdrContentError(`${filePath}: id does not match party, brief, and dispute shape.`);
  }
  const paragraphs = splitParagraphs(front.body, filePath);
  assertBody(filePath, front.body, paragraphs, meta, checklist);
  return {
    ...meta,
    path: filePath,
    body: front.body,
    paragraphs,
  };
}

function splitFrontmatter(source: string, filePath: string): { meta: string; body: string } {
  const normalized = source.replace(/^\uFEFF/, '');
  if (!normalized.startsWith('---\n') && !normalized.startsWith('---\r\n')) {
    throw new IdrContentError(`${filePath}: template is missing frontmatter.`);
  }
  const end = normalized.indexOf('\n---');
  if (end < 0) throw new IdrContentError(`${filePath}: template frontmatter is not closed.`);
  const meta = normalized.slice(normalized.indexOf('\n') + 1, end);
  const body = normalized.slice(end + 4).replace(/^\r?\n/, '').trim();
  return { meta, body };
}

function splitParagraphs(body: string, filePath: string): [string, string, string, string] {
  const parts = body.split(/\n\s*\n/).map((part) => part.trim());
  if (parts.length !== 4 || parts.some((part) => part.length === 0)) {
    throw new IdrContentError(`${filePath}: a determination template must be four paragraphs.`);
  }
  return [parts[0], parts[1], parts[2], parts[3]];
}

function assertBody(
  filePath: string,
  body: string,
  paragraphs: readonly [string, string, string, string],
  meta: { party_variant: 'IP' | 'NIP'; nip_brief: 'present' | 'absent'; qpa_wording: QpaWording; dispute_shape: 'single' | 'batched' },
  checklist: QaChecklist,
): void {
  if (paragraphs[2] !== '{{factor_block}}') {
    throw new IdrContentError(`${filePath}: paragraph 3 must be the factor block placeholder.`);
  }
  const phrases = checklist.variant_phrases;
  const partyPhrase = meta.party_variant === 'IP' ? phrases.IP : phrases.NIP;
  const otherParty = meta.party_variant === 'IP' ? phrases.NIP : phrases.IP;
  const briefPhrase = meta.nip_brief === 'present' ? phrases.brief_present : phrases.brief_absent;
  const otherBrief = meta.nip_brief === 'present' ? phrases.brief_absent : phrases.brief_present;
  const qpaPhrase = meta.qpa_wording === 'single' ? phrases.qpa_single : phrases.qpa_batch;
  const otherQpa = meta.qpa_wording === 'single' ? phrases.qpa_batch : phrases.qpa_single;
  if (!body.includes(partyPhrase)) {
    throw new IdrContentError(`${filePath}: template is missing the ${meta.party_variant} prevailing-party sentence.`);
  }
  if (body.includes(otherParty)) {
    throw new IdrContentError(`${filePath}: template contains the other prevailing-party sentence.`);
  }
  if (!body.includes(briefPhrase)) {
    throw new IdrContentError(`${filePath}: template is missing the brief sentence.`);
  }
  if (body.includes(otherBrief)) {
    throw new IdrContentError(`${filePath}: template contains the other brief sentence.`);
  }
  if (!body.includes(qpaPhrase)) {
    throw new IdrContentError(`${filePath}: template is missing the ${meta.qpa_wording} QPA wording.`);
  }
  if (body.includes(otherQpa)) {
    throw new IdrContentError(`${filePath}: template contains the other QPA wording.`);
  }
  const required = meta.dispute_shape === 'single' ? SINGLE_PLACEHOLDERS : BATCH_PLACEHOLDERS;
  const found = [...body.matchAll(/\{\{([a-z0-9_]+)\}\}/g)].map((match) => match[1]);
  for (const key of required) {
    if (!found.includes(key)) throw new IdrContentError(`${filePath}: missing placeholder {{${key}}}.`);
  }
  for (const key of found) {
    if (!(required as readonly string[]).includes(key)) {
      throw new IdrContentError(`${filePath}: unknown placeholder {{${key}}}.`);
    }
  }
  if (body.includes('MISSING') || body.includes('TODO') || body.includes('FIXME')) {
    throw new IdrContentError(`${filePath}: template contains ops markup.`);
  }
}

function indexTemplates(checklist: QaChecklist, templates: readonly TemplateFile[]): IdrContentCatalog {
  const byId = new Map<string, TemplateFile>();
  for (const template of templates) {
    if (byId.has(template.id)) {
      throw new IdrContentError(`Duplicate template id ${template.id}.`);
    }
    byId.set(template.id, template);
  }
  const expected = [
    templateKey('IP', 'present', 'single'),
    templateKey('IP', 'present', 'batched'),
    templateKey('IP', 'absent', 'single'),
    templateKey('IP', 'absent', 'batched'),
    templateKey('NIP', 'present', 'single'),
    templateKey('NIP', 'present', 'batched'),
    templateKey('NIP', 'absent', 'single'),
    templateKey('NIP', 'absent', 'batched'),
  ];
  for (const id of expected) {
    if (!byId.has(id)) throw new IdrContentError(`Template set is missing ${id}.`);
  }
  if (byId.size !== expected.length) {
    throw new IdrContentError('Template set has an unexpected file.');
  }
  return { checklist, templates, byId };
}
