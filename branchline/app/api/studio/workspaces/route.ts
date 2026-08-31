import { NextResponse } from 'next/server';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import {
  createStudioWorkspace,
  StudioAccessError,
  studioSelectionCookies,
  toStudioIdentity,
} from '@/db/studio';

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) {
    return NextResponse.json(
      { error: 'Sign in to create a workspace.' },
      { status: 401 },
    );
  }
  const body = (await request.json().catch(() => null)) as {
    name?: unknown;
  } | null;
  if (typeof body?.name !== 'string') {
    return NextResponse.json(
      { error: 'Workspace name is required.' },
      { status: 400 },
    );
  }
  try {
    const context = await createStudioWorkspace(
      toStudioIdentity(user),
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
      error instanceof Error
        ? error.message
        : 'Could not create the workspace.';
    return NextResponse.json({ error: message }, { status });
  }
}
