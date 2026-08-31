import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';

import {
  clearDemoSessionCookie,
  createDemoSession,
  demoSessionCookie,
  getChatGPTUser,
} from '@/app/chatgpt-auth';

export async function GET() {
  const user = await getChatGPTUser();
  return NextResponse.json({
    authenticated: Boolean(user),
    mode: env.DEMO_MODE === 'true' ? 'demo' : 'chatgpt',
    user: user
      ? {
          displayName: user.displayName,
          email: user.email,
          provider: user.provider,
        }
      : null,
  });
}

export async function POST(request: Request) {
  if (env.DEMO_MODE !== 'true') {
    return NextResponse.json(
      { error: 'Demo sign-in is not available on this deployment.' },
      { status: 404 },
    );
  }
  const body = (await request.json().catch(() => null)) as {
    displayName?: unknown;
  } | null;
  const displayName =
    typeof body?.displayName === 'string'
      ? body.displayName.trim().replace(/\s+/gu, ' ').slice(0, 60)
      : '';
  if (displayName.length < 2) {
    return NextResponse.json(
      { error: 'Enter at least two characters for your studio name.' },
      { status: 400 },
    );
  }

  const token = await createDemoSession(displayName);
  const response = NextResponse.json({ authenticated: true });
  response.headers.append('Set-Cookie', demoSessionCookie(token));
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ authenticated: false });
  response.headers.append('Set-Cookie', clearDemoSessionCookie());
  response.headers.append(
    'Set-Cookie',
    'branchline_workspace=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
  );
  response.headers.append(
    'Set-Cookie',
    'branchline_project=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
  );
  return response;
}
