import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { dairyJourney } from '../../apps/web/lib/dairy-journey';
import { pilotDashboardSchema } from '../../apps/web/lib/dairy-pilot';
import { competencyProfileResponseSchema } from '../../apps/web/lib/competency-profile';
const pathway = randomUUID(),
  child = randomUUID();
const dairy = pilotDashboardSchema.parse({
  pathway: {
    id: randomUUID(),
    version_id: pathway,
    name: 'Commercial Dairy Practice',
  },
  profileRequired: false,
  selected: true,
  notice: 'Synthetic demo',
  pilot: null,
  attempts: [],
  learning: { enrollments: 1, completed_lessons: 9 },
  evidence: [],
  competencies: [],
  practicalVerification: 'UNCONFIGURED',
  readiness: null,
});
// Minimal synthetic read-model fields exercised by navigation; production responses are schema-validated.
function profile(
  verified = false,
): z.infer<typeof competencyProfileResponseSchema> {
  return {
    sources: [],
    competencies: [
      {
        id: child,
        code: 'SYNTHETIC',
        pathwayVersionIds: [pathway],
        facets: [],
        gaps: [
          {
            pathwayVersionId: pathway,
            reasons: ['EXPERT_REQUIREMENTS_NOT_CONFIGURED'],
          },
        ],
      },
    ],
    governedVerification: [
      {
        caseId: randomUUID(),
        childVersionId: child,
        pathwayVersionId: pathway,
        verified,
        outcome: 'VERIFIED',
      },
    ],
  } as unknown as z.infer<typeof competencyProfileResponseSchema>;
}
it('does not turn completed lessons, claims or historical VERIFIED outcomes into effective verification', () => {
  const j = dairyJourney(dairy, profile(), []);
  expect(j.available && j.effectiveCount).toBe(0);
  expect(j.next.href).toContain('/development?pathway=');
  expect('readiness' in j).toBe(false);
});
it('uses only current effective governed claims and counts each competency once', () => {
  const p = profile(true);
  p.governedVerification!.push({
    ...p.governedVerification![0]!,
    caseId: randomUUID(),
  });
  const j = dairyJourney(dairy, p, []);
  expect(j.available && j.effectiveCount).toBe(1);
});
it('excludes other pathways and unrelated child claims', () => {
  const p = profile(true);
  p.governedVerification![0]!.pathwayVersionId = randomUUID();
  p.governedVerification!.push({
    ...p.governedVerification![0]!,
    pathwayVersionId: pathway,
    childVersionId: randomUUID(),
  });
  const j = dairyJourney(dairy, p, []);
  expect(j.available && j.effectiveCount).toBe(0);
});
it('requires a saved private profile before any journey status', () => {
  expect(dairyJourney({ ...dairy, profileRequired: true }, null, [])).toEqual({
    available: false,
    next: { href: '/dashboard', label: 'Save your private candidate profile' },
  });
});
it('fails unavailable rather than inferring zero evidence from an absent profile', () => {
  expect(() => dairyJourney(dairy, null, [])).toThrow(
    'Current competency profile required',
  );
});
it('keeps unselected interest distinct from assessment completion', () => {
  expect(
    dairyJourney({ ...dairy, selected: false }, profile(), []).next.href,
  ).toBe('/dairy');
});
it('resumes a saved dairy attempt without counting another pathway', () => {
  const other = {
    id: randomUUID(),
    title: 'Other',
    status: 'IN_PROGRESS',
    demo: true,
    pathway: 'Other pathway',
  };
  const j = dairyJourney(dairy, profile(), [other]);
  expect(j.available && j.history).toEqual([]);
  const own = { ...other, pathway: dairy.pathway.name };
  expect(dairyJourney(dairy, profile(), [own]).next.label).toContain('Resume');
});
it('offers governed learning after assessment without assigning a professional outcome', () => {
  const j = dairyJourney(dairy, profile(), [
    {
      id: randomUUID(),
      title: 'Synthetic',
      status: 'SUBMITTED',
      demo: true,
      pathway: dairy.pathway.name,
    },
  ]);
  expect(j.next.href).toBe('/development/next-steps');
  expect(j.available && j.effectiveCount).toBe(0);
});

function submittedProfile(effective: boolean) {
  const p = profile(effective);
  const evidenceId = randomUUID();
  p.governedVerification![0]!.evidenceId = evidenceId;
  p.governedVerification![0]!.facet = 'PRACTICALLY_VERIFIED';
  p.competencies[0]!.facets = [
    {
      facet: 'PRACTICALLY_VERIFIED',
      state: 'PENDING_REVIEW',
      sourceKeys: ['evidence:' + evidenceId],
      effectiveSourceKeys: ['evidence:' + evidenceId],
      selectedSourceKey: 'evidence:' + evidenceId,
    },
  ];
  p.sources = [
    {
      id: evidenceId,
      key: 'evidence:' + evidenceId,
      kind: 'EXTERNAL_SUBMISSION',
      pathwayVersionIds: [pathway],
      disposition: 'PENDING_REVIEW',
      reviewPending: true,
      lifecycle: 'SUBMITTED',
      status: 'UNVERIFIED',
      demo: false,
    },
  ] as typeof p.sources;
  return p;
}
it('keeps submitted evidence pending without effective governed verification', () => {
  const p = submittedProfile(false);
  p.governedVerification![0]!.outcome = null;
  const j = dairyJourney(dairy, p, []);
  expect(j.available).toBe(true);
  if (!j.available) throw Error('Unavailable');
  expect(j.effectiveCount).toBe(0);
  expect(j.pendingEvidence.map((s) => s.id)).toEqual([p.sources[0]!.id]);
  expect(j.evidence[0]!.currentStatus).toBe('PENDING_REVIEW');
  expect(j.competencies[0]!.facets[0]!.currentStatus).toBe('PENDING_REVIEW');
});
it('reproduces and removes the effective-versus-pending contradiction without rewriting the receipt', () => {
  const p = submittedProfile(true);
  const before = structuredClone(p);
  const j = dairyJourney(dairy, p, []);
  if (!j.available) throw Error('Unavailable');
  expect(j.effectiveCount).toBe(1);
  expect(j.pendingEvidence).toEqual([]);
  expect(j.evidence[0]!.currentStatus).toBe('EFFECTIVELY_VERIFIED');
  expect(j.competencies[0]!.facets[0]!.currentStatus).toBe(
    'EFFECTIVELY_VERIFIED',
  );
  expect(
    j.pendingEvidence.some((s) =>
      j.verification.some((v) => v.verified && v.evidenceId === s.id),
    ),
  ).toBe(false);
  expect(p).toEqual(before);
  expect(p.sources[0]!.reviewPending).toBe(true);
  expect(p.sources[0]!.lifecycle).toBe('SUBMITTED');
});
it('keeps multiple pending and effective records disjoint by evidence ID rather than competency ID', () => {
  const p = submittedProfile(true);
  const pendingId = randomUUID();
  p.sources.push({
    ...p.sources[0]!,
    id: pendingId,
    key: 'evidence:' + pendingId,
  });
  const j = dairyJourney(dairy, p, []);
  if (!j.available) throw Error('Unavailable');
  expect(j.effectiveCount).toBe(1);
  expect(j.pendingEvidence.map((s) => s.id)).toEqual([pendingId]);
  expect(j.evidence.map((s) => s.currentStatus)).toEqual([
    'EFFECTIVELY_VERIFIED',
    'PENDING_REVIEW',
  ]);
});
it('does not use a historical VERIFIED outcome or another pathway authority to clear pending evidence', () => {
  const p = submittedProfile(false);
  const j = dairyJourney(dairy, p, []);
  expect(j.available && j.pendingEvidence.length).toBe(1);
  p.governedVerification![0]!.verified = true;
  p.governedVerification![0]!.pathwayVersionId = randomUUID();
  const other = dairyJourney(dairy, p, []);
  expect(other.available && other.effectiveCount).toBe(0);
  expect(other.available && other.pendingEvidence.length).toBe(1);
});
