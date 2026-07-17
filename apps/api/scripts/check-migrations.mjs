import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const drizzleDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../drizzle');
const metadataDirectory = resolve(drizzleDirectory, 'meta');
const journalPath = resolve(metadataDirectory, '_journal.json');

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

const journal = JSON.parse(await readFile(journalPath, 'utf8'));
invariant(journal.dialect === 'postgresql', 'Migration journal must use the PostgreSQL dialect');
invariant(Array.isArray(journal.entries) && journal.entries.length > 0, 'Migration journal is empty');

const drizzleFiles = await readdir(drizzleDirectory);
const metadataFiles = await readdir(metadataDirectory);
const sqlFiles = drizzleFiles.filter((file) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(file)).sort();
const snapshotFiles = metadataFiles.filter((file) => /^\d{4}_snapshot\.json$/u.test(file)).sort();
const expectedSqlFiles = [];
const expectedSnapshotFiles = [];
const snapshotIds = new Set();
let previousTimestamp = -1;
let previousSnapshotId;

for (const [position, entry] of journal.entries.entries()) {
  const prefix = String(position).padStart(4, '0');
  invariant(entry.idx === position, `Migration index ${entry.idx} must be ${position}`);
  invariant(entry.version === journal.version, `Migration ${entry.tag} has an unexpected journal version`);
  invariant(typeof entry.when === 'number' && entry.when > previousTimestamp, `Migration ${entry.tag} timestamp is not monotonic`);
  invariant(new RegExp(`^${prefix}_[a-z0-9_]+$`, 'u').test(entry.tag), `Migration tag ${entry.tag} does not match its index`);

  const sqlFile = `${entry.tag}.sql`;
  const snapshotFile = `${prefix}_snapshot.json`;
  const sql = await readFile(resolve(drizzleDirectory, sqlFile), 'utf8');
  const snapshot = JSON.parse(await readFile(resolve(metadataDirectory, snapshotFile), 'utf8'));
  const containsDestructiveOperation = /\b(?:DROP\s+TABLE|DROP\s+COLUMN|TRUNCATE\s+TABLE|ALTER\s+COLUMN\b[^;]*\bTYPE)\b/iu.test(sql);
  const explicitContractMigration = entry.tag.endsWith('_contract') && sql.startsWith('-- vatrushka: destructive-contract');

  invariant(sql.trim().length > 0, `Migration ${sqlFile} is empty`);
  invariant(!containsDestructiveOperation || explicitContractMigration, `Migration ${sqlFile} contains a destructive schema operation; use an explicit expand/migrate/contract rollout and mark the final *_contract migration`);
  invariant(snapshot.dialect === journal.dialect, `Snapshot ${snapshotFile} has an unexpected dialect`);
  invariant(typeof snapshot.id === 'string' && !snapshotIds.has(snapshot.id), `Snapshot ${snapshotFile} has a missing or duplicate id`);
  invariant(position === 0 ? snapshot.prevId === '00000000-0000-0000-0000-000000000000' : snapshot.prevId === previousSnapshotId, `Snapshot ${snapshotFile} does not continue the previous snapshot`);

  expectedSqlFiles.push(sqlFile);
  expectedSnapshotFiles.push(snapshotFile);
  snapshotIds.add(snapshot.id);
  previousSnapshotId = snapshot.id;
  previousTimestamp = entry.when;
}

invariant(JSON.stringify(sqlFiles) === JSON.stringify(expectedSqlFiles), `SQL files do not match the journal: expected ${expectedSqlFiles.join(', ')}, received ${sqlFiles.join(', ')}`);
invariant(JSON.stringify(snapshotFiles) === JSON.stringify(expectedSnapshotFiles), `Snapshots do not match the journal: expected ${expectedSnapshotFiles.join(', ')}, received ${snapshotFiles.join(', ')}`);

console.log(`Verified ${journal.entries.length} PostgreSQL migrations and their snapshot chain.`);
