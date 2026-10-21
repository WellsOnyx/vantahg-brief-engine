import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { IdrContentError, parseChecklistDocument, parseTemplateMeta } from './schema';
import { LIVE_TEXT_MARKER, NIP_BRANCHES, type IdrContentCatalog, type NipBranch, type QaChecklist, type TemplateFile } from './types';

const CHECKLIST_KEY = 'config/idr/qa-checklist.yaml';

const PARAGRAPH_SLOTS = ['chart_paragraph', 'ip_paragraph', 'nip_paragraph', 'winner_paragraph'] as const;

export function defaultIdrContentRoot(): string {
  return path.join(process.cwd(), 'config', 'idr');
}

export function templateKey(party: 'IP' | 'NIP', brief: 'present' | 'absent', shape: 'single' | 'batched'): string {
  const briefToken = brief === 'present' ? 'brief' : 'no-brief';
  const shapeToken = shape === 'single' ? 'single' : 'batch';
  return `${party.toLowerCase()}-${briefToken}-${shapeToken}`;
}

export function nipTemplateId(branch: NipBranch): string {
  return `nip-${branch.replaceAll('_', '-')}`;
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
  const expectedId = expectedTemplateId(meta, filePath);
  if (meta.id !== expectedId) {
    throw new IdrContentError(`${filePath}: id does not match party, brief, dispute shape, or NIP branch.`);
  }
  const paragraphs = splitParagraphs(front.body, filePath);
  assertBody(filePath, paragraphs, checklist);
  return {
    ...meta,
    path: filePath,
    body: front.body,
    paragraphs,
  };
}

function expectedTemplateId(
  meta: { party_variant: 'IP' | 'NIP'; nip_branch: NipBranch | 'none'; nip_brief: 'present' | 'absent' | 'any'; dispute_shape: 'single' | 'batched' | 'any' },
  filePath: string,
): string {
  if (meta.party_variant === 'IP') {
    if (meta.nip_brief === 'any' || meta.dispute_shape === 'any') {
      throw new IdrContentError(`${filePath}: an initiating-party template names a brief and a dispute shape.`);
    }
    return templateKey('IP', meta.nip_brief, meta.dispute_shape);
  }
  if (meta.nip_branch === 'none') {
    throw new IdrContentError(`${filePath}: a non-initiating-party template names a branch.`);
  }
  return nipTemplateId(meta.nip_branch);
}

function splitFrontmatter(source: string, filePath: string): { meta: string; body: string } {
  const normalized = source.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    throw new IdrContentError(`${filePath}: template is missing frontmatter.`);
  }
  const end = normalized.indexOf('\n---');
  if (end < 0) throw new IdrContentError(`${filePath}: template frontmatter is not closed.`);
  const meta = normalized.slice(normalized.indexOf('\n') + 1, end);
  const body = normalized.slice(end + 4).replace(/^\n/, '').trim();
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
  paragraphs: readonly [string, string, string, string],
  checklist: QaChecklist,
): void {
  const marker = checklist.slots.live_text_marker;
  if (marker !== LIVE_TEXT_MARKER) {
    throw new IdrContentError(`${filePath}: live text marker is ${LIVE_TEXT_MARKER}.`);
  }
  paragraphs.forEach((paragraph, index) => {
    const slot = PARAGRAPH_SLOTS[index];
    const expected = `${marker}\n{{${slot}}}`;
    if (paragraph !== expected) {
      throw new IdrContentError(`${filePath}: paragraph ${index + 1} must be the ${slot} placeholder marked ${marker}.`);
    }
  });
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
    ...NIP_BRANCHES.map((branch) => nipTemplateId(branch)),
  ];
  for (const id of expected) {
    if (!byId.has(id)) throw new IdrContentError(`Template set is missing ${id}.`);
  }
  if (byId.size !== expected.length) {
    throw new IdrContentError('Template set has an unexpected file.');
  }
  return { checklist, templates, byId };
}
