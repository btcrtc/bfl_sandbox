import { chatGPTSignInPath, getChatGPTUser } from '@/app/chatgpt-auth';
import { SectionPage } from '@/components/section-page';

export default async function Page() {
  const user = await getChatGPTUser();
  return (
    <SectionPage
      section="components"
      viewer={user ? { displayName: user.displayName, email: user.email } : null}
      signInPath={chatGPTSignInPath('/components')}
    />
  );
}
