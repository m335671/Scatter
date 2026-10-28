import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GearIcon } from 'phosphor-react-native';
import { defaultRules } from '@kr/shared';
import { emit } from '../api';
import { askLocation, currentPosition } from '../location';
import { setState, useStore } from '../store';
import { allGranted, checkAll } from '../permissions';
import { fonts, radius } from '../theme';
import { Mark } from '../logo';
import { showDialog } from '../ui';

const RED = '#EE2E14';
const INK = '#F7F2F0';

export default function Home() {
  const router = useRouter();
  const user = useStore(s => s.user);
  const tutorialSeen = useStore(s => s.settings.tutorialSeen);
  const permsChecked = useStore(s => s.permsChecked);

  // À chaque lancement : s'il manque une permission, on montre l'écran qui les liste.
  useEffect(() => {
    if (!user || !tutorialSeen || permsChecked) return;
    checkAll().then(p => (allGranted(p) ? setState({ permsChecked: true }) : router.push('/permissions'))).catch(() => {});
  }, [user, tutorialSeen, permsChecked]);
  const connected = useStore(s => s.connected);
  const lobby = useStore(s => s.lobby);
  const phase = useStore(s => s.game?.phase);
  const [busy, setBusy] = useState<'create' | 'train' | null>(null);

  if (!user) return <Redirect href="/onboarding" />;
  if (!tutorialSeen) return <Redirect href="/tutorial" />;

  async function create(training: boolean) {
    setBusy(training ? 'train' : 'create');
    try {
      if ((await askLocation()) === 'denied') throw new Error('Sans ta position, impossible de placer la zone de jeu.');
      const center = await currentPosition();
      await emit('create', { rules: defaultRules(center), training });
      router.push('/lobby');
    } catch (e) {
      showDialog({ title: 'Oups', message: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  const inGame = phase === 'headstart' || phase === 'hunt';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: RED }}>
      <View style={{ flex: 1, paddingHorizontal: 20, paddingBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Mark size={38} color={INK} />
            <Text style={{ fontFamily: fonts.hero, fontSize: 40, color: INK, letterSpacing: -0.5 }} accessibilityRole="header">KEEP RUNNI'N</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Réglages" onPress={() => router.push('/settings')}
            style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
            <GearIcon size={24} color={INK} weight="bold" />
          </Pressable>
        </View>

        {/* Seules les vraies parties, en cours ou en salon, sont proposées : pas les entraînements ni les parties finies. */}
        {lobby && !lobby.training && phase !== 'ended' && (
          <Pressable onPress={() => router.push(inGame ? '/game' : '/lobby')}
            style={{ marginTop: 8, backgroundColor: 'rgba(0,0,0,0.18)', borderRadius: radius.block, padding: 16 }}>
            <Text style={{ fontFamily: fonts.bold, fontSize: 17, color: INK }}>
              {inGame ? 'Partie en cours' : 'Salon ouvert'} · {lobby.code}
            </Text>
            <Text style={{ fontFamily: fonts.body, fontSize: 15, color: INK, opacity: 0.85, marginTop: 2 }}>Touche pour y retourner</Text>
          </Pressable>
        )}

        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Text style={{ fontFamily: fonts.hero, fontSize: 132, lineHeight: 124, color: INK, letterSpacing: -2 }}>Salut,</Text>
          <Text style={{ fontFamily: fonts.hero, fontSize: 132, lineHeight: 132, color: INK, letterSpacing: -2 }} numberOfLines={1} adjustsFontSizeToFit>
            {user.name}.
          </Text>
          <Text style={{ fontFamily: fonts.display, fontSize: 21, lineHeight: 27, color: INK, marginTop: 12, marginBottom: 28 }}>
            Crée une partie ou récupère le code d'un ami.
          </Text>
        </View>

        <View style={{ gap: 12 }}>
          <HomeButton title="Créer une partie" solid loading={busy === 'create'} onPress={() => create(false)} disabled={!connected || !!busy} />
          <HomeButton title="Rejoindre avec un code" onPress={() => router.push('/join')} disabled={!connected || !!busy} />
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 28, paddingVertical: 10 }}>
            <Pressable hitSlop={10} onPress={() => router.push('/tutorial')}>
              <Text style={{ fontFamily: fonts.bold, fontSize: 17, color: INK, opacity: 0.85 }}>Comment ça marche</Text>
            </Pressable>
            <Pressable hitSlop={10} onPress={() => create(true)} disabled={!connected || !!busy}>
              <Text style={{ fontFamily: fonts.bold, fontSize: 17, color: INK, opacity: 0.85 }}>{busy === 'train' ? 'Préparation…' : "S'entraîner"}</Text>
            </Pressable>
          </View>
          {!connected && (
            <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: INK, textAlign: 'center', opacity: 0.85 }}>
              Connexion au serveur… Vérifie l'adresse dans les réglages.
            </Text>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

function HomeButton({ title, onPress, solid, loading, disabled }: { title: string; onPress: () => void; solid?: boolean; loading?: boolean; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled}
      style={({ pressed }) => [{
        height: 62, borderRadius: radius.block, alignItems: 'center', justifyContent: 'center',
        backgroundColor: solid ? INK : 'rgba(255,255,255,0.2)', opacity: disabled ? 0.55 : 1,
      }, pressed && { transform: [{ scale: 0.98 }] }]}>
      <Text style={{ fontFamily: fonts.bold, fontSize: 19, color: solid ? '#161414' : INK }}>{loading ? 'Un instant…' : title}</Text>
    </Pressable>
  );
}
