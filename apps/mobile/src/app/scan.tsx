import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { emit } from '../api';
import { askLocation } from '../location';
import { fonts, radius, useTheme } from '../theme';
import { BackHeader, Button, Screen, T } from '../ui';

const CODE = /^[A-Z0-9]{6}$/;

/** Deux usages : `mode=join` scanne le QR d'un salon pour le rejoindre, sinon le QR d'un fugitif pour l'attraper. */
export default function Scan() {
  const t = useTheme();
  const router = useRouter();
  const join = useLocalSearchParams<{ mode?: string }>().mode === 'join';
  const [permission, requestPermission] = useCameraPermissions();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const busy = useRef(false);

  function fail(text: string) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    setMsg({ ok: false, text });
    setTimeout(() => { busy.current = false; }, 2000); // laisse le temps de lire avant de rescanner
  }

  async function onScan(data: string) {
    if (busy.current) return;
    busy.current = true;
    try {
      if (join) {
        const code = data.trim().toUpperCase();
        if (!CODE.test(code)) return fail("Ce n'est pas le QR d'un salon Scatter.");
        await emit('join', { code });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        router.replace('/lobby');
        askLocation().catch(() => {}); // demandée dans le salon, sans retarder l'arrivée
        return;
      }
      await emit('capture', { qr: data });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setMsg({ ok: true, text: 'Capture validée !' });
      setTimeout(() => router.back(), 1200);
    } catch (e) {
      fail((e as Error).message);
    }
  }

  if (!permission) return <Screen><BackHeader /></Screen>;

  if (!permission.granted) {
    return (
      <Screen>
        <BackHeader />
        <T kind="title" style={{ marginTop: 16 }}>{join ? 'La caméra, pour rejoindre' : 'La caméra, pour attraper'}</T>
        <T kind="dim">{join
          ? "Scanne le QR code affiché dans le salon de l'hôte pour entrer directement dans la partie."
          : 'Pour valider une capture, scanne le QR code que le fugitif affiche sur son téléphone.'}</T>
        <View style={{ flex: 1 }} />
        <Button title="Autoriser la caméra" onPress={requestPermission} />
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={r => onScan(r.data)} />
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
        <Screen style={{ flex: 0 }}><BackHeader title={join ? 'Rejoindre un salon' : 'Scanner'} /></Screen>
      </View>
      <View pointerEvents="none" style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 250, height: 250, borderRadius: radius.block + 6, borderWidth: 4, borderColor: msg ? (msg.ok ? t.accent : t.danger) : '#E8EEE4' }} />
      </View>
      <View style={{ position: 'absolute', left: 16, right: 16, bottom: 48, backgroundColor: t.surface, borderWidth: 1, borderColor: t.line, borderRadius: radius.block, padding: 18 }}>
        <Text style={{ fontFamily: fonts.bold, fontSize: 18, color: msg && !msg.ok ? t.danger : t.text, textAlign: 'center' }}>
          {msg?.text ?? (join ? "Vise le QR code du salon de l'hôte" : 'Vise le QR code du fugitif')}
        </Text>
      </View>
    </View>
  );
}
