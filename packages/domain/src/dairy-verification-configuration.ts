import {
  dairyFeedingBaseline,
  dairyReproductiveBaseline,
  dairyVerificationConfigurationSchema,
  dairyVerificationGateIds,
  domainExpertStandardRequired,
} from '@vetready/contracts';

type Ref = { id: string; version: number };
type Issue = { path: string; message: string };
const identity = (ref: Ref) => `${ref.id}@${ref.version}`;

export function validateDairyVerificationConfiguration(input: unknown) {
  const parsed = dairyVerificationConfigurationSchema.safeParse(input);
  const errors: Issue[] = [];
  const unresolved: Issue[] = [];
  const result = () => ({
    status: errors.length
      ? ('INVALID' as const)
      : unresolved.length
        ? ('DRAFT_WITH_UNRESOLVED_STANDARDS' as const)
        : ('STRUCTURALLY_COMPLETE_DRAFT' as const),
    errors,
    unresolved,
  });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push({ path: issue.path.join('.'), message: issue.message });
    }
    return result();
  }

  const draft = parsed.data;
  const error = (path: string, message: string) =>
    errors.push({ path, message });
  const unique = (values: string[], path: string) => {
    if (new Set(values).size !== values.length)
      error(path, 'Duplicate identity');
  };
  const scan = (value: unknown, path: string) => {
    if (value === domainExpertStandardRequired) {
      unresolved.push({ path, message: domainExpertStandardRequired });
    } else if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        scan(child, path ? `${path}.${key}` : key);
      }
    }
  };
  scan(draft, '');
  if (
    draft.predecessor &&
    (draft.predecessor.id !== draft.id ||
      draft.predecessor.version >= draft.version)
  )
    error('predecessor', 'Expected an earlier version of this configuration');

  unique(
    draft.gates.map((gate) => gate.id),
    'gates',
  );
  for (const id of dairyVerificationGateIds) {
    if (!draft.gates.some((gate) => gate.id === id))
      error('gates', `Missing gate ${id}`);
  }
  const scopes = draft.gates.flatMap((gate) => gate.scopes);
  unique(scopes.map(identity), 'gates.scopes');
  unique(
    scopes.map((scope) => identity(scope.rubric)),
    'gates.scopes.rubric',
  );
  unique(draft.policies.map(identity), 'policies');
  unique(draft.calibrationVersions.map(identity), 'calibrationVersions');
  for (const [i, policy] of draft.policies.entries()) {
    if (policy.calibration !== domainExpertStandardRequired) {
      const calibration = identity(policy.calibration.value);
      if (!draft.calibrationVersions.some((v) => identity(v) === calibration)) {
        error(`policies.${i}.calibration`, 'Unknown calibration version');
      }
    }
    if (policy.directObservationRoutes !== domainExpertStandardRequired) {
      unique(
        policy.directObservationRoutes.value,
        `policies.${i}.directObservationRoutes`,
      );
    }
  }

  for (const [i, gate] of draft.gates.entries()) {
    const gatePath = `gates.${i}`;
    const defaults = gate.scopes.filter((scope) => scope.kind === 'DEFAULT');
    const full = defaults[0];
    if (
      defaults.length !== 1 ||
      !full ||
      identity(full) !== identity(gate.defaultScope)
    ) {
      error(
        `${gatePath}.defaultScope`,
        'Expected the exact, unique default scope of this gate',
      );
    }
    if (
      full &&
      gate.id === 'R07' &&
      (full.components.length !== 1 ||
        full.components[0] !== dairyReproductiveBaseline)
    )
      error(
        `${gatePath}.defaultScope`,
        'R07 is bounded to first-line reproductive clinical assessment',
      );
    if (
      full &&
      gate.id === 'R11' &&
      (full.components.length !== dairyFeedingBaseline.length ||
        dairyFeedingBaseline.some((id) => !full.components.includes(id)))
    )
      error(
        `${gatePath}.defaultScope`,
        'R11 must retain exactly its approved architecture components',
      );

    for (const [j, scope] of gate.scopes.entries()) {
      const path = `${gatePath}.scopes.${j}`;
      unique(scope.components, `${path}.components`);
      if (scope.kind === 'DEFAULT' && scope.parent !== null) {
        error(`${path}.parent`, 'A default scope cannot have a parent');
      }
      if (
        scope.kind === 'NARROW' &&
        (!full ||
          !scope.parent ||
          identity(scope.parent) !== identity(full) ||
          scope.id === full.id ||
          scope.components.some((id) => !full.components.includes(id)))
      )
        error(
          `${path}.parent`,
          'A narrower scope must reference its own exact default scope and stay within its components',
        );
      if (scope.mapping !== domainExpertStandardRequired) {
        unique(
          scope.mapping.value.children.map((child) => child.id.toLowerCase()),
          `${path}.mapping.children`,
        );
      }
      if (identity(scope) !== identity(scope.rubric.scope)) {
        error(
          `${path}.rubric.scope`,
          'Rubric must pin the exact assessed scope version',
        );
      }
      const policy = identity(scope.rubric.policy);
      if (!draft.policies.some((value) => identity(value) === policy)) {
        error(`${path}.rubric.policy`, 'Unknown policy version');
      }
      if (scope.rubric.criteria === domainExpertStandardRequired) continue;
      const criteria = scope.rubric.criteria.value;
      unique(
        criteria.map((criterion) => criterion.id),
        `${path}.rubric.criteria`,
      );
      const directComponents = new Set<string>();
      for (const [k, criterion] of criteria.entries()) {
        const criterionPath = `${path}.rubric.criteria.value.${k}`;
        if (!scope.components.includes(criterion.componentId)) {
          error(
            `${criterionPath}.componentId`,
            'Criterion is outside its assessed scope',
          );
        }
        const direct = criterion.evidenceBasis === 'DIRECT_PRACTICAL';
        const mandatory = criterion.applicability === 'MANDATORY';
        if (
          (criterion.applicability === 'INAPPLICABLE') !==
          (criterion.evidenceBasis === 'INAPPLICABLE')
        ) {
          error(
            criterionPath,
            'Inapplicability must agree with the evidence basis',
          );
        }
        if (
          criterion.safetyCritical !== domainExpertStandardRequired &&
          criterion.safetyCritical.value &&
          (!mandatory || !direct)
        ) {
          error(
            criterionPath,
            'A safety-critical criterion must be mandatory and require direct practical evidence',
          );
        }
        if (direct && mandatory) directComponents.add(criterion.componentId);
      }
      for (const id of scope.components) {
        if (!directComponents.has(id)) {
          error(
            `${path}.rubric.criteria`,
            `Component ${id} requires a mandatory direct practical criterion`,
          );
        }
      }
    }
  }
  return result();
}
