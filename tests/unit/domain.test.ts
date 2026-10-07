import { describe, it, expect } from 'vitest';
import {
  hasPermission,
  initialEvidenceStatus,
  mandatoryEligibility,
} from '@vetready/domain';
import { candidateProfileSchema, evidenceSchema } from '@vetready/contracts';
import { readConfig } from '../../apps/api/dist/config';
import {
  newFlow,
  encryptCookie,
  decryptCookie,
  webConfig,
} from '../../apps/web/lib/oidc';
describe('scoped RBAC', () => {
  it('does not turn employer scope into platform or other organization permission', () => {
    const grants = [{ permission: 'employer:own', organizationId: 'org-a' }];
    expect(hasPermission(grants, 'employer:own', 'org-a')).toBe(true);
    expect(hasPermission(grants, 'employer:own', 'org-b')).toBe(false);
    expect(hasPermission(grants, 'employer:own')).toBe(false);
    expect(hasPermission(grants, 'roles:grant')).toBe(false);
  });
  it('does not grant an organization operation from a platform assignment', () =>
    expect(
      hasPermission(
        [{ permission: 'employer:own', organizationId: null }],
        'employer:own',
        'org-a',
      ),
    ).toBe(false));
});
describe('evidence and eligibility safeguards', () => {
  it.each([
    'SELF_DECLARED',
    'DOCUMENT',
    'KNOWLEDGE',
    'CASE',
    'PRACTICAL',
    'EMPLOYMENT',
    'INTERNSHIP',
    'MENTOR',
    'EMPLOYER_FEEDBACK',
  ] as const)('submission of %s is never verification', (source) =>
    expect(initialEvidenceStatus(source)).toBe('SUBMITTED'),
  );
  it('mandatory fail defeats unrelated strengths', () =>
    expect(mandatoryEligibility(['PASS', 'FAIL', 'PASS'])).toBe('INELIGIBLE'));
  it('unknown is review, not eligibility', () =>
    expect(mandatoryEligibility(['PASS', 'UNKNOWN'])).toBe('NEEDS_REVIEW'));
  it('all known gates pass', () =>
    expect(mandatoryEligibility(['PASS', 'PASS'])).toBe('ELIGIBLE'));
  it('rejects candidate privacy/role mass assignment', () =>
    expect(
      candidateProfileSchema.safeParse({
        fullName: 'Test User',
        state: 'Kano',
        willingToRelocate: true,
        drivingAbility: false,
        discoverable: true,
        role: 'SUPER_ADMIN',
      }).success,
    ).toBe(false));
  it('rejects purported verified status in evidence request', () =>
    expect(
      evidenceSchema.safeParse({
        competencyVersionId: crypto.randomUUID(),
        source: 'PRACTICAL',
        summary: 'Observed practical task',
        reviewStatus: 'VERIFIED',
      }).success,
    ).toBe(false));
});
describe('auth configuration and cookies', () => {
  it('rejects oversized encrypted sessions rather than silently truncating', async () => {
    await expect(
      encryptCookie(
        { accessToken: 'x'.repeat(4000) },
        'a'.repeat(64),
        'session',
        60,
      ),
    ).rejects.toThrow('capacity');
  });

  it('fails closed on incomplete identity config', () =>
    expect(() => readConfig({ DATABASE_URL: 'configured' })).toThrow(
      'Missing/invalid',
    ));
  it('requires HTTPS in production', () =>
    expect(() =>
      readConfig({
        DATABASE_URL: 'configured',
        OIDC_ISSUER: 'http://127.0.0.1',
        OIDC_JWKS_URI: 'http://127.0.0.1/jwks',
        OIDC_AUDIENCE: 'api',
        NODE_ENV: 'production',
      }),
    ).toThrow('HTTPS'));
  it('does not allow remote HTTP even in development', () =>
    expect(() =>
      readConfig({
        DATABASE_URL: 'configured',
        OIDC_ISSUER: 'http://unsafe.example',
        OIDC_JWKS_URI: 'http://unsafe.example/jwks',
        OIDC_AUDIENCE: 'api',
      }),
    ).toThrow());
  it('does not disclose bad values in configuration errors', () => {
    expect(() =>
      readConfig({ DATABASE_URL: 'sensitive', OIDC_ISSUER: 'sensitive' }),
    ).toThrow(/fields:/);
    expect(() => webConfig({ OIDC_CLIENT_SECRET: 'sensitive' })).toThrow(
      'incomplete',
    );
  });
  it('generates independent unpredictable PKCE flows', () => {
    const a = newFlow(),
      b = newFlow();
    expect(a.state).not.toBe(b.state);
    expect(a.nonce).not.toBe(a.verifier);
    expect(a.challenge).not.toBe(a.verifier);
  });
  it('encrypts cookies, isolates purposes and detects tampering', async () => {
    const secret = 'a'.repeat(64);
    const encrypted = await encryptCookie(
      { accessToken: 'sensitive-token' },
      secret,
      'session',
      60,
    );
    expect(encrypted).not.toContain('sensitive-token');
    expect(
      (await decryptCookie(encrypted, secret, 'session')).accessToken,
    ).toBe('sensitive-token');
    await expect(decryptCookie(encrypted, secret, 'flow')).rejects.toThrow();
    await expect(
      decryptCookie(encrypted.slice(0, -5) + 'abcde', secret, 'session'),
    ).rejects.toThrow();
  });
  it('rejects expired session', async () => {
    const secret = 'b'.repeat(64);
    const cookie = await encryptCookie({}, secret, 'session', -1);
    await expect(decryptCookie(cookie, secret, 'session')).rejects.toThrow();
  });
});
