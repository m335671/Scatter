import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Modal, PanResponder, Pressable, ScrollView, Text, View } from 'react-native';
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
import { Group, Row, Segmented, fmtClock, fmtDistance, showDialog } from '../ui';

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
/** Au-delà, la position d'un coéquipier n'est plus considérée comme « en direct ». */
const STALE_MS = 10_000;

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
      <RoleReveal game={game} />
      <MoreSheet game={game} visible={more} onClose={() => setMore(false)} onQr={() => { setMore(false); setQr(true); }} />
      <QrSheet game={game} visible={qr && !!game.me.qr} onClose={() => setQr(false)} />
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
  const live = game.outOfZone ?? [];
  const others = game.spectating.length ? game.spectating : [...(game.ping?.players ?? []).filter(p => !live.some(l => l.id === p.id)), ...live];
  const players = toFeatures(game, others);
  const mPerPx0 = 78_271.5 * Math.cos((zone.center.lat * Math.PI) / 180);

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
          {/* Halo de précision GPS autour d'une position signalée : la vraie position est dans ce cercle. */}
          <Layer type="circle" id="players-acc" filter={['all', ['!=', ['get', 'kind'], 'team'], ['>', ['get', 'acc'], 0]]} paint={{
            // Rayon de `acc` mètres en pixels : 78 271,5 m/px au zoom 0 (tuiles de 512 px), divisé par 2 par niveau.
            'circle-radius': ['interpolate', ['exponential', 2], ['zoom'],
              10, ['*', ['get', 'acc'], 2 ** 10 / mPerPx0],
              20, ['*', ['get', 'acc'], 2 ** 20 / mPerPx0]],
            'circle-color': ['match', ['get', 'kind'], 'exposed', t.accent, t.text],
            'circle-opacity': ['case', ['get', 'caught'], 0.04, 0.12],
            'circle-stroke-width': 1,
            'circle-stroke-color': ['match', ['get', 'kind'], 'exposed', t.accent, t.text],
            'circle-stroke-opacity': ['case', ['get', 'caught'], 0.1, 0.35],
          }} />
          {/* Coéquipier = point plein rouge. Position signalée = cible (anneau + point central exact). */}
          <Layer type="circle" id="players-dot" paint={{
            'circle-radius': ['interpolate', ['linear'], ['zoom'],
              13, ['match', ['get', 'kind'], 'team', 3, 4.5],
              18, ['match', ['get', 'kind'], 'team', 6, 8]],
            'circle-color': t.accent,
            'circle-opacity': ['match', ['get', 'kind'], 'team', ['case', ['get', 'caught'], 0.4, 1], 0],
            'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 13, 1.5, 18, 2.5],
            'circle-stroke-color': ['match', ['get', 'kind'], 'team', t.bg, 'exposed', t.accent, t.text],
            'circle-stroke-opacity': ['case', ['get', 'caught'], 0.4, 1],
          }} />
          <Layer type="circle" id="players-center" filter={['!=', ['get', 'kind'], 'team']} paint={{
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 1.5, 18, 2.5],
            'circle-color': ['match', ['get', 'kind'], 'exposed', t.accent, t.text],
            'circle-opacity': ['case', ['get', 'caught'], 0.4, 1],
          }} />
          {/* MapLibre place chaque étiquette du côté libre (gauche, droite, haut, bas) : pas de chevauchement. */}
          <Layer type="symbol" id="players-label" layout={{
            'text-field': ['get', 'label'],
            'text-font': ['Noto Sans Bold'],
            'text-size': ['interpolate', ['linear'], ['zoom'], 13, 10, 18, 13],
            'text-variable-anchor': ['left', 'right', 'top', 'bottom', 'top-left', 'top-right', 'bottom-left', 'bottom-right'],
            'text-radial-offset': 0.9,
            'text-justify': 'auto',
            'text-padding': 2,
          }} paint={{
            'text-color': ['match', ['get', 'kind'], 'exposed', t.accentText, t.text],
            'text-halo-color': t.bg,
            'text-halo-width': 1.5,
            'text-opacity': ['case', ['get', 'caught'], 0.5, 1],
          }} />
        </GeoJSONSource>
      </Map>

      <SafeAreaView edges={['top']} style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 12 }} pointerEvents="box-none">
        {game.phase === 'ended' ? <EndBanner game={game} /> : <Hud game={game} />}
        <Legend game={game} others={others} />
        {game.me.outOfZone && (
          <View style={{ marginTop: 8, backgroundColor: t.accent, borderRadius: radius.block, padding: 14 }}>
            <Text style={{ fontFamily: fonts.bold, fontSize: 16, color: t.onAccent }}>Tu es hors de la zone !</Text>
            <Text style={{ fontFamily: fonts.body, fontSize: 15, color: t.onAccent, marginTop: 2 }}>Les chasseurs te voient en direct tant que tu es dehors.</Text>
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
  if (game.phase === 'ended') {
    title = 'Partie terminée';
    sub = 'Tout le monde est visible sur la carte.';
  } else if (game.phase === 'headstart') {
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
    properties: { kind, label, caught: p.caught, acc: p.acc ?? 0 },
    geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
  });
  const ago = (p: SeenPlayer) => fmtClock(game.clock - p.t).replace(/^0/, '');
  return {
    type: 'FeatureCollection',
    features: [
      // Coéquipier sans nouvelle position depuis 10 s (réseau perdu) : estompé, avec l'âge de sa dernière position.
      ...game.team.filter(p => p.id !== game.me.id).map(p => {
        const stale = game.clock - p.t > STALE_MS;
        return feature({ ...p, caught: p.caught || stale }, 'team', stale ? `${p.name.toUpperCase()} ${ago(p)}` : p.name.toUpperCase());
      }),
      ...others.map(p => {
        const name = p.name.toUpperCase();
        if (p.caught) return feature(p, 'enemy', `${name} attrapé`);
        return feature(p, p.exposed ? 'exposed' : 'enemy', p.exposed ? `${name} hors zone · en direct` : `${name} ${ago(p)}`);
      }),
    ],
  };
}

/** Légende des symboles de la carte, uniquement pour ce qui est affiché. */
function Legend({ game, others }: { game: GameView; others: SeenPlayer[] }) {
  const t = useTheme();
  const hasTeam = game.team.some(p => p.id !== game.me.id);
  const hasExposed = others.some(p => p.exposed);
  if (!hasTeam && !others.length) return null;
  const enemyLabel = game.phase === 'ended'
    ? 'Équipe adverse, position actuelle'
    : game.spectating.length
    ? 'Adversaires en différé · NOM 1:06 = vu il y a 1 min 06'
    : `${game.me.role === 'hunter' ? 'Fugitif' : 'Chasseur'} au ping · NOM 1:06 = vu il y a 1 min 06`;
  const item = (symbol: React.ReactNode, label: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {symbol}
      <Text style={{ flexShrink: 1, fontFamily: fonts.medium, fontSize: 12, color: t.textDim }}>{label}</Text>
    </View>
  );
  const target = (color: string) => (
    <View style={{ width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: color, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: color }} />
    </View>
  );
  return (
    <View pointerEvents="none" style={{ marginTop: 8, alignSelf: 'flex-start', maxWidth: '100%', backgroundColor: t.surface, borderRadius: radius.inner, paddingHorizontal: 12, paddingVertical: 8, gap: 4 }}>
      {hasTeam && item(<View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.accent, marginHorizontal: 1 }} />, 'Ton équipe, en direct')}
      {others.length > 0 && item(target(t.text), enemyLabel)}
      {hasExposed && item(target(t.accent), 'Hors zone : visible en direct')}
      {others.length > 0 && item(<View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: t.text, opacity: 0.2 }} />, 'Halo : précision du GPS (visible en zoomant)')}
    </View>
  );
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
          <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: fonts.displayBlack, fontSize: 42, color: t.text, fontVariant: ['tabular-nums'] }}>{mainValue}</Text>
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
  const unread = useStore(s => s.unread.team + s.unread.all);
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
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: fonts.displayBlack, fontSize: 96, color: t.onAccent, marginTop: 4 }}>Ping !</Text>
      <Text style={{ fontFamily: fonts.medium, fontSize: 17, color: '#FFD9D1', marginTop: 4 }}>
        {game.me.role === 'hunter' ? 'Positions de il y a 1 min.' : 'Ta position d’il y a 1 min est sur leur carte.'}
      </Text>
    </Animated.View>
  );
}

// ---------- Révélation du rôle ----------

/** Parties dont le rôle a déjà été révélé (une fois par partie, même si l'écran est rouvert). */
const revealed = new Set<string>();

function RoleReveal({ game }: { game: GameView }) {
  const t = useTheme();
  const [show, setShow] = useState(() => game.phase !== 'ended' && !revealed.has(game.code));
  const p = useRef(new Animated.Value(0)).current;
  const hunter = game.me.role === 'hunter';

  useEffect(() => {
    if (!show) return;
    revealed.add(game.code);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    AccessibilityInfo.isReduceMotionEnabled().then(reduce => {
      Animated.sequence([
        Animated.timing(p, { toValue: 1, duration: reduce ? 0 : 450, useNativeDriver: true }),
        Animated.delay(1800),
        Animated.timing(p, { toValue: 2, duration: reduce ? 0 : 400, useNativeDriver: true }),
      ]).start(() => setShow(false));
    });
  }, []);

  if (!show) return null;
  const opacity = p.interpolate({ inputRange: [0, 0.3, 1, 1.6, 2], outputRange: [0, 1, 1, 1, 0] });
  const scale = p.interpolate({ inputRange: [0, 1, 2], outputRange: [0.7, 1, 1.08] });
  const fg = hunter ? t.onAccent : t.text;
  return (
    <Animated.View style={{ position: 'absolute', inset: 0, opacity, backgroundColor: hunter ? t.accent : t.bg, justifyContent: 'center', padding: 24 }}>
      <Text style={{ fontFamily: fonts.bold, fontSize: 18, color: fg, opacity: 0.85, letterSpacing: 2 }}>TU ES</Text>
      <Animated.Text numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: fonts.hero, fontSize: 120, lineHeight: 124, color: hunter ? fg : t.accent, transform: [{ scale }] }}>
        {hunter ? 'CHASSEUR' : 'FUGITIF'}
      </Animated.Text>
      <Text style={{ fontFamily: fonts.display, fontSize: 18, lineHeight: 24, color: fg, marginTop: 8 }}>
        {hunter ? 'Attrape tous les fugitifs avant la fin du temps.' : 'Ne te fais pas attraper jusqu\'à la fin.'}
      </Text>
    </Animated.View>
  );
}

// ---------- Feuilles ----------

/** Feuille du bas : se ferme en la tirant vers le bas (poignée et titre), en touchant le fond ou avec Retour. */
function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const drag = useRef(new Animated.Value(0)).current;
  useEffect(() => { if (visible) drag.setValue(0); }, [visible]);
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_, g) => drag.setValue(Math.max(0, g.dy)),
    onPanResponderRelease: (_, g) => {
      if (g.dy > 110 || g.vy > 1.2) Animated.timing(drag, { toValue: 800, duration: 180, useNativeDriver: true }).start(onClose);
      else Animated.spring(drag, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
    },
  }), [onClose]);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} onPress={onClose} accessibilityLabel="Fermer" />
      <Animated.View style={{ backgroundColor: t.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 16, paddingBottom: insets.bottom + 16, maxHeight: '85%', transform: [{ translateY: drag }] }}>
        <View {...pan.panHandlers} style={{ paddingTop: 10, paddingBottom: 8 }}>
          <View style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: t.surface2, marginBottom: 14 }} />
          <Text style={{ fontFamily: fonts.displayBlack, fontSize: 26, color: t.text }}>{title}</Text>
        </View>
        <ScrollView contentContainerStyle={{ gap: 12 }}>{children}</ScrollView>
      </Animated.View>
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
    emit('training', body).catch(e => showDialog({ title: 'Oups', message: e.message }));
  };

  function quit() {
    onClose();
    showDialog({
      title: 'Quitter la partie ?',
      message: 'Tu ne pourras pas revenir dans cette manche.',
      actions: [
        { label: 'Quitter', kind: 'danger', onPress: async () => { await leaveGame(); router.replace('/'); } },
        { label: 'Rester', kind: 'cancel' },
      ],
    });
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

/** Fin de partie : bandeau en haut de la carte, tout le monde visible dessous. */
function EndBanner({ game }: { game: GameView }) {
  const t = useTheme();
  const router = useRouter();
  const won = game.winner === game.me.role;
  const fg = won ? t.onAccent : t.text;
  return (
    <View style={{ backgroundColor: won ? t.accent : t.surface, borderRadius: radius.block + 4, padding: 18, gap: 4 }}>
      <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: won ? t.onAccent : t.textDim, opacity: 0.9 }}>
        {game.winner === 'hunter'
          ? 'Tous les fugitifs ont été attrapés.'
          : `${game.clock < game.huntEnd ? 'Manche terminée.' : 'Temps écoulé.'} ${game.fugitivesLeft} fugitif${game.fugitivesLeft > 1 ? 's' : ''} en liberté.`}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: fonts.hero, fontSize: 56, lineHeight: 58, color: fg }}>{won ? 'Gagné.' : 'Perdu.'}</Text>
          <Text style={{ fontFamily: fonts.display, fontSize: 16, color: fg }}>{game.winner === 'hunter' ? 'Victoire des chasseurs' : 'Victoire des fugitifs'}</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={async () => { await leaveGame(); router.replace('/'); }}
          style={({ pressed }) => ({ height: 48, paddingHorizontal: 18, borderRadius: radius.inner, justifyContent: 'center', backgroundColor: won ? t.onAccent : t.accent, opacity: pressed ? 0.85 : 1 })}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 16, color: won ? '#161414' : t.onAccent }}>Quitter</Text>
        </Pressable>
      </View>
    </View>
  );
}
