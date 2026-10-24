import { z } from 'zod';
import { PracticalDetail } from '../../detail';
export const dynamic = 'force-dynamic';
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return <p>Evidence unavailable.</p>;
  return (
    <PracticalDetail
      id={id}
      role="review"
      status={(await searchParams).status}
    />
  );
}
