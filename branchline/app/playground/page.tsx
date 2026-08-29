import { chatGPTSignInPath, getChatGPTUser } from '@/app/chatgpt-auth';
import { PlaygroundShell } from '@/components/playground-shell';

export default async function PlaygroundPage() {
  const user = await getChatGPTUser();
  return (
    <PlaygroundShell
      viewer={user ? { displayName: user.displayName, email: user.email } : null}
      signInPath={chatGPTSignInPath('/playground')}
    />
  );
}
