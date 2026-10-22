import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BATCH_LINK_BASIS,
  BANNED_WORDS_BASIS,
  CV_SENTENCE_BASIS,
  FACTOR_7_CREDIT_BASIS,
  FACTOR_BASIS,
  NIP_BRANCH_BASIS,
  NO_CPT_BASIS,
  PARAGRAPH_ORDER_BASIS,
  RULE_IDS,
  catalogApprovedForProduction,
  loadIdrCatalog,
  prepareDetermination,
} from '@/lib/idr/determination';
import { deps, idrActor, singleRequest } from './fixture';

const HOUSE_STYLE_RULES = [
  'paragraph_order',
  'cv_sentence',
  'batch_same_as',
  'banned_words',
  'no_cpt',
  'nip_branches',
  'factor_7',
] as const;

describe('IDR public-source rule', () => {
  it('cites a public source or labels the rule house_style', () => {
    const catalog = loadIdrCatalog();
    expect(catalog.checklist.rules.map((rule) => rule.id)).toEqual([...RULE_IDS]);
    for (const id of HOUSE_STYLE_RULES) {
      expect(catalog.checklist.rules.find((rule) => rule.id === id)?.basis).toBe('house_style');
    }
    for (const rule of catalog.checklist.rules) {
      if (rule.basis === 'public') {
        expect(rule.citation).toMatch(/45 CFR 149\./);
        expect(rule.source_url).toMatch(/^https:\/\//);
      } else {
        expect(rule.note.length).toBeGreaterThan(20);
      }
    }
    const urls = catalog.checklist.public_sources.map((source) => source.url);
    expect(urls.some((url) => url.includes('section-149.510'))).toBe(true);
    expect(urls.some((url) => url.includes('section-149.140'))).toBe(true);
    expect(catalog.checklist.public_sources.some((source) => source.title.includes('Certified IDR Entities'))).toBe(true);
    expect(catalog.checklist.public_sources.some((source) => source.title.includes('Disputing Parties'))).toBe(true);
    expect(catalogApprovedForProduction(catalog)).toBe(false);
  });

  it('keeps the basis in the rule modules and blocks an unapproved clean draft', () => {
    const dir = path.join(process.cwd(), 'lib', 'idr', 'determination');
    for (const name of ['select.ts', 'factors.ts', 'phrases.ts', 'qa.ts']) {
      const source = readFileSync(path.join(dir, name), 'utf8');
      expect(source).toContain('house_style');
      expect(source).toContain('45 CFR 149.510');
    }
    expect(NIP_BRANCH_BASIS.basis).toBe('house_style');
    expect(FACTOR_7_CREDIT_BASIS.basis).toBe('house_style');
    expect(FACTOR_BASIS.basis).toBe('public');
    expect(FACTOR_BASIS.citation).toContain('45 CFR 149.510');
    expect(CV_SENTENCE_BASIS.basis).toBe('house_style');
    expect(PARAGRAPH_ORDER_BASIS.basis).toBe('house_style');
    expect(BATCH_LINK_BASIS.basis).toBe('house_style');
    expect(BANNED_WORDS_BASIS.basis).toBe('house_style');
    expect(NO_CPT_BASIS.basis).toBe('house_style');

    const pending = prepareDetermination(idrActor(), singleRequest(), deps());
    expect(pending.code).toBe('draft_pending_human_approval');
    expect(pending.production_allowed).toBe(false);
    expect(pending.clean_text).toBeNull();
    expect(pending.board).toBeNull();
    expect(pending.gates.every((gate) => gate.pass)).toBe(true);
  });
});
