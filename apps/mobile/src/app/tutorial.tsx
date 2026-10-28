import { useRouter } from 'expo-router';
import { setState } from '../store';
import { Tutorial } from '../tutorial';

export default function TutorialScreen() {
  const router = useRouter();
  return (
    <Tutorial onDone={() => {
      setState(s => ({ settings: { ...s.settings, tutorialSeen: true } }));
      router.canGoBack() ? router.back() : router.replace('/');
    }} />
  );
}
