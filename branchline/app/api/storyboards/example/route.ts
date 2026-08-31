import { NextResponse } from 'next/server';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { ensurePersonalWorkspace } from '@/db/ensure';
import { createExampleStoryboard } from '@/lib/example-storyboard';

export async function POST() {
  const user = await getChatGPTUser();
  if (!user) {
    return NextResponse.json(
      { error: 'Sign in to create a storyboard.' },
      { status: 401 },
    );
  }
  const workspaceId = await ensurePersonalWorkspace(
    user.userId,
    user.displayName,
  );
  const id = await createExampleStoryboard({
    workspaceId,
    userId: user.userId,
  });
  return NextResponse.json({ id }, { status: 201 });
}
