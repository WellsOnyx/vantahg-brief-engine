/**
 * YAML subset for IDR content files.
 * Maps, lists, scalars, and comments. No anchors and no tabs.
 * Checklist and template frontmatter stay in this subset so a reviewer
 * can edit them without a code build.
 */

export class YamlParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'YamlParseError';
  }
}

export type YamlValue =
  | string
  | number
  | boolean
  | null
  | YamlValue[]
  | { [key: string]: YamlValue };

interface Tok {
  line: number;
  indent: number;
  content: string;
}

export function parseYaml(source: string): YamlValue {
  const tokens = tokenize(source);
  if (tokens.length === 0) return {};
  const [value, next] = parseBlock(tokens, 0, tokens[0].indent);
  if (next !== tokens.length) {
    throw new YamlParseError(`Unexpected content at line ${tokens[next].line}.`);
  }
  return value;
}

function tokenize(source: string): Tok[] {
  if (source.includes('\t')) {
    throw new YamlParseError('Tabs are not allowed in IDR content files. Use spaces.');
  }
  const tokens: Tok[] = [];
  const lines = source.replace(/^\uFEFF/, '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (raw.trim() === '' || raw.trim() === '---') continue;
    const indent = raw.match(/^ */)?.[0].length ?? 0;
    const content = stripComment(raw.slice(indent));
    if (content === '' || content.startsWith('#')) continue;
    tokens.push({ line: i + 1, indent, content });
  }
  return tokens;
}

function stripComment(content: string): string {
  if (content.startsWith('#')) return '';
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    if (quote) {
      if (quote === '"' && c === '\\') {
        i += 1;
        continue;
      }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === '#' && (i === 0 || content[i - 1] === ' ')) {
      return content.slice(0, i).trimEnd();
    }
  }
  return content.trimEnd();
}

function parseBlock(tokens: Tok[], start: number, indent: number): [YamlValue, number] {
  if (start >= tokens.length) return [{}, start];
  if (tokens[start].content.startsWith('- ')) return parseList(tokens, start, indent);
  return parseMap(tokens, start, indent);
}

function parseMap(tokens: Tok[], start: number, indent: number): [{ [key: string]: YamlValue }, number] {
  const obj: { [key: string]: YamlValue } = {};
  let i = start;
  while (i < tokens.length) {
    const tok = tokens[i];
    if (tok.indent < indent) break;
    if (tok.indent > indent) {
      throw new YamlParseError(`Unexpected indent at line ${tok.line}.`);
    }
    if (tok.content.startsWith('- ')) break;
    const split = splitKey(tok.content, tok.line);
    if (Object.prototype.hasOwnProperty.call(obj, split.key)) {
      throw new YamlParseError(`Duplicate key "${split.key}" at line ${tok.line}.`);
    }
    if (split.rest === '') {
      if (i + 1 < tokens.length && tokens[i + 1].indent > indent) {
        const [child, next] = parseBlock(tokens, i + 1, tokens[i + 1].indent);
        obj[split.key] = child;
        i = next;
      } else {
        obj[split.key] = '';
        i += 1;
      }
    } else {
      obj[split.key] = parseScalar(split.rest, tok.line);
      i += 1;
    }
  }
  return [obj, i];
}

function parseList(tokens: Tok[], start: number, indent: number): [YamlValue[], number] {
  const items: YamlValue[] = [];
  let i = start;
  while (i < tokens.length) {
    const tok = tokens[i];
    if (tok.indent < indent) break;
    if (tok.indent !== indent || !tok.content.startsWith('- ')) break;
    const rest = tok.content.slice(2).trim();
    if (rest === '') {
      if (i + 1 < tokens.length && tokens[i + 1].indent > indent) {
        const [child, next] = parseBlock(tokens, i + 1, tokens[i + 1].indent);
        items.push(child);
        i = next;
      } else {
        items.push(null);
        i += 1;
      }
      continue;
    }
    if (isMapStart(rest)) {
      const childIndent = indent + 2;
      const synthetic: Tok[] = [{ line: tok.line, indent: childIndent, content: rest }];
      let j = i + 1;
      while (j < tokens.length && tokens[j].indent > indent) {
        synthetic.push(tokens[j]);
        j += 1;
      }
      const [child] = parseMap(synthetic, 0, childIndent);
      items.push(child);
      i = j;
      continue;
    }
    items.push(parseScalar(rest, tok.line));
    i += 1;
  }
  return [items, i];
}

function isMapStart(rest: string): boolean {
  if (rest.startsWith('"') || rest.startsWith("'")) return false;
  return /^[^:]+:(?:\s|$)/.test(rest);
}

function splitKey(content: string, line: number): { key: string; rest: string } {
  const match = /^([^:]+):\s*(.*)$/.exec(content);
  if (!match) throw new YamlParseError(`Expected a key at line ${line}.`);
  return { key: match[1].trim(), rest: match[2] };
}

function parseScalar(raw: string, line: number): YamlValue {
  const s = raw.trim();
  if (s.startsWith('"')) return readDoubleQuoted(s, line);
  if (s.startsWith("'")) return readSingleQuoted(s, line);
  const hash = s.indexOf(' #');
  const plain = (hash >= 0 ? s.slice(0, hash) : s).trim();
  if (plain === 'true') return true;
  if (plain === 'false') return false;
  if (plain === 'null' || plain === '~') return null;
  if (/^-?\d+$/.test(plain)) return Number(plain);
  if (plain === '') return '';
  return plain;
}

function readDoubleQuoted(s: string, line: number): string {
  let out = '';
  for (let i = 1; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') {
      const n = s[i + 1];
      if (n === undefined) throw new YamlParseError(`Bad escape at line ${line}.`);
      out += n === 'n' ? '\n' : n === 't' ? '\t' : n;
      i += 1;
      continue;
    }
    if (c === '"') {
      const after = s.slice(i + 1).trim();
      if (after !== '' && !after.startsWith('#')) {
        throw new YamlParseError(`Trailing characters after a string at line ${line}.`);
      }
      return out;
    }
    out += c;
  }
  throw new YamlParseError(`Unterminated string at line ${line}.`);
}

function readSingleQuoted(s: string, line: number): string {
  let out = '';
  for (let i = 1; i < s.length; i++) {
    if (s[i] === "'" && s[i + 1] === "'") {
      out += "'";
      i += 1;
      continue;
    }
    if (s[i] === "'") return out;
    out += s[i];
  }
  throw new YamlParseError(`Unterminated string at line ${line}.`);
}
