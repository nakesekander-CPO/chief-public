import ChiefApp from './chief-app';
import { getChatGPTUser } from './chatgpt-auth';
import { freshPersonalState } from '@/lib/personal';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await getChatGPTUser();
  return <ChiefApp initialState={freshPersonalState(user?.displayName, user?.email)} />;
}
