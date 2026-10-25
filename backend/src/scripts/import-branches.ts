/**
 * Replaces the branch IP list behind the "เลือกจากรายการ" picker (csms2.branches)
 * with the rows of a CSV / JSON file, for example the AtizDevTool export:
 *
 *   npm run import:branches -- ../export/servers.csv
 *
 * The file is parsed exactly like the "↻ โหลดรายการใหม่" button does (see
 * branches/ip-list.parser.ts): a CSV with `name,ip` (or `label,ip`) headers, or JSON shaped
 * like { "list": [{ "ip": "...", "label": "..." }] }. Rows without a valid IPv4 are skipped.
 *
 * Like BranchesService.refresh(), the new rows are inserted first and the old ones are
 * removed afterwards, so the picker is never empty. A file with no valid rows changes nothing.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { MongoClient } from 'mongodb';
import { parseIpList } from '../branches/ip-list.parser.js';

if (existsSync('.env')) process.loadEnvFile('.env');

const APP_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/csms2';
const META_KEY = 'ip_list';

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: npm run import:branches -- <path to .csv or .json file>');
    process.exit(1);
  }
  if (!existsSync(file)) {
    console.error(`File not found: ${file}`);
    process.exit(1);
  }

  const entries = parseIpList(readFileSync(file, 'utf8'));
  if (entries.length === 0) {
    console.error(`No valid IPv4 rows in ${file}; the current list was left unchanged.`);
    process.exit(1);
  }

  const client = new MongoClient(APP_URI, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  try {
    const db = client.db();
    const branches = db.collection('branches');
    const syncId = randomUUID();
    const now = new Date();

    try {
      await branches.insertMany(
        entries.map((e, i) => ({
          ip: e.ip,
          label: e.label,
          sort: i,
          syncId,
          createdAt: now,
          updatedAt: now,
        })),
      );
    } catch (err) {
      await branches.deleteMany({ syncId }); // undo a partial insert; the old list is untouched
      throw err;
    }
    const removed = await branches.deleteMany({ syncId: { $ne: syncId } });
    await db.collection('app_meta').updateOne(
      { key: META_KEY },
      {
        $set: { value: { updatedAt: now.toISOString(), count: entries.length }, updatedAt: now },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );

    const uniqueIps = new Set(entries.map((e) => e.ip)).size;
    console.log(`Imported ${entries.length} branches into ${db.databaseName}.branches from ${file}`);
    console.log(`  unique IPs            : ${uniqueIps} (shared IPs are kept, as in the original list)`);
    console.log(`  previous rows removed : ${removed.deletedCount}`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
