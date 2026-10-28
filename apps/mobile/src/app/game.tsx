import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, Animated, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import QRCode from 'react-native-qrcode-svg';
import { Camera, GeoJSONSource, Layer, Map, NativeUserLocation, type CameraRef } from '@maplibre/maplibre-react-native';
import { BroadcastIcon, CrosshairIcon, DotsThreeIcon, MapTrifoldIcon, QrCodeIcon, ScanIcon } from 'phosphor-react-native';
import type { GameView, LatLng, SeenPlayer } from '@kr/shared';
import { emit, leaveGame } from '../api';
import { Radio } from '../radio';
import { setState, useStore } from '../store';
import { fonts, radius, useTheme, type Theme } from '../theme';
import { Group, Row, Segmented, fmtClock, fmtDistance } from '../ui';

/** Polygone approchant un cercle de `r` mètres (64 côtés). */
function circle(c: LatLng, r: number): GeoJSON.Feature<GeoJSON.Polygon> {
  const coords: [number, number][] = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * 2 * Math.PI;
    coords.push([
      c.lng + (r * Math.sin(a)) / (111_320 * Math.cos((c.lat * Math.PI) / 180)),
      c.lat + (r * Math.cos(a)) / 111_320,
    ]);
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coords] } };
}

/** Hauteur fixe de la barre d'onglets flottante : le reste de l'écran se cale dessus. */
const TAB_H = 76;

const zoomFor = (radiusM: number) => 16 - Math.log2(Math.max(radiusM, 80) / 160);

export default function GameScreen() {
  const t = useTheme();
  const game = useStore(s => s.game);
  const [tab, setTab] = useState<'map' | 'radio'>('map');
  const [more, setMore] = useState(false);
  const [qr, setQr] = useState(false);

  if (!game) return <Redirect href="/" />;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      {tab === 'map'
        ? <MapView game={game} onRadio={() => setTab('radio')} onQr={() => setQr(true)} />
        : <SafeAreaView edges={['top']} style={{ flex: 1 }}><Radio game={game} /></SafeAreaView>}
      <TabBar tab={tab} onTab={setTab} onMore={() => setMore(true)} />
      <PingFlash game={game} />
      <MoreSheet game={game} visible={more} onClose={() => setMore(false)} onQr={() => { setMore(false); setQr(true); }} />
      <QrSheet game={game} visible={qr} onClose={() => setQr(false)} />
      {game.phase === 'ended' && <EndPanel game={game} />}
    </View>
  );
}

// ---------- Carte ----------

function MapView({ game, onRadio, onQr }: { game: GameView; onRadio: () => void; onQr: () => void }) {
  const t = useTheme();
  const router = useRouter();
  const camera = useRef<CameraRef>(null);
  const insets = useSafeAreaInsets();
  const last = useStore(s => s.chat.at(-1));
  const zone = game.zone;
  const zoneShape = useMemo(() => circle(zone.center, zone.radiusM), [zone.center.lat, zone.center.lng, zone.radiusM]);
  // En spectateur (ou en fin de partie), la vue différée remplace le dernier ping : pas de doublon de marqueurs.
  const others = game.spectating.length ? game.spectating : (game.ping?.players ?? []);
  const players = toFeatures(game, others);

  return (
    <View style={{ flex: 1 }}>
      <Map style={{ flex: 1 }} mapStyle={t.mapStyle} logo={false} compass={false} attribution attributionPosition={{ top: 230, left: 12 }}>
        <Camera ref={camera} initialViewState={{ center: [zone.center.lng, zone.center.lat], zoom: zoomFor(zone.radiusM) }} />
        {zone.enabled && (
          <GeoJSONSource id="zone" data={zoneShape}>
            <Layer type="fill" id="zone-fill" paint={{ 'fill-color': t.accent, 'fill-opacity': t.dark ? 0.08 : 0.06 }} />
            <Layer type="line" id="zone-line" paint={{ 'line-color': t.accent, 'line-width': 2 }} />
          </GeoJSONSource>
        )}
        <NativeUserLocation />
        <GeoJSONSource id="players" data={players}>
          <Layer type="circle" id="players-dot" paint={{
            'circle-radius': ['match', ['get', 'kind'], 'team', 7, 8],
            'circle-color': ['match', ['get', 'kind'], 'team', t.accent, t.bg],
            'circle-stroke-width': ['match', ['get', 'kind'], 'team', 3, 4],
            'circle-stroke-color': ['match', ['get', 'kind'], 'team', t.bg, 'exposed', t.accent, t.text],
            'circle-opacity': ['case', ['get', 'caught'], 0.4, 1],
            'circle-stroke-opacity': ['case', ['get', 'caught'], 0.4, 1],
          }} />
          {/* MapLibre place chaque étiquette du côté libre (gauche, droite, haut, bas) : pas de chevauchement. */}
          <Layer type="symbol" id="players-label" layout={{
            'text-field': ['get', 'label'],
            'text-font': ['Noto Sans Bold'],
            'text-size': 13,
            'text-variable-anchor': ['left', 'right', 'top', 'bottom'],
            'text-radial-offset': 1.1,
            'text-justify': 'auto',
            'text-padding': 2,
          }} paint={{
            'text-color': t.text,
            'text-halo-color': t.bg,
            'text-halo-width': 2,
            'text-opacity': ['case', ['get', 'caught'], 0.5, 1],
          }} />
        </GeoJSONSource>
      </Map>

      <SafeAreaView edges={['top']} style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 12 }} pointerEvents="box-none">
        <Hud game={game} />
        {game.me.outOfZone && (
          <View style={{ marginTop: 8, backgroundColor: t.accent, borderRadius: radius.block, padding: 14 }}>
            <Text style={{ fontFamily: fonts.bold, fontSize: 16, color: t.onAccent }}>Tu es hors de la zone !</Text>
            <Text style={{ fontFamily: fonts.body, fontSize: 15, color: t.onAccent, marginTop: 2 }}>Au prochain ping, ta position exacte sera révélée aux chasseurs.</Text>
          </View>
        )}
      </SafeAreaView>

      <View pointerEvents="box-none" style={{ position: 'absolute', left: 12, right: 12, bottom: Math.max(insets.bottom, 12) + TAB_H + 10, gap: 12 }}>
        <View pointerEvents="box-none" style={{ alignSelf: 'flex-end', gap: 12, alignItems: 'flex-end' }}>
          <RoundButton label="Recentrer" onPress={() => camera.current?.jumpTo({ center: [zone.center.lng, zone.center.lat], zoom: zoomFor(zone.radiusM) })}>
            <CrosshairIcon size={24} color={t.text} weight="bold" />
          </RoundButton>
          {game.phase === 'hunt' && game.me.role === 'hunter' && (
            <RoundButton label="Scanner un fugitif" big accent onPress={() => router.push('/scan')}>
              <ScanIcon size={30} color={t.onAccent} weight="bold" />
            </RoundButton>
          )}
          {game.me.role === 'fugitive' && !game.me.caught && game.phase !== 'ended' && (
            <RoundButton label="Mon QR code" big accent onPress={onQr}>
              <QrCodeIcon size={30} color={t.onAccent} weight="bold" />
            </RoundButton>
          )}
        </View>
        <Pressable onPress={onRadio} style={{ backgroundColor: t.surface, borderRadius: radius.block, padding: 14, gap: 10 }}>
          {last && (
            <Text numberOfLines={1} style={{ fontFamily: fonts.body, fontSize: 16, color: t.text }}>
              <Text style={{ fontFamily: fonts.bold }}>Radio  </Text>{last.fromName ? `${last.fromName} : ` : ''}{last.text}
            </Text>
          )}
          <PhaseBanner game={game} t={t} />
        </Pressable>
      </View>
    </View>
  );
}

function PhaseBanner({ game, t }: { game: GameView; t: Theme }) {
  let title: string, sub: string;
  if (game.phase === 'headstart') {
    title = game.me.role === 'hunter' ? 'Les fugitifs se cachent' : 'Cache-toi !';
    sub = `${game.me.role === 'hunter' ? 'Départ' : 'Les chasseurs partent'} dans ${fmtClock(game.huntStart - game.clock)}`;
  } else if (game.me.caught) {
    title = 'Tu as été attrapé';
    sub = 'Tu suis la partie en spectateur.';
  } else {
    title = game.me.role === 'hunter' ? 'Chasse en cours' : 'Ne te fais pas prendre';
    sub = `Fin dans ${fmtClock(game.huntEnd - game.clock)}`;
  }
  return (
    <View style={{ backgroundColor: t.surface2, borderRadius: radius.inner, paddingVertical: 12, alignItems: 'center' }}>
      <Text style={{ fontFamily: fonts.display, fontSize: 20, color: t.text }}>{title}</Text>
      <Text style={{ fontFamily: fonts.medium, fontSize: 15, color: t.textDim, marginTop: 2, fontVariant: ['tabular-nums'] }}>{sub}</Text>
    </View>
  );
}

/** Coéquipiers (en direct) et adversaires (ping ou vue spectateur) en GeoJSON pour les couches natives. */
function toFeatures(game: GameView, others: SeenPlayer[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  const feature = (p: SeenPlayer, kind: 'team' | 'enemy' | 'exposed', label: string): GeoJSON.Feature<GeoJSON.Point> => ({
    type: 'Feature', id: `${kind}-${p.id}`,
    properties: { kind, label, caught: p.caught },
    geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
  });
  return {
    type: 'FeatureCollection',
    features: [
      ...game.team.filter(p => p.id !== game.me.id).map(p => feature(p, 'team', p.name.toUpperCase())),
      ...others.map(p => feature(p, p.exposed ? 'exposed' : 'enemy',
        `${p.name.toUpperCase()}  ${p.caught ? 'attrapé' : fmtClock(game.clock - p.t).replace(/^0/, '')}`)),
    ],
  };
}

// ---------- HUD ----------

function Hud({ game }: { game: GameView }) {
  const t = useTheme();
  const units = useStore(s => s.settings.units);
  const pingEvery = useStore(s => (s.lobby?.rules.pingEveryMin ?? 2) * 60_000);
  const headstart = game.phase === 'headstart';
  const mainLabel = headstart ? 'Avance' : 'Temps restant';
  const mainValue = fmtClock((headstart ? game.huntStart : game.huntEnd) - game.clock);
  const toPing = game.nextPingAt !== null ? game.nextPingAt - game.clock : null;
  const pingFrac = toPing === null ? 0 : 1 - Math.min(1, toPing / (headstart ? game.huntStart : pingEvery));
  const zoneLine = !game.zone.enabled ? 'Pas de zone'
    : `${fmtDistance(game.zone.radiusM, units)}${game.zone.nextShrinkAt !== null ? ` · rétrécit dans ${fmtClock(game.zone.nextShrinkAt - game.clock)}` : ' · taille finale'}`;
  const bar = (frac: number) => (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: t.surface2, overflow: 'hidden' }}>
      <View style={{ width: `${Math.round(frac * 100)}%`, height: '100%', backgroundColor: t.text, borderRadius: 4 }} />
    </View>
  );
  return (
    <View style={{ backgroundColor: t.surface, borderRadius: radius.block + 4, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ flex: 1, padding: 16, borderRightWidth: 1, borderRightColor: t.line }}>
          <Text style={{ fontFamily: fonts.medium, fontSize: 15, color: t.textDim }}>{mainLabel}</Text>
          <Text style={{ fontFamily: fonts.displayBlack, fontSize: 42, color: t.text, fontVariant: ['tabular-nums'] }}>{mainValue}</Text>
        </View>
        <View style={{ flex: 1, padding: 16, gap: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontFamily: fonts.medium, fontSize: 15, color: t.textDim }}>Prochain ping</Text>
            <Text style={{ fontFamily: fonts.bold, fontSize: 15, color: t.text, fontVariant: ['tabular-nums'] }}>{toPing === null ? '--:--' : fmtClock(toPing)}</Text>
          </View>
          {bar(pingFrac)}
          <Text style={{ fontFamily: fonts.body, fontSize: 13, color: t.textDim }} numberOfLines={1}>{zoneLine}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: t.line }}>
        <Text style={{ fontFamily: fonts.medium, fontSize: 15, color: t.textDim }}>Fugitifs restants</Text>
        <View style={{ flex: 1 }}>{bar(game.fugitivesTotal ? game.fugitivesLeft / game.fugitivesTotal : 0)}</View>
        <Text style={{ fontFamily: fonts.bold, fontSize: 17, color: t.text }}>{game.fugitivesLeft} sur {game.fugitivesTotal}</Text>
      </View>
    </View>
  );
}

// ---------- Barre d'onglets ----------

function TabBar({ tab, onTab, onMore }: { tab: 'map' | 'radio'; onTab: (t: 'map' | 'radio') => void; onMore: () => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const unread = useStore(s => s.unread);
  const item = (key: 'map' | 'radio', label: string, Icon: typeof MapTrifoldIcon, badge?: number) => {
    const on = tab === key;
    return (
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onTab(key)}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radius.block, backgroundColor: on ? t.accentSoft : 'transparent', paddingVertical: 8 }}>
        <View>
          <Icon size={26} color={on ? t.accentText : t.textDim} weight={on ? 'bold' : 'regular'} />
          {!!badge && !on && (
            <View style={{ position: 'absolute', top: -6, right: -14, minWidth: 22, height: 22, borderRadius: 11, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }}>
              <Text style={{ fontFamily: fonts.bold, fontSize: 12, color: t.onAccent }}>{badge > 9 ? '9+' : badge}</Text>
            </View>
          )}
        </View>
        <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: on ? t.accentText : t.textDim, marginTop: 2 }}>{label}</Text>
      </Pressable>
    );
  };
  return (
    <View style={{ position: 'absolute', left: 12, right: 12, bottom: Math.max(insets.bottom, 12), flexDirection: 'row', gap: 10 }}>
      <View style={{ flex: 1, height: TAB_H, flexDirection: 'row', backgroundColor: t.surface, borderRadius: radius.block + 8, padding: 6, borderWidth: 1, borderColor: t.line }}>
        {item('map', 'Carte', MapTrifoldIcon)}
        {item('radio', 'Radio', BroadcastIcon, unread)}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Plus d'options" onPress={onMore}
        style={{ width: 72, height: TAB_H, borderRadius: radius.block + 8, backgroundColor: t.surface, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}>
        <DotsThreeIcon size={30} color={t.text} weight="bold" />
      </Pressable>
    </View>
  );
}

function RoundButton({ children, onPress, label, big, accent }: { children: React.ReactNode; onPress: () => void; label: string; big?: boolean; accent?: boolean }) {
  const t = useTheme();
  const size = big ? 68 : 52;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      style={({ pressed }) => ({
        width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center',
        backgroundColor: accent ? t.accent : t.surface, borderWidth: accent ? 0 : 1, borderColor: t.line,
        transform: [{ scale: pressed ? 0.95 : 1 }],
      })}>
      {children}
    </Pressable>
  );
}

// ---------- Flash « Ping ! » ----------

function PingFlash({ game }: { game: GameView }) {
  const t = useTheme();
  const opacity = useRef(new Animated.Value(0)).current;
  const lastAt = useRef<number | null>(game.ping?.at ?? null);

  useEffect(() => {
    const at = game.ping?.at ?? null;
    if (at === null || at === lastAt.current) return;
    lastAt.current = at;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    AccessibilityInfo.isReduceMotionEnabled().then(reduce => {
      opacity.setValue(reduce ? 1 : 0);
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: reduce ? 0 : 180, useNativeDriver: true }),
        Animated.delay(1200),
        Animated.timing(opacity, { toValue: 0, duration: reduce ? 0 : 500, useNativeDriver: true }),
      ]).start();
    });
  }, [game.ping?.at]);

  const n = game.ping?.players.length ?? 0;
  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', inset: 0, opacity, backgroundColor: 'rgba(110,18,8,0.88)', justifyContent: 'center', padding: 24 }}>
      <Text style={{ fontFamily: fonts.bold, fontSize: 18, color: '#FFB4A6', letterSpacing: 2 }}>
        {game.me.role === 'hunter' ? `${n} FUGITIF${n > 1 ? 'S' : ''} REPÉRÉ${n > 1 ? 'S' : ''}` : 'LES CHASSEURS SAVENT'}
      </Text>
      <Text style={{ fontFamily: fonts.displayBlack, fontSize: 96, color: t.onAccent, marginTop: 4 }}>Ping !</Text>
      <Text style={{ fontFamily: fonts.medium, fontSize: 17, color: '#FFD9D1', marginTop: 4 }}>
        {game.me.role === 'hunter' ? 'Positions de il y a 1 min.' : 'Ta position d’il y a 1 min est sur leur carte.'}
      </Text>
    </Animated.View>
  );
}

// ---------- Feuilles ----------

function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} onPress={onClose} accessibilityLabel="Fermer" />
      <View style={{ backgroundColor: t.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 10, paddingHorizontal: 16, paddingBottom: insets.bottom + 16, maxHeight: '85%' }}>
        <View style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: t.surface2, marginBottom: 14 }} />
        <Text style={{ fontFamily: fonts.displayBlack, fontSize: 26, color: t.text, marginBottom: 8 }}>{title}</Text>
        <ScrollView contentContainerStyle={{ gap: 12 }}>{children}</ScrollView>
      </View>
    </Modal>
  );
}

function MoreSheet({ game, visible, onClose, onQr }: { game: GameView; visible: boolean; onClose: () => void; onQr: () => void }) {
  const t = useTheme();
  const router = useRouter();
  const appearance = useStore(s => s.settings.appearance);
  const training = game.training && game.phase !== 'ended';
  const ctl = (body: { action: string; value?: number }) => {
    if (body.action !== 'speed') onClose(); // on ferme pour voir l'effet (flash, capture, fin)
    emit('training', body).catch(e => Alert.alert('Oups', e.message));
  };

  function quit() {
    Alert.alert('Quitter la partie ?', 'Tu ne pourras pas revenir dans cette manche.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Quitter', style: 'destructive', onPress: async () => { onClose(); await leaveGame(); router.replace('/'); } },
    ]);
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={training ? 'Contrôles de la démo' : 'Options'}>
      {training && <Text style={{ fontFamily: fonts.body, fontSize: 16, color: t.textDim }}>Une manche d'entraînement. Les autres joueurs sont des bots.</Text>}
      <Group>
        <Row title="Apparence" right={
          <Segmented value={appearance === 'light' ? 'light' : 'dark'} onChange={v => setState(s => ({ settings: { ...s.settings, appearance: v } }))}
            options={[{ value: 'light', label: 'Clair' }, { value: 'dark', label: 'Sombre' }]} />
        } />
      </Group>
      {game.me.role === 'fugitive' && !game.me.caught && game.phase !== 'ended' && (
        <Group><Row title="Montrer mon QR code" sub="À présenter au chasseur qui t'attrape" onPress={onQr} /></Group>
      )}
      {training && (
        <Group>
          <Row title="Lancer un ping" onPress={() => ctl({ action: 'ping' })} />
          {game.me.role === 'hunter' && <Row title="Attraper le fugitif le plus proche" onPress={() => ctl({ action: 'catchNearest' })} />}
          <Row title="Avancer d'une minute" onPress={() => ctl({ action: 'advance' })} />
          <Row title="Vitesse" right={
            <Segmented<number> value={game.speed} onChange={value => ctl({ action: 'speed', value })}
              options={[1, 5, 20].map(v => ({ value: v, label: `${v}×` }))} />
          } />
          <Row title="Terminer la manche" onPress={() => ctl({ action: 'end' })} />
        </Group>
      )}
      <Group><Row title="Quitter la partie" danger onPress={quit} /></Group>
    </Sheet>
  );
}

function QrSheet({ game, visible, onClose }: { game: GameView; visible: boolean; onClose: () => void }) {
  const t = useTheme();
  return (
    <Sheet visible={visible} onClose={onClose} title="Mon QR code">
      <Text style={{ fontFamily: fonts.body, fontSize: 16, color: t.textDim }}>
        Un chasseur t'a attrapé ? Montre-lui ce code : il le scanne et la capture est validée.
      </Text>
      <View style={{ alignSelf: 'center', backgroundColor: '#FFFFFF', padding: 20, borderRadius: radius.block, marginVertical: 8 }}>
        {game.me.qr ? <QRCode value={game.me.qr} size={240} /> : <Text>Pas de code disponible.</Text>}
      </View>
    </Sheet>
  );
}

// ---------- Fin ----------

function EndPanel({ game }: { game: GameView }) {
  const t = useTheme();
  const router = useRouter();
  const won = game.winner === game.me.role;
  return (
    <View style={{ position: 'absolute', inset: 0, backgroundColor: won ? t.accent : t.bg, justifyContent: 'flex-end', padding: 20, paddingBottom: 40 }}>
      <Text style={{ fontFamily: fonts.bold, fontSize: 18, color: won ? t.onAccent : t.textDim }}>
        {game.winner === 'hunter'
          ? 'Tous les fugitifs ont été attrapés.'
          : `${game.clock < game.huntEnd ? 'Manche terminée.' : 'Temps écoulé.'} ${game.fugitivesLeft} fugitif${game.fugitivesLeft > 1 ? 's' : ''} en liberté.`}
      </Text>
      <Text style={{ fontFamily: fonts.hero, fontSize: 104, lineHeight: 100, color: won ? t.onAccent : t.text, marginTop: 8 }}>
        {won ? 'Gagné.' : 'Perdu.'}
      </Text>
      <Text style={{ fontFamily: fonts.display, fontSize: 20, color: won ? t.onAccent : t.text, marginTop: 8, marginBottom: 32 }}>
        {game.winner === 'hunter' ? 'Victoire des chasseurs' : 'Victoire des fugitifs'}
      </Text>
      <Pressable accessibilityRole="button" onPress={async () => { await leaveGame(); router.replace('/'); }}
        style={{ height: 62, borderRadius: radius.block, alignItems: 'center', justifyContent: 'center', backgroundColor: won ? t.onAccent : t.accent }}>
        <Text style={{ fontFamily: fonts.bold, fontSize: 19, color: won ? '#161414' : t.onAccent }}>Retour à l'accueil</Text>
      </Pressable>
    </View>
  );
}
