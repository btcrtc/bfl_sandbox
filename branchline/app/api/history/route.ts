import { NextResponse } from 'next/server';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { ensurePersonalWorkspace } from '@/db/ensure';
import { listHistory } from '@/db/history';

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'Sign in to view shared history.' }, { status: 401 });

  const workspaceId = await ensurePersonalWorkspace(user.userId, user.displayName);
  return NextResponse.json({ workspaceId, runs: await listHistory(workspaceId) });
}
