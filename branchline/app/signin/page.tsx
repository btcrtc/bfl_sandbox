import { redirect } from 'next/navigation';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { SignInCard } from '@/components/signin-card';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ return_to?: string }>;
}) {
  const params = await searchParams;
  const returnTo =
    typeof params.return_to === 'string' && params.return_to.startsWith('/')
      ? params.return_to
      : '/playground';
  if (await getChatGPTUser()) redirect(returnTo);
  return <SignInCard returnTo={returnTo} />;
}
