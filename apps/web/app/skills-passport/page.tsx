import { ProfileView } from '../competencies/profile-view';
export const dynamic = 'force-dynamic';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ pathway?: string; page?: string }>;
}) {
  const p = await searchParams;
  const page = Number(p.page);
  return (
    <ProfileView
      passport
      pathway={p.pathway}
      page={Number.isSafeInteger(page) ? page : 1}
    />
  );
}
