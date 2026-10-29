import { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { BatteryChargingIcon, CameraIcon, CheckIcon, MapPinIcon, NavigationArrowIcon } from 'phosphor-react-native';
import { type Perm, type PermKey, allGranted, checkAll, request } from '../permissions';
import { setState } from '../store';
import { fonts, radius, useTheme } from '../theme';
import { Button, Screen, T } from '../ui';

const ICON: Record<PermKey, typeof MapPinIcon> = { location: MapPinIcon, background: NavigationArrowIcon, camera: CameraIcon, battery: BatteryChargingIcon };

export default function Permissions() {
  const t = useTheme();
  const router = useRouter();
  const [perms, setPerms] = useState<Perm[] | null>(null);

  const refresh = useCallback(() => { checkAll().then(setPerms).catch(() => {}); }, []);
  useEffect(() => {
    refresh();
    // Retour des réglages Android/iOS : on revérifie.
    const sub = AppState.addEventListener('change', s => s === 'active' && refresh());
    return () => sub.remove();
  }, [refresh]);

  const done = () => {
    setState({ permsChecked: true });
    router.canGoBack() ? router.back() : router.replace('/');
  };

  // Tout est accordé : on repart directement.
  useEffect(() => { if (perms && allGranted(perms)) done(); }, [perms]);

  return (
    <Screen scroll>
      <T kind="title" style={{ marginTop: 24 }}>Avant de jouer</T>
      <T kind="dim">Keep Runni'n a besoin de ces accès pour fonctionner pendant une partie. Rien n'est partagé en dehors des manches.</T>
      <View style={{ gap: 10, marginTop: 8 }}>
        {perms?.map(p => {
          const Icon = ICON[p.key];
          const ok = p.status === 'granted';
          return (
            <View key={p.key} style={{ backgroundColor: t.surface, borderRadius: radius.block, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: ok ? t.accentSoft : t.surface2, alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={22} color={ok ? t.accentText : t.text} weight="bold" />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontFamily: fonts.semibold, fontSize: 17, color: t.text }}>{p.title}</Text>
                <Text style={{ fontFamily: fonts.body, fontSize: 14, lineHeight: 19, color: t.textDim }}>{p.why}</Text>
              </View>
              {ok ? (
                <View accessible accessibilityLabel="Autorisé"><CheckIcon size={24} color={t.accentText} weight="bold" /></View>
              ) : (
                <Pressable accessibilityRole="button" onPress={() => request(p.key, p.status).then(refresh)} hitSlop={6}
                  style={({ pressed }) => ({ backgroundColor: t.accent, borderRadius: radius.inner, paddingHorizontal: 14, height: 40, justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
                  <Text style={{ fontFamily: fonts.bold, fontSize: 15, color: t.onAccent }}>{p.status === 'blocked' ? 'Réglages' : 'Autoriser'}</Text>
                </Pressable>
              )}
            </View>
          );
        })}
      </View>
      {perms?.some(p => p.status === 'blocked') && (
        <T kind="small" style={{ marginHorizontal: 4 }}>« Réglages » ouvre la page de l'app : active l'accès, puis reviens ici.</T>
      )}
      <View style={{ height: 12 }} />
      <Button title="Continuer" onPress={done} />
      <T kind="small" style={{ textAlign: 'center' }}>Sans ces accès, certaines fonctions ne marcheront pas en partie.</T>
    </Screen>
  );
}
