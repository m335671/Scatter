// Onglet Activité : totaux et historique des parties, stockés uniquement sur ce téléphone.
import { type ComponentRef, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import Svg, { Circle, Path } from 'react-native-svg';
import { DeviceMobileIcon, XIcon } from '../icons';
import { ShareCard, project } from '../share-card';
import { type GameRecord, exportStats, totals, useRecords } from '../stats';
import { useStore } from '../store';
import { fonts, radius, useTheme } from '../theme';
import { Button, fmtClock, fmtDistance, showDialog } from '../ui';

export function ActivityTab() {
  const t = useTheme();
  const records = useRecords();
  const units = useStore(s => s.settings.units);
  const [open, setOpen] = useState<GameRecord | null>(null);
  const s = totals(records);
  const dist = fmtDistance(s.distanceM, units).split(' ');

  const stat = (value: string, label: string, accent?: boolean) => (
    <View style={{ flex: 1 }}>
      <Text style={{ fontFamily: fonts.mono, fontSize: 26, color: accent ? t.accentText : t.text }} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: t.textDim }}>{label}</Text>
    </View>
  );

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32, gap: 16 }}>
      <Text accessibilityRole="header" style={{ fontFamily: fonts.hero, fontSize: 52, lineHeight: 52, letterSpacing: -1, color: t.text }}>Activité</Text>

      <View style={{ flexDirection: 'row', paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: t.line }}>
        {stat(String(s.games), s.games > 1 ? 'parties' : 'partie')}
        {stat(String(s.wins), s.wins > 1 ? 'victoires' : 'victoire')}
        {stat(dist[0], `${dist[1]} parcourus`, true)}
      </View>
      {s.games > 0 && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip label={`${s.captures} capture${s.captures > 1 ? 's' : ''}`} />
          <Chip label={`${fmtClock(s.survivedMs)} en fuite`} />
          <Chip label={`${s.asHunter} chass. / ${s.asFugitive} fug.`} />
        </View>
      )}

      <LocalDataNotice />

      {records.length === 0 ? (
        <View style={{ backgroundColor: t.surface, borderWidth: 1, borderColor: t.line, borderRadius: radius.block, padding: 20, gap: 6 }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 18, color: t.text }}>Aucune partie pour l'instant</Text>
          <Text style={{ fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: t.textDim }}>Chaque manche terminée s'ajoute ici, avec ton trajet dans la zone et une carte à partager.</Text>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {records.map(r => <GameRow key={`${r.code}-${r.date}`} r={r} units={units} onPress={() => setOpen(r)} />)}
          {records.some(r => r.training) && <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: t.textDim, marginHorizontal: 4 }}>Les entraînements sont listés mais ne comptent pas dans les totaux.</Text>}
        </View>
      )}

      <ShareSheet record={open} onClose={() => setOpen(null)} />
    </ScrollView>
  );
}

function Chip({ label }: { label: string }) {
  const t = useTheme();
  return (
    <View style={{ flexGrow: 1, alignItems: 'center', borderRadius: radius.inner, borderWidth: 1, borderColor: t.line, paddingVertical: 7, paddingHorizontal: 8 }}>
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: fonts.monoMedium, fontSize: 12, color: t.textDim }}>{label}</Text>
    </View>
  );
}

/** Rappel : rien n'est sauvegardé ailleurs. Repris dans le profil. */
export function LocalDataNotice() {
  const t = useTheme();
  return (
    <View style={{ backgroundColor: t.accentSoft, borderRadius: radius.block, padding: 16, gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <DeviceMobileIcon size={24} color={t.text} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 16, color: t.text }}>Tes stats restent sur ce téléphone</Text>
          <Text style={{ fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: t.text, opacity: 0.85 }}>
            Rien n'est envoyé au serveur. Si tu désinstalles l'app ou changes de téléphone, elles sont perdues : exporte-les avant.
          </Text>
        </View>
      </View>
      <Button title="Exporter mes stats" kind="secondary" style={{ height: 46 }}
        onPress={() => exportStats().catch(e => showDialog({ title: 'Export impossible', message: (e as Error).message }))} />
    </View>
  );
}

function GameRow({ r, units, onPress }: { r: GameRecord; units: 'km' | 'mi'; onPress: () => void }) {
  const t = useTheme();
  const title = r.role === 'fugitive'
    ? (r.caught ? `Attrapé à ${fmtClock(r.survivedMs)}` : `Survécu · ${fmtClock(r.survivedMs)}`)
    : `${r.captures} capture${r.captures > 1 ? 's' : ''}`;
  const sub = [r.role === 'hunter' ? 'Chasseur' : 'Fugitif', r.mode === 'zombie' && 'zombie', r.training && 'entraînement'].filter(Boolean).join(' · ');
  const date = new Date(r.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityHint="Partager cette partie"
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: pressed ? t.surface2 : t.surface, borderWidth: 1, borderColor: t.line, borderRadius: radius.block, padding: 10 })}>
      <Thumb r={r} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ fontFamily: fonts.bold, fontSize: 18, color: t.text }} numberOfLines={1}>{title}</Text>
        <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: t.textDim }} numberOfLines={1}>{sub}</Text>
        <Text style={{ fontFamily: fonts.monoMedium, fontSize: 12, color: t.textDim, opacity: 0.8 }}>{date} · {fmtDistance(r.distanceM, units).toUpperCase()}</Text>
      </View>
      <View style={{ alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, backgroundColor: r.won ? t.accent : 'transparent', borderWidth: r.won ? 0 : 1, borderColor: t.line }}>
        <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: r.won ? t.onAccent : t.textDim }}>{r.won ? 'GAGNÉ' : 'PERDU'}</Text>
      </View>
    </Pressable>
  );
}

/** Miniature du trajet dans la zone (pas de fond de carte : juste le tracé). */
function Thumb({ r }: { r: GameRecord }) {
  const t = useTheme();
  const size = 72;
  const hasTrack = r.track.length > 1;
  const p = hasTrack || r.zone ? project(r.track, r.zone, size, 8) : null;
  const d = p && hasTrack ? r.track.map((pt, i) => `${i ? 'L' : 'M'}${p.to(pt).x.toFixed(1)},${p.to(pt).y.toFixed(1)}`).join(' ') : '';
  const end = p && hasTrack ? p.to(r.track.at(-1)!) : null;
  const zc = p && r.zone ? p.to(r.zone.center) : null;
  const ink = r.won ? t.accentText : t.textDim;
  return (
    <View style={{ width: size, height: size, borderRadius: radius.inner, backgroundColor: t.surface2, overflow: 'hidden' }}>
      <Svg width={size} height={size}>
        {zc && r.zone && <Circle cx={zc.x} cy={zc.y} r={r.zone.radiusM * p!.scale} fill="none" stroke={t.textDim} strokeOpacity={0.5} strokeWidth={1.5} strokeDasharray="3 3" />}
        {d ? <Path d={d} fill="none" stroke={ink} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" /> : null}
        {end && (r.caught
          ? <Path d={`M${end.x - 4},${end.y - 4}L${end.x + 4},${end.y + 4}M${end.x + 4},${end.y - 4}L${end.x - 4},${end.y + 4}`} stroke={t.danger} strokeWidth={2.5} strokeLinecap="round" />
          : <Circle cx={end.x} cy={end.y} r={3.5} fill={ink} />)}
      </Svg>
    </View>
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
        <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: fonts.monoMedium, fontSize: 12, letterSpacing: 1, color: t.textDim }}>PARTAGER CETTE PARTIE</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Fermer"
            style={{ position: 'absolute', right: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: t.surface, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}>
            <XIcon size={18} color={t.text} weight="bold" />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ alignItems: 'center', padding: 16 }}>
          {record && <ShareCard ref={card} record={record} name={name} units={units} width={Math.min(width - 32, 420)} />}
        </ScrollView>
        <View style={{ padding: 16, paddingBottom: insets.bottom + 8 }}>
          <Button title="Partager l'image" arrow onPress={share} loading={busy} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}
