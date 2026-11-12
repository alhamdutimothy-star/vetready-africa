import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { dairyVerificationConfigurationSchema } from '@vetready/contracts';
import { validateDairyVerificationConfiguration } from '@vetready/domain';

const notice =
  'Draft review only. No professional approval, publication, Field Ready or Job Ready status, employer eligibility or disclosure authority.';
const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const ref = ({ id, version }: { id: string; version: number }) => ({
  id,
  version,
});

export function reviewDairyVerificationDraft(source: string) {
  let input: unknown;
  try {
    input = JSON.parse(source);
  } catch {
    return { status: 'MALFORMED_JSON', notice };
  }
  const { status, errors, unresolved } =
    validateDairyVerificationConfiguration(input);
  const report = {
    status,
    notice,
    // Validator messages can contain input values.
    invalidPaths: [...new Set(errors.map(({ path }) => path))].sort(),
    unresolved,
  };
  if (status === 'INVALID') return report;

  const draft = dairyVerificationConfigurationSchema.parse(input);
  const externalReferences: { path: string; sha256: string }[] = [];
  function collect(value: unknown, path: string) {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      const next = path ? `${path}.${key}` : key;
      if (key === 'decisionRef' && typeof child === 'string') {
        externalReferences.push({ path: next, sha256: digest(child) });
      } else {
        collect(child, next);
      }
    }
  }
  collect(draft, '');

  return {
    ...report,
    inputSha256: digest(source),
    configuration: {
      ...ref(draft),
      predecessor: draft.predecessor,
      architectureVersion: draft.architectureVersion,
      frameworkVersion: draft.frameworkVersion,
    },
    referenceStatus: 'REQUIRES VERIFICATION',
    externalReferences,
    policies: draft.policies.map((policy) => ({
      ...ref(policy),
      calibration:
        typeof policy.calibration === 'string'
          ? policy.calibration
          : policy.calibration.value,
    })),
    calibrationVersions: draft.calibrationVersions.map(ref),
    gates: draft.gates.map((gate) => ({
      id: gate.id,
      defaultScope: gate.defaultScope,
      scopes: gate.scopes.map((scope) => ({
        ...ref(scope),
        kind: scope.kind,
        parent: scope.parent,
        components: scope.components,
        mapping:
          typeof scope.mapping === 'string'
            ? scope.mapping
            : scope.mapping.value,
        rubric: {
          ...ref(scope.rubric),
          scope: scope.rubric.scope,
          policy: scope.rubric.policy,
          criteria:
            typeof scope.rubric.criteria === 'string'
              ? scope.rubric.criteria
              : scope.rubric.criteria.value.map(ref),
        },
      })),
    })),
  };
}

export function runDairyVerificationReview(args: string[]) {
  const [path] = args;
  if (
    args.length !== 1 ||
    !path ||
    path.startsWith('-') ||
    /^[a-z][a-z\d+.-]*:\/\//i.test(path) ||
    /^[\\/]{2}/.test(path)
  ) {
    return { exitCode: 2, report: { status: 'LOCAL_FILE_REQUIRED', notice } };
  }
  let source: string;
  try {
    const localPath = realpathSync(path);
    if (/^[\\/]{2}/.test(localPath) || !statSync(localPath).isFile()) {
      throw new Error('Expected a local regular file');
    }
    source = readFileSync(localPath, 'utf8');
  } catch {
    return { exitCode: 2, report: { status: 'UNREADABLE_LOCAL_FILE', notice } };
  }
  const report = reviewDairyVerificationDraft(source);
  return {
    exitCode:
      report.status === 'INVALID' || report.status === 'MALFORMED_JSON' ? 1 : 0,
    report,
  };
}

if (require.main === module) {
  const { exitCode, report } = runDairyVerificationReview(
    process.argv.slice(2),
  );
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = exitCode;
}
