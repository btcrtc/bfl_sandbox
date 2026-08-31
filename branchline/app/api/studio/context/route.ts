import { NextResponse } from 'next/server';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import {
  resolveStudioContext,
  studioSelectionCookies,
  toStudioIdentity,
} from '@/db/studio';

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) {
    return NextResponse.json(
      { error: 'Sign in to open a workspace.' },
      { status: 401 },
    );
  }
  const context = await resolveStudioContext(toStudioIdentity(user));
  const response = NextResponse.json({ context });
  for (const cookie of studioSelectionCookies(context)) {
    response.headers.append('Set-Cookie', cookie);
  }
  return response;
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) {
    return NextResponse.json(
      { error: 'Sign in to switch projects.' },
      { status: 401 },
    );
  }
  const body = (await request.json().catch(() => null)) as {
    workspaceId?: unknown;
    projectId?: unknown;
  } | null;
  if (
    typeof body?.workspaceId !== 'string' ||
    typeof body.projectId !== 'string'
  ) {
    return NextResponse.json(
      { error: 'Workspace and project are required.' },
      { status: 400 },
    );
  }
  const context = await resolveStudioContext(toStudioIdentity(user), {
    workspaceId: body.workspaceId,
    projectId: body.projectId,
  });
  if (
    context.activeWorkspace.id !== body.workspaceId ||
    context.activeProject.id !== body.projectId
  ) {
    return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
  }
  const response = NextResponse.json({ context });
  for (const cookie of studioSelectionCookies(context)) {
    response.headers.append('Set-Cookie', cookie);
  }
  return response;
}
