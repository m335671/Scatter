import { type ComponentRef, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { ShareNetworkIcon, XIcon } from 'phosphor-react-native';
import { ShareCard } from '../share-card';
import { type GameRecord, totals, useRecords } from '../stats';
import { useStore } from '../store';
import { fonts, radius, useTheme } from '../theme';
import { Button, Screen, T, fmtClock, fmtDistance, showDialog } from '../ui';

const hours = (ms: number) => (ms >= 3600_000 ? `${Math.floor(ms / 3600_000)} h ${String(Math.floor((ms % 3600_000) / 60_000)).padStart(2, '0')}` : fmtClock(ms));

export default function Stats() {
  const t = useTheme();
  const router = useRouter();
  const records = useRecords();
  const units = useStore(s => s.settings.units);
  const [open, setOpen] = useState<GameRecord | null>(null);
  const s = totals(records);
  const rate = s.games ? Math.round((s.wins / s.games) * 100) : 0;

  const tile = (value: string, label: string, accent?: boolean) => (
    <View style={{ flexBasis: '47%', flexGrow: 1, backgroundColor: accent ? t.accent : t.surface, borderRadius: radius.block, padding: 16, gap: 2 }}>
      <Text style={{ fontFamily: fonts.displayBlack, fontSize: 30, color: accent ? t.onAccent : t.text }} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: accent ? t.onAccent : t.textDim }}>{label}</Text>
    </View>
  );

  return (
    <Screen scroll>
      <View style={{ height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: fonts.semibold, fontSize: 18, color: t.text }}>Tes stats</Text>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ position: 'absolute', right: 0 }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 18, color: t.accentText }}>OK</Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {tile(String(s.games), s.games > 1 ? 'parties jouées' : 'partie jouée', true)}
        {tile(`${rate} %`, `de victoires (${s.wins})`)}
        {tile(fmtDistance(s.distanceM, units), 'parcourus en partie')}
        {tile(String(s.captures), s.captures > 1 ? 'fugitifs attrapés' : 'fugitif attrapé')}
        {tile(hours(s.survivedMs), 'en fuite au total')}
        {tile(`${s.asHunter} / ${s.asFugitive}`, 'chasseur / fugitif')}
      </View>

      <T kind="label" style={{ marginLeft: 4, marginTop: 12 }}>Parties</T>
      {records.length === 0 ? (
        <View style={{ backgroundColor: t.surface, borderRadius: radius.block, padding: 20, gap: 6 }}>
          <T style={{ fontFamily: fonts.semibold }}>Aucune partie pour l'instant</T>
          <T kind="dim">Tes parties s'affichent ici à la fin de chaque manche, avec une carte de ton trajet à partager. Elles restent sur ton téléphone.</T>
        </View>
      ) : records.map(r => (
        <Pressable key={`${r.code}-${r.date}`} onPress={() => setOpen(r)}
          style={({ pressed }) => ({ backgroundColor: pressed ? t.surface2 : t.surface, borderRadius: radius.block, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 })}>
          <View style={{ width: 10, alignSelf: 'stretch', borderRadius: 5, backgroundColor: r.won ? t.accent : t.surface2 }} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 17, color: t.text }}>
              {r.won ? 'Gagné' : 'Perdu'} · {r.role === 'hunter' ? 'Chasseur' : 'Fugitif'}{r.training ? ' · Entraînement' : ''}
            </Text>
            <Text style={{ fontFamily: fonts.body, fontSize: 14, color: t.textDim }}>
              {new Date(r.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} · {fmtDistance(r.distanceM, units)} · {r.role === 'hunter' ? `${r.captures} capture${r.captures > 1 ? 's' : ''}` : fmtClock(r.survivedMs)}
            </Text>
          </View>
          <ShareNetworkIcon size={22} color={t.textDim} />
        </Pressable>
      ))}
      {records.some(r => r.training) && <T kind="small" style={{ marginHorizontal: 4 }}>Les entraînements sont listés mais ne comptent pas dans les totaux.</T>}

      <ShareSheet record={open} onClose={() => setOpen(null)} />
    </Screen>
  );
}

function ShareSheet({ record, onClose }: { record: GameRecord | null; onClose: () => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const name = useStore(s => s.user?.name ?? '');
  const units = useStore(s => s.settings.units);
  const card = useRef<ComponentRef<typeof View>>(null);
  const [busy, setBusy] = useState(false);

  async function share() {
    if (!card.current) return;
    setBusy(true);
    try {
      const uri = await captureRef(card, { format: 'png', quality: 1 });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Partager ma partie' });
    } catch (e) {
      showDialog({ title: 'Partage impossible', message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={!!record} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
        <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: fonts.semibold, fontSize: 18, color: t.text }}>Partager cette partie</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Fermer"
            style={{ position: 'absolute', right: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center' }}>
            <XIcon size={18} color={t.text} weight="bold" />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ alignItems: 'center', padding: 16 }}>
          {record && <ShareCard ref={card} record={record} name={name} units={units} width={Math.min(width - 32, 420)} />}
        </ScrollView>
        <View style={{ padding: 16, paddingBottom: insets.bottom + 8 }}>
          <Button title="Partager l'image" onPress={share} loading={busy} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}
