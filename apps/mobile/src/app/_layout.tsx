import '../location'; // enregistre la tâche GPS au chargement du bundle
import { useEffect } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { connect } from '../api';
import { startTracking, stopTracking } from '../location';
import { preloadMapStyles } from '../map-style';
import { loadPersisted, useStore } from '../store';
import { fontFiles, useTheme } from '../theme';
import { DialogHost } from '../ui';

export default function RootLayout() {
  const t = useTheme();
  const [fontsLoaded] = useFonts(fontFiles);
  const ready = useStore(s => s.ready);
  const token = useStore(s => s.token);
  const phase = useStore(s => s.game?.phase);

  useEffect(() => { loadPersisted(); preloadMapStyles(); }, []);
  useEffect(() => { if (ready && token) connect(); }, [ready, token]);

  // On partage sa position uniquement pendant une manche.
  const playing = phase === 'headstart' || phase === 'hunt';
  useEffect(() => {
    (playing ? startTracking() : stopTracking()).catch(() => {});
  }, [playing]);

  if (!fontsLoaded || !ready) return <View style={{ flex: 1, backgroundColor: t.bg }} />;

  return (
    <>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg }, animation: 'slide_from_right' }}>
        <Stack.Screen name="index" options={{ animation: 'fade' }} />
        <Stack.Screen name="game" options={{ gestureEnabled: false, animation: 'fade' }} />
        <Stack.Screen name="tutorial" options={{ animation: 'fade' }} />
      </Stack>
      <DialogHost />
    </>
  );
}
