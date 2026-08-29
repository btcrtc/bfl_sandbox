import { env } from 'cloudflare:workers';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { ensurePersonalWorkspace } from '@/db/ensure';

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return new Response('Sign in to connect.', { status: 401 });
  if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
    return new Response('Expected a WebSocket upgrade.', { status: 426 });
  }

  const workspaceId = await ensurePersonalWorkspace(user.userId, user.displayName);
  const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
  server.accept();

  let lastVersion = '';
  let closed = false;
  const pushVersion = async () => {
    if (closed) return;
    try {
      const version = await env.DB.prepare(
        'SELECT COUNT(*) AS count, COALESCE(MAX(updated_at), 0) AS updatedAt FROM generations WHERE workspace_id = ?',
      )
        .bind(workspaceId)
        .first<{ count: number; updatedAt: number }>();
      const nextVersion = `${version?.count ?? 0}:${version?.updatedAt ?? 0}`;
      if (nextVersion !== lastVersion) {
        lastVersion = nextVersion;
        server.send(JSON.stringify({ type: 'history:changed', version: nextVersion }));
      } else {
        server.send(JSON.stringify({ type: 'heartbeat', at: Date.now() }));
      }
    } catch {
      server.send(JSON.stringify({ type: 'realtime:error' }));
    }
  };

  await pushVersion();
  const interval = setInterval(() => void pushVersion(), 2_500);
  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(interval);
  };
  server.addEventListener('close', cleanup);
  server.addEventListener('error', cleanup);
  server.addEventListener('message', (event) => {
    if (event.data === 'ping') server.send('pong');
  });

  return new Response(null, {
    status: 101,
    webSocket: client,
  } as ResponseInit & { webSocket: WebSocket });
}
