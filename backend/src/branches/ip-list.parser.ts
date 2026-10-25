import { isIP } from 'node:net';

export interface IpEntry {
  ip: string;
  label: string;
}

const isIPv4 = (value: string) => isIP(value) === 4;

/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const IP_HEADER = /^(ip|ip ?address|ipaddress|server ?ip|ip ?server)$/i;
const LABEL_HEADER = /^(label|name|branch|clinic|site|สาขา|ชื่อ.*|ชื่อสาขา|คลินิก)$/i;

function fromCsv(text: string): IpEntry[] {
  const rows = parseCsv(text).map((r) => r.map((c) => c.trim()));
  if (rows.length === 0) return [];

  const header = rows[0];
  const ipCol = header.findIndex((h) => IP_HEADER.test(h));
  const labelCol = header.findIndex((h) => LABEL_HEADER.test(h));
  const hasHeader = ipCol !== -1;

  const entries: IpEntry[] = [];
  for (const cells of hasHeader ? rows.slice(1) : rows) {
    // Without a recognised header: first IPv4-looking cell is the IP,
    // first other non-empty cell is the label.
    const ip = hasHeader ? cells[ipCol] ?? '' : cells.find(isIPv4) ?? '';
    if (!isIPv4(ip)) continue;
    const label =
      hasHeader && labelCol !== -1
        ? cells[labelCol] ?? ''
        : cells.find((c) => c !== '' && c !== ip) ?? '';
    entries.push({ ip, label });
  }
  return entries;
}

function fromJson(text: string): IpEntry[] {
  const json: unknown = JSON.parse(text);
  const list = Array.isArray(json)
    ? json
    : Array.isArray((json as { list?: unknown })?.list)
      ? (json as { list: unknown[] }).list
      : [];
  return list
    .map((x) => {
      const item = (x ?? {}) as Record<string, unknown>;
      return {
        ip: String(item.ip ?? '').trim(),
        label: String(item.label ?? item.name ?? '').trim(),
      };
    })
    .filter((e) => isIPv4(e.ip));
}

/**
 * Accepts either a Google Sheet CSV export or JSON shaped like the
 * original `/ip-list` response (`{ list: [{ ip, label }] }`).
 */
export function parseIpList(body: string): IpEntry[] {
  const text = body.replace(/^\uFEFF/, '').trim();
  if (text.startsWith('{') || text.startsWith('[')) return fromJson(text);
  return fromCsv(text);
}
