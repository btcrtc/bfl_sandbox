import { env } from 'cloudflare:workers';

import { chatGPTSignInPath, getChatGPTUser } from '@/app/chatgpt-auth';
import { ScenesShell } from '@/components/scenes-shell';

export default async function ScenesPage() {
  const user = await getChatGPTUser();
  return (
    <ScenesShell
      viewer={user ? { displayName: user.displayName, email: user.email } : null}
      signInPath={chatGPTSignInPath('/scenes')}
      videoEnabled={env.VIDEO_ENABLED === 'true'}
    />
  );
}
