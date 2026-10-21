import Link from 'next/link';
import { z } from 'zod';
import { api } from '../../../../lib/session';
export const dynamic = 'force-dynamic';
export default async function Blueprint({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  const selected = z.uuid().safeParse(id);
  const me = await api('/me');
  const grants = me?.ok
    ? z
        .object({
          permissions: z.array(
            z.object({
              permission: z.string(),
              organizationId: z.string().nullable(),
            }),
          ),
        })
        .parse(await me.json()).permissions
    : [];
  if (
    !selected.success ||
    !grants.some(
      (g) => g.permission === 'assessment:author' && g.organizationId === null,
    )
  )
    return <p>Platform author access is required.</p>;
  const r = await api(`/case-blueprints/${selected.data}`);
  if (!r?.ok) return <p>Blueprint unavailable.</p>;
  const d = z
    .object({
      title: z.string(),
      version: z.number(),
      scenario: z.string(),
      professional_status: z.string(),
      validation_notice: z.string(),
      steps: z.array(
        z.object({
          code: z.string(),
          title: z.string(),
          prompt: z.string(),
          childVersionId: z.uuid(),
          rubric: z.array(
            z.object({
              id: z.uuid(),
              description: z.string(),
              dimensions: z.array(z.string()),
            }),
          ),
        }),
      ),
    })
    .parse(await r.json());
  const privateResponse = await api('/admin/dairy-pilot');
  const configuration = privateResponse?.ok
    ? z
        .object({
          id: z.uuid(),
          privateGuidance: z.array(
            z.object({
              rubric_criterion_id: z.uuid(),
              assessor_guidance: z.string(),
            }),
          ),
        })
        .nullable()
        .parse(await privateResponse.json())
    : null;
  return (
    <>
      <Link href="/dairy/review">Back to dairy staff workspace</Link>
      <h1>
        {d.title} · v{d.version}
      </h1>
      <p className="notice">
        {d.validation_notice} · {d.professional_status}
      </p>
      <p>{d.scenario}</p>
      {d.steps.map((s) => (
        <section key={s.code}>
          <h2>{s.title}</h2>
          <p>{s.prompt}</p>
          <p>Proposed child version: {s.childVersionId}</p>
          <ul>
            {s.rubric.map((c) => (
              <li key={c.id}>
                {c.description} · {c.dimensions.join(', ')}
                {configuration?.id === selected.data && (
                  <p>
                    {
                      configuration.privateGuidance.find(
                        (g) => g.rubric_criterion_id === c.id,
                      )?.assessor_guidance
                    }
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
