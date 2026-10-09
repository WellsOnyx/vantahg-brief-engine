import { inflateRawSync } from 'zlib';

export interface ZipEntry {
  name: string;
  data: Buffer;
}

function crc32(buf: Buffer): number {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let k = 0; k < 8; k++) {
      const bit = crc & 1;
      crc = (crc >>> 1) ^ (bit ? 0xedb88320 : 0);
    }
  }
  return ~crc >>> 0;
}

/** Stored-method ZIP. Enough for a one-sheet workbook. */
export function zipStore(entries: ZipEntry[]): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const crc = crc32(entry.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(entry.data.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    parts.push(local, name, entry.data);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 8);
    cd.writeUInt16LE(0, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(entry.data.length, 20);
    cd.writeUInt32LE(entry.data.length, 24);
    cd.writeUInt16LE(name.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, name);
    offset += local.length + name.length + entry.data.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...parts, centralBuf, end]);
}

export function unzip(bytes: Buffer): ZipEntry[] {
  const entries: ZipEntry[] = [];
  let pos = 0;
  while (pos + 30 <= bytes.length) {
    const sig = bytes.readUInt32LE(pos);
    if (sig === 0x02014b50 || sig === 0x06054b50) break;
    if (sig !== 0x04034b50) break;
    const method = bytes.readUInt16LE(pos + 8);
    const compSize = bytes.readUInt32LE(pos + 18);
    const nameLen = bytes.readUInt16LE(pos + 26);
    const extraLen = bytes.readUInt16LE(pos + 28);
    const nameStart = pos + 30;
    const name = bytes.slice(nameStart, nameStart + nameLen).toString('utf8');
    const dataStart = nameStart + nameLen + extraLen;
    const compressed = bytes.slice(dataStart, dataStart + compSize);
    const data = method === 0 ? compressed : method === 8 ? inflateRawSync(compressed) : compressed;
    entries.push({ name, data });
    pos = dataStart + compSize;
  }
  return entries;
}

function xmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function xmlDecode(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

export function writeSimpleXlsx(rows: string[][]): Buffer {
  const sheetRows = rows
    .map((row, r) => {
      const cells = row
        .map((value, c) => {
          const ref = `${columnName(c)}${r + 1}`;
          return `<c r="${ref}" t="inlineStr"><is><t>${xmlText(value)}</t></is></c>`;
        })
        .join('');
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join('');
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Credentialing" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;
  return zipStore([
    { name: '[Content_Types].xml', data: Buffer.from(contentTypes) },
    { name: '_rels/.rels', data: Buffer.from(rootRels) },
    { name: 'xl/workbook.xml', data: Buffer.from(workbook) },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(rels) },
    { name: 'xl/worksheets/sheet1.xml', data: Buffer.from(sheet) },
  ]);
}

function columnName(index: number): string {
  let n = index + 1;
  let name = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function columnIndex(ref: string): number {
  const letters = ref.replace(/[0-9]/g, '');
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function readXlsxRows(bytes: Buffer): string[][] {
  const entries = unzip(bytes);
  const sheet = entries.find((entry) => entry.name === 'xl/worksheets/sheet1.xml');
  if (!sheet) throw new Error('xlsx_sheet_missing');
  const shared = entries.find((entry) => entry.name === 'xl/sharedStrings.xml');
  const strings: string[] = [];
  if (shared) {
    const xml = shared.data.toString('utf8');
    const items = xml.match(/<si[\s\S]*?<\/si>/g) ?? [];
    for (const item of items) {
      const texts = [...item.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((match) => xmlDecode(match[1]));
      strings.push(texts.join(''));
    }
  }
  const xml = sheet.data.toString('utf8');
  const rowMatches = xml.match(/<row\b[\s\S]*?<\/row>/g) ?? [];
  const table: string[][] = [];
  for (const rowXml of rowMatches) {
    const rowNum = Number(rowXml.match(/r="(\d+)"/)?.[1] ?? table.length + 1);
    const cells = [...rowXml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)];
    const line: string[] = [];
    for (const cell of cells) {
      const attrs = cell[1];
      const body = cell[2];
      const ref = attrs.match(/r="([A-Z]+\d+)"/)?.[1] ?? 'A1';
      const type = attrs.match(/t="([^"]+)"/)?.[1] ?? '';
      let value = '';
      if (type === 'inlineStr') {
        value = xmlDecode(body.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? '');
      } else if (type === 's') {
        const index = Number(body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? '0');
        value = strings[index] ?? '';
      } else {
        value = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? '';
      }
      const col = columnIndex(ref);
      while (line.length <= col) line.push('');
      line[col] = value;
    }
    while (table.length < rowNum - 1) table.push([]);
    table[rowNum - 1] = line;
  }
  return table.filter((row) => row.some((cell) => cell.trim() !== ''));
}
