import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { emit } from '../api';
import { fonts, radius, useTheme } from '../theme';
import { BackHeader, Button, Screen, T } from '../ui';

export default function Scan() {
  const t = useTheme();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const busy = useRef(false);

  async function onScan(data: string) {
    if (busy.current) return;
    busy.current = true;
    try {
      await emit('capture', { qr: data });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setMsg({ ok: true, text: 'Capture validée !' });
      setTimeout(() => router.back(), 1200);
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setMsg({ ok: false, text: (e as Error).message });
      setTimeout(() => { busy.current = false; }, 2000); // laisse le temps de lire avant de rescanner
    }
  }

  if (!permission) return <Screen><BackHeader /></Screen>;

  if (!permission.granted) {
    return (
      <Screen>
        <BackHeader />
        <T kind="title" style={{ marginTop: 16 }}>La caméra, pour attraper</T>
        <T kind="dim">Pour valider une capture, scanne le QR code que le fugitif affiche sur son téléphone.</T>
        <View style={{ flex: 1 }} />
        <Button title="Autoriser la caméra" onPress={requestPermission} />
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={r => onScan(r.data)} />
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
        <Screen style={{ flex: 0 }}><BackHeader title="Scanner" /></Screen>
      </View>
      <View pointerEvents="none" style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 250, height: 250, borderRadius: radius.block, borderWidth: 4, borderColor: msg ? (msg.ok ? '#3DDC84' : t.accent) : '#F7F2F0' }} />
      </View>
      <View style={{ position: 'absolute', left: 16, right: 16, bottom: 48, backgroundColor: t.surface, borderRadius: radius.block, padding: 18 }}>
        <Text style={{ fontFamily: fonts.bold, fontSize: 18, color: msg && !msg.ok ? t.accentText : t.text, textAlign: 'center' }}>
          {msg?.text ?? 'Vise le QR code du fugitif'}
        </Text>
      </View>
    </View>
  );
}
