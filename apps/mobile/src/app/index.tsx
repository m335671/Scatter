import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PathIcon, TargetIcon, UserIcon } from 'phosphor-react-native';
import { setState, useStore } from '../store';
import { allGranted, checkAll } from '../permissions';
import { ActivityTab } from '../tabs/activity';
import { PlayTab } from '../tabs/play';
import { ProfileTab } from '../tabs/profile';
import { fonts, useTheme } from '../theme';
import { KeyboardSpacer, useKeyboardHeight } from '../ui';

type Tab = 'play' | 'activity' | 'profile';

export default function Home() {
  const t = useTheme();
  const router = useRouter();
  const user = useStore(s => s.user);
  const tutorialSeen = useStore(s => s.settings.tutorialSeen);
  const permsChecked = useStore(s => s.permsChecked);
  const [tab, setTab] = useState<Tab>('play');
  const keyboard = useKeyboardHeight() > 0;
  // Création ou arrivée dans une partie en cours : on ne change pas d'onglet entre-temps.
  const [busy, setBusy] = useState(false);

  // À chaque lancement : s'il manque une permission, on montre l'écran qui les liste.
  useEffect(() => {
    if (!user || !tutorialSeen || permsChecked) return;
    checkAll().then(p => (allGranted(p) ? setState({ permsChecked: true }) : router.push('/permissions?auto=1'))).catch(() => {});
  }, [user, tutorialSeen, permsChecked]);

  if (!user) return <Redirect href="/onboarding" />;
  if (!tutorialSeen) return <Redirect href="/tutorial" />;

  const item = (key: Tab, label: string, Icon: typeof TargetIcon) => {
    const on = tab === key;
    const color = on ? (t.dark ? t.accent : t.text) : t.textDim;
    return (
      <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => setTab(key)} disabled={busy}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 8, opacity: busy && !on ? 0.4 : 1 }}>
        <Icon size={25} color={color} weight={on ? 'bold' : 'regular'} />
        <Text style={{ fontFamily: on ? fonts.bold : fonts.semibold, fontSize: 12, color }}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ flex: 1 }}>
        {tab === 'play' && <PlayTab onActivity={() => setTab('activity')} onBusy={setBusy} />}
        {tab === 'activity' && <ActivityTab />}
        {tab === 'profile' && <ProfileTab />}
      </View>
      {/* Clavier ouvert (code à saisir) : la barre d'onglets laisse la place, le contenu remonte au-dessus du clavier. */}
      {keyboard ? <KeyboardSpacer /> : <SafeAreaView edges={['bottom']} accessibilityRole="tablist"
        style={{ flexDirection: 'row', backgroundColor: t.dark ? t.bg : t.surface, borderTopWidth: 1, borderTopColor: t.line, marginTop: 12 }}>
        {item('play', 'Jouer', TargetIcon)}
        {item('activity', 'Activité', PathIcon)}
        {item('profile', 'Profil', UserIcon)}
      </SafeAreaView>}
    </SafeAreaView>
  );
}
