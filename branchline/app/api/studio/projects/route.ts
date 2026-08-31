import { NextResponse } from 'next/server';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import {
  createStudioProject,
  StudioAccessError,
  studioSelectionCookies,
  toStudioIdentity,
} from '@/db/studio';

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) {
    return NextResponse.json(
      { error: 'Sign in to create a project.' },
      { status: 401 },
    );
  }
  const body = (await request.json().catch(() => null)) as {
    workspaceId?: unknown;
    name?: unknown;
  } | null;
  if (typeof body?.workspaceId !== 'string' || typeof body.name !== 'string') {
    return NextResponse.json(
      { error: 'Workspace and project name are required.' },
      { status: 400 },
    );
  }
  try {
    const context = await createStudioProject(
      toStudioIdentity(user),
      body.workspaceId,
      body.name,
    );
    const response = NextResponse.json({ context }, { status: 201 });
    for (const cookie of studioSelectionCookies(context)) {
      response.headers.append('Set-Cookie', cookie);
    }
    return response;
  } catch (error) {
    const status = error instanceof StudioAccessError ? error.status : 500;
    const message =
      error instanceof Error ? error.message : 'Could not create the project.';
    return NextResponse.json({ error: message }, { status });
  }
}
