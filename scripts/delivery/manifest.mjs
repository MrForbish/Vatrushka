const SHA256 = /^[a-f0-9]{64}$/iu;
const GIT_SHA = /^[a-f0-9]{40}$/iu;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
const CHANNELS = new Set(['beta', 'rc', 'stable']);
const CANDIDATE_FIELDS = new Set([
  'version',
  'commitSha',
  'sourceArchiveSha256',
  'dependencyLockSha256',
  'channel',
  'apiEnvironment',
  'images',
  'migration',
  'desktop',
]);
const ROLLBACK_FIELDS = new Set([
  'releaseVersion',
  'previousCandidateSha256',
  'commitSha',
  'dependencyLockSha256',
  'images',
]);

function object(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value;
}

function text(value, name, pattern) {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new TypeError(`${name} is invalid`);
  }
  return value;
}

function rejectSensitiveFields(value, path = 'manifest') {
  for (const [key, nested] of Object.entries(object(value, path))) {
    if (/(password|secret|token|private.?key|database.?url|access.?key)/iu.test(key)) {
      throw new TypeError(`${path}.${key} is not allowed in a delivery manifest`);
    }
    if (Array.isArray(nested)) {
      throw new TypeError(`${path}.${key} arrays are not allowed in a delivery manifest`);
    }
    if (nested && typeof nested === 'object') {
      rejectSensitiveFields(nested, `${path}.${key}`);
    }
  }
}

function allowOnly(value, fields, name) {
  for (const key of Object.keys(value)) {
    if (!fields.has(key)) throw new TypeError(`${name}.${key} is not allowed`);
  }
}

export function validateCandidateManifest(value) {
  const manifest = object(value, 'candidate manifest');
  rejectSensitiveFields(manifest);
  allowOnly(manifest, CANDIDATE_FIELDS, 'candidate manifest');
  text(manifest.version, 'version', SEMVER);
  text(manifest.commitSha, 'commitSha', GIT_SHA);
  text(manifest.sourceArchiveSha256, 'sourceArchiveSha256', SHA256);
  text(manifest.dependencyLockSha256, 'dependencyLockSha256', SHA256);
  if (!CHANNELS.has(manifest.channel)) throw new TypeError('channel is invalid');
  if (!['staging', 'production'].includes(manifest.apiEnvironment)) {
    throw new TypeError('apiEnvironment is invalid');
  }
  object(manifest.images, 'images');
  for (const [name, digest] of Object.entries(manifest.images)) {
    if (!/^[a-z][a-z0-9-]*$/u.test(name) || typeof digest !== 'string' || !/^sha256:[a-f0-9]{64}$/iu.test(digest)) {
      throw new TypeError(`images.${name} is invalid`);
    }
  }
  if (manifest.migration !== undefined) {
    const migration = object(manifest.migration, 'migration');
    allowOnly(migration, new Set(['required', 'compatibility']), 'migration');
    if (typeof migration.required !== 'boolean' || !['none', 'backward-compatible', 'manual-review'].includes(migration.compatibility)) {
      throw new TypeError('migration is invalid');
    }
  }
  if (manifest.desktop !== undefined) {
    const desktop = object(manifest.desktop, 'desktop');
    allowOnly(desktop, new Set(['installerSha256', 'blockmapSha256']), 'desktop');
    for (const [name, checksum] of Object.entries(desktop)) text(checksum, `desktop.${name}`, SHA256);
  }
  return Object.freeze({ ...manifest, images: Object.freeze({ ...manifest.images }) });
}

export function validateRollbackManifest(value) {
  const manifest = object(value, 'rollback manifest');
  rejectSensitiveFields(manifest);
  allowOnly(manifest, ROLLBACK_FIELDS, 'rollback manifest');
  text(manifest.releaseVersion, 'releaseVersion', SEMVER);
  text(manifest.previousCandidateSha256, 'previousCandidateSha256', SHA256);
  text(manifest.commitSha, 'commitSha', GIT_SHA);
  text(manifest.dependencyLockSha256, 'dependencyLockSha256', SHA256);
  const images = object(manifest.images, 'images');
  if (Object.keys(images).length === 0) throw new TypeError('images must not be empty');
  for (const [name, digest] of Object.entries(images)) {
    if (!/^[a-z][a-z0-9-]*$/u.test(name) || typeof digest !== 'string' || !/^sha256:[a-f0-9]{64}$/iu.test(digest)) {
      throw new TypeError(`images.${name} is invalid`);
    }
  }
  return Object.freeze({ ...manifest, images: Object.freeze({ ...manifest.images }) });
}
