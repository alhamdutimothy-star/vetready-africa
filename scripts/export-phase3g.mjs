import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

// Export only reviewed repository changes. Never stage files or write Git history.
const baseline = '87f214e44a621ba06958a6ab11d05dfc4cf6e3bc';
const checkpoint = 'phase-3f-practical-verification';
const root = process.cwd();
const destination = process.argv[2];
if (!destination || !isAbsolute(destination))
  throw Error('Absolute export directory required');
const git = (...args) =>
  execFileSync('git', ['-c', 'core.safecrlf=false', ...args], {
    cwd: root,
    maxBuffer: 32 * 1024 * 1024,
  });
if (git('rev-parse', 'HEAD').toString().trim() !== baseline)
  throw Error('Expected authoritative baseline HEAD');
if (
  git('rev-parse', checkpoint + '^{}')
    .toString()
    .trim() !== baseline
)
  throw Error('Protected Phase 3F checkpoint differs');
git(
  'merge-base',
  '--is-ancestor',
  'working-authentication-2026-10-20',
  baseline,
);
if (
  git('branch', '--show-current').toString().trim() !==
  'feat/phase-3-training-verification'
)
  throw Error('Expected feature branch');
if (git('diff', '--cached', '--name-only').length)
  throw Error('Index must remain empty');
const names = (output) => output.toString().split('\0').filter(Boolean);
const tracked = names(git('diff', '--name-only', '-z', baseline));
const untracked = names(
  git('ls-files', '--others', '--exclude-standard', '-z'),
);
const files = [...new Set([...tracked, ...untracked])].sort();
if (!files.length) throw Error('No Phase 3G files');
for (const file of files) {
  if (
    !/^[a-zA-Z0-9_./[\]-]+$/.test(file) ||
    file.split('/').includes('..') ||
    /(^|\/)(\.env[^/]*|\.local[^/]*|credentials|secrets)(\/|$)/i.test(file) ||
    /(^|\/)(auth|oidc|session|csrf)(\/|[^/]*\.(ts|tsx)$)/i.test(file) ||
    /^apps\/web\/next\.config\./i.test(file) ||
    /^db\/migrations\/0(0[1-9]|1[0-4])_/.test(file)
  )
    throw Error('Protected or unsupported export path: ' + file);
  if (!/\.(ts|tsx|sql|md|json|mjs)$/.test(file))
    throw Error('Unexpected export file type: ' + file);
  // Reject plausible literal credentials without printing any matched content.
  const content = readFileSync(join(root, file), 'utf8');
  if (
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:postgres(?:ql)?:\/\/)[^\s:'"/]+:[^\s@]+@|(?:SESSION_SECRET|AUTH0_CLIENT_SECRET|OIDC_CLIENT_SECRET)\s*[:=]\s*['"][A-Za-z0-9_+/=-]{16,}['"]/.test(
      content,
    )
  )
    throw Error('Potential literal secret in ' + file);
}
let patch = git('diff', '--binary', '--full-index', baseline, '--');
for (const file of untracked.sort()) {
  const result = spawnSync(
    'git',
    [
      '-c',
      'core.safecrlf=false',
      'diff',
      '--no-index',
      '--binary',
      '--full-index',
      '--',
      '/dev/null',
      file,
    ],
    { cwd: root, maxBuffer: 32 * 1024 * 1024 },
  );
  if (result.status !== 1) throw Error('New-file export failed: ' + file);
  patch = Buffer.concat([patch, result.stdout]);
}
const output = resolve(destination);
mkdirSync(output, { recursive: true });
const patchPath = join(output, 'vetready-phase3g-competency-profile.patch');
writeFileSync(patchPath, patch);
const verification = mkdtempSync(join(output, 'phase3g-verify-'));
for (const file of tracked) {
  const before = git('show', `${baseline}:${file}`);
  mkdirSync(dirname(join(verification, file)), { recursive: true });
  writeFileSync(join(verification, file), before);
}
const apply = (args) =>
  execFileSync('git', ['apply', ...args, patchPath], {
    cwd: verification,
    maxBuffer: 32 * 1024 * 1024,
  });
apply(['--check']);
// Apply only to isolated copies of changed baseline files, never the live repository.
apply([]);
const normalize = (bytes) => bytes.toString('utf8').replaceAll('\r\n', '\n');
const inventory = files.map((file) => {
  const bytes = readFileSync(join(root, file));
  if (normalize(bytes) !== normalize(readFileSync(join(verification, file))))
    throw Error('Export differs from working tree: ' + file);
  return {
    path: file,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
});
const manifest = {
  baseline,
  checkpoint,
  branch: 'feat/phase-3-training-verification',
  patchSha256: createHash('sha256').update(patch).digest('hex'),
  fileCount: inventory.length,
  verifiedAgainstWorkingTree: true,
  comparison: 'Git text content, with CRLF normalized to LF',
  verificationDirectory: verification,
  files: inventory,
};
writeFileSync(
  join(output, 'vetready-phase3g-competency-profile.manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n',
);
if (git('diff', '--cached', '--name-only').length)
  throw Error('Live index changed unexpectedly');
console.log(
  JSON.stringify({
    patch: patchPath,
    fileCount: inventory.length,
    patchSha256: manifest.patchSha256,
    verifiedAgainstWorkingTree: true,
  }),
);
