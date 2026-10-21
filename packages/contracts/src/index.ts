import { z } from 'zod';
export const candidateProfileSchema = z
  .object({
    fullName: z.string().trim().min(2).max(160),
    countryCode: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .default('NG'),
    state: z.string().trim().min(2).max(100),
    willingToRelocate: z.boolean(),
    drivingAbility: z.boolean(),
    professionalSummary: z.string().trim().max(2000).default(''),
  })
  .strict();
export const employerSchema = z
  .object({
    displayName: z.string().trim().min(2).max(160),
    sector: z.string().trim().min(2).max(100),
    countryCode: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .default('NG'),
  })
  .strict();
export const evidenceSchema = z
  .object({
    competencyVersionId: z.uuid(),
    source: z.enum([
      'SELF_DECLARED',
      'DOCUMENT',
      'KNOWLEDGE',
      'CASE',
      'PRACTICAL',
      'EMPLOYMENT',
      'INTERNSHIP',
      'MENTOR',
      'EMPLOYER_FEEDBACK',
    ]),
    summary: z.string().trim().min(10).max(2000),
    observedAt: z.iso.datetime().optional(),
  })
  .strict();
export const roleAssignmentSchema = z
  .object({
    userId: z.uuid(),
    roleCode: z.string().regex(/^[A-Z_]+$/),
    organizationId: z.uuid().optional(),
    reason: z.string().trim().min(10).max(500),
  })
  .strict();
export type CandidateProfileInput = z.infer<typeof candidateProfileSchema>;
export type EmployerInput = z.infer<typeof employerSchema>;
export type EvidenceInput = z.infer<typeof evidenceSchema>;
export type RoleAssignmentInput = z.infer<typeof roleAssignmentSchema>;

export * from './assessment';
export * from './evidence';
export * from './training';

export * from './cases';
