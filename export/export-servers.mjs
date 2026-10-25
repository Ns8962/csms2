// Exports server name + IP from the AtizDevTool dashboard (read-only: GET /api/servers).
//
//   $env:ADMINTOOL_URL='https://<admin tool host>'; $env:ADMIN_USER='...'; $env:ADMIN_PASS='...'; node export-servers.mjs
//
// Writes next to this script (the CSV files are git-ignored: they list internal servers):
//   servers.csv      name,ip            enabled servers only (the dashboard's default "Enable" filter)
//   servers-all.csv  name,ip,enabled    every server
//
// The admin tool address and the credentials come from the environment only.
// agent_token and every other field are ignored.
import { writeFileSync } from 'node:fs';
import { isIPv4 } from 'node:net';
import { fileURLToPath } from 'node:url';

const BASE = process.env.ADMINTOOL_URL?.replace(/\/+$/, '');
const user = process.env.ADMIN_USER;
const pass = process.env.ADMIN_PASS;
if (!BASE || !user || !pass) {
  console.error('Set ADMINTOOL_URL (for example https://host), ADMIN_USER and ADMIN_PASS');
  process.exit(1);
}

const outDir = fileURLToPath(new URL('./', import.meta.url));

const csvCell = (value) =>
  /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
// UTF-8 BOM so Excel opens Thai text correctly; CRLF line endings.
const toCsv = (rows) => `\uFEFF${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;

const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: user, password: pass }),
});
if (!login.ok) {
  console.error(`Login failed (HTTP ${login.status})`);
  process.exit(1);
}
const cookie = login.headers
  .getSetCookie()
  .map((c) => c.split(';')[0])
  .join('; ');

let servers;
try {
  const res = await fetch(`${BASE}/api/servers`, {
    headers: { cookie, accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`GET /api/servers failed (HTTP ${res.status})`);
  servers = await res.json();
  if (!Array.isArray(servers)) throw new Error('Unexpected response: expected an array');
} finally {
  // Close the session this script opened.
  await fetch(`${BASE}/api/auth/logout`, { method: 'POST', headers: { cookie } }).catch(
    () => undefined,
  );
}

const rows = servers
  .map((s) => ({
    name: String(s.server_name ?? '').trim(),
    ip: String(s.ip_address ?? '').trim(),
    enabled: s.enabled === true,
  }))
  .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase(), 'en'));

// Data-quality report (rows are exported as-is; nothing is dropped or de-duplicated).
const NAME_OK = /^[a-z0-9][a-z0-9._-]*$/i;
const problems = rows.filter((r) => !NAME_OK.test(r.name) || !isIPv4(r.ip));
const count = (key) => {
  const seen = new Map();
  for (const r of rows) seen.set(r[key], (seen.get(r[key]) ?? 0) + 1);
  return seen;
};
const dupNames = [...count('name')].filter(([, n]) => n > 1);
const ips = count('ip');

const enabled = rows.filter((r) => r.enabled);
writeFileSync(
  `${outDir}servers.csv`,
  toCsv([['name', 'ip'], ...enabled.map((r) => [r.name, r.ip])]),
  'utf8',
);
writeFileSync(
  `${outDir}servers-all.csv`,
  toCsv([['name', 'ip', 'enabled'], ...rows.map((r) => [r.name, r.ip, String(r.enabled)])]),
  'utf8',
);

console.log(`servers from API : ${rows.length}`);
console.log(`enabled          : ${enabled.length}  -> servers.csv`);
console.log(`disabled         : ${rows.length - enabled.length}`);
console.log(`all              : ${rows.length}  -> servers-all.csv`);
console.log(`unique IPs       : ${ips.size} (of ${rows.length} rows; shared IPs are multi-tenant hosts)`);
console.log(`duplicate names  : ${dupNames.length}`);
console.log(`invalid rows     : ${problems.length}`);
for (const p of problems) console.log('  invalid:', JSON.stringify(p));
console.log(`written to       : ${outDir}`);
