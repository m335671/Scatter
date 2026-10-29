// Tutoriel façon « stories » : vraie carte en fond (bâtiments 3D), éléments de jeu animés par-dessus.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import { Camera, Layer, Map, type CameraRef } from '@maplibre/maplibre-react-native';
import { fonts, radius } from './theme';

const STEP_MS = 6500;
const RED = '#EE2E14';
const INK = '#F2F0EE';
const BG = '#121111';
const CARD = 'rgba(22,21,20,0.94)';
// Lyon, Presqu'île : dense, lisible en 3D. Le décor ne dépend pas de la position du joueur.
const CENTER: [number, number] = [4.8335, 45.7605];

type Geo = { w: number; h: number; cx: number; cy: number; r: number };
type StepProps = { p: Animated.Value; g: Geo };

interface Step { eyebrow: string; title: string; body: string; cam: { zoom: number; bearing: number; pitch: number }; Scene: (props: StepProps) => ReactNode }

// Positions finales des fugitifs, en fraction du rayon de la zone.
const FUGITIVES = [
  { name: 'Nina', x: -0.62, y: -0.42 },
  { name: 'Teo', x: 0.7, y: -0.22 },
  { name: 'Sasha', x: -0.45, y: 0.5 },
  { name: 'Toi', x: 0.38, y: 0.34 },
];
const HUNTERS = [
  { name: 'Leo', x: -0.12, y: 0.05 },
  { name: 'Ana', x: 0.12, y: -0.08 },
];

const steps: Step[] = [
  {
    eyebrow: 'La zone', title: "L'hôte trace la zone.", body: "Tout le monde joue à l'intérieur, dans de vraies rues.",
    cam: { zoom: 15.6, bearing: -12, pitch: 35 },
    Scene: ({ p, g }) => <Zone g={g} scale={p.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0.2, 1, 1], extrapolate: 'clamp' })} opacity={p.interpolate({ inputRange: [0, 0.15], outputRange: [0, 1], extrapolate: 'clamp' })} />,
  },
  {
    eyebrow: "L'avance", title: "Les fugitifs ont 3 min d'avance.", body: 'Les chasseurs patientent pendant que les fugitifs se dispersent et se cachent.',
    cam: { zoom: 15.8, bearing: -4, pitch: 40 },
    Scene: ({ p, g }) => (
      <>
        <Zone g={g} />
        <Hud label="Avance" from={180} p={p} right="Prochain ping" sub="Révèle tous les fugitifs" />
        {FUGITIVES.map(f => <Dot key={f.name} g={g} kind="fugitive" label={f.name} from={{ x: 0, y: 0 }} to={f} p={p} />)}
      </>
    ),
  },
  {
    eyebrow: 'La chasse', title: 'Puis les chasseurs sont lâchés.', body: "Chacun voit son équipe en direct sur la carte, mais pas l'équipe adverse.",
    cam: { zoom: 16, bearing: 6, pitch: 45 },
    Scene: ({ p, g }) => (
      <>
        <Zone g={g} />
        {FUGITIVES.map(f => <Dot key={f.name} g={g} kind="fugitive" label={f.name} from={f} to={f} p={p} fadeOut />)}
        {HUNTERS.map((h, i) => <Dot key={h.name} g={g} kind="team" label={h.name} from={{ x: 0, y: 0 }} to={{ x: h.x * 4 + (i ? 0.1 : -0.1), y: h.y * 5 }} p={p} />)}
      </>
    ),
  },
  {
    eyebrow: 'Le ping', title: 'Toutes les 2 min, un ping.', body: "Pendant un instant, chaque équipe voit l'autre sur la carte. Le téléphone vibre.",
    cam: { zoom: 16, bearing: 14, pitch: 45 },
    Scene: ({ p, g }) => (
      <>
        <Zone g={g} />
        {HUNTERS.map((h, i) => <Dot key={h.name} g={g} kind="team" label={h.name} from={{ x: h.x * 4 + (i ? 0.1 : -0.1), y: h.y * 5 }} to={{ x: h.x * 4 + (i ? 0.1 : -0.1), y: h.y * 5 }} p={p} />)}
        {FUGITIVES.map(f => <Dot key={f.name} g={g} kind="target" label={`${f.name.toUpperCase()} 1:00`} from={f} to={f} p={p} appearAt={0.4} />)}
        <PingFlash p={p} />
      </>
    ),
  },
  {
    eyebrow: 'Le décalage', title: "Les chasseurs ont 1 min de retard.", body: "La cible montre où était le fugitif il y a 1 min. Le halo autour, c'est la précision du GPS.",
    cam: { zoom: 17, bearing: 20, pitch: 50 },
    Scene: ({ p, g }) => <Lag p={p} g={g} />,
  },
  {
    eyebrow: 'La zone rétrécit', title: 'Reste dans la zone.', body: "Dehors, les chasseurs te voient en direct, et après 1 min tu es éliminé. Ton téléphone te prévient quand tu approches du bord.",
    cam: { zoom: 16, bearing: 10, pitch: 45 },
    Scene: ({ p, g }) => <Shrink p={p} g={g} />,
  },
  {
    eyebrow: 'La capture', title: 'Attrape, puis scanne.', body: 'Le fugitif montre son QR code, le chasseur le scanne : la capture est validée.',
    cam: { zoom: 16.4, bearing: 0, pitch: 40 },
    Scene: ({ p, g }) => <Capture p={p} g={g} />,
  },
  {
    eyebrow: 'La radio', title: 'Deux canaux pour parler.', body: "« Équipe » : seuls tes coéquipiers t'entendent. « Tous » : les deux équipes, pour chambrer ou bluffer.",
    cam: { zoom: 15.8, bearing: 4, pitch: 35 },
    Scene: ({ p, g }) => <RadioScene p={p} g={g} />,
  },
  {
    eyebrow: 'Mode zombie', title: 'Un chasseur contre tous.', body: "En mode zombie, un seul chasseur au départ. Chaque fugitif attrapé devient chasseur à son tour.",
    cam: { zoom: 16, bearing: -6, pitch: 40 },
    Scene: ({ p, g }) => {
      const nina = { x: -0.3, y: -0.2 };
      return (
        <>
          <Zone g={g} />
          <Dot g={g} kind="team" label="Leo" from={{ x: 0.2, y: 0.3 }} to={{ x: -0.2, y: -0.1 }} p={p} />
          <Dot g={g} kind="fugitive" label="Nina" from={nina} to={nina} p={p} fadeOut />
          <Dot g={g} kind="team" label="Nina" from={nina} to={nina} p={p} appearAt={0.55} />
          {FUGITIVES.slice(1).map(f => <Dot key={f.name} g={g} kind="fugitive" label={f.name} from={f} to={f} p={p} />)}
        </>
      );
    },
  },
  {
    eyebrow: 'La fin', title: "Tiens jusqu'au bout.", body: "Les chasseurs gagnent s'ils attrapent tout le monde. Sinon, les fugitifs encore libres l'emportent.",
    cam: { zoom: 15.4, bearing: -8, pitch: 30 },
    Scene: ({ p }) => (
      <Animated.View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', opacity: p.interpolate({ inputRange: [0, 0.2], outputRange: [0, 1], extrapolate: 'clamp' }), transform: [{ scale: p.interpolate({ inputRange: [0, 0.25], outputRange: [0.85, 1], extrapolate: 'clamp' }) }] }}>
        <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: fonts.hero, fontSize: 120, color: INK, marginTop: -120, paddingHorizontal: 24 }}>Gagné.</Text>
      </Animated.View>
    ),
  },
];

export function Tutorial({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const [g, setG] = useState<Geo | null>(null);
  const p = useRef(new Animated.Value(0)).current;
  const camera = useRef<CameraRef>(null);
  const step = steps[i];

  useEffect(() => {
    let alive = true;
    p.setValue(0);
    camera.current?.easeTo({ center: CENTER, ...step.cam, duration: 1800 });
    AccessibilityInfo.isReduceMotionEnabled().then(reduce => {
      if (!alive) return;
      if (reduce) p.setValue(1); // états finaux directement, le minuteur reste
      Animated.timing(p, { toValue: 1, duration: reduce ? 0 : STEP_MS, easing: Easing.linear, useNativeDriver: true }).start();
    });
    const id = setTimeout(() => (i < steps.length - 1 ? setI(i + 1) : undefined), STEP_MS);
    return () => { alive = false; clearTimeout(id); p.stopAnimation(); };
  }, [i]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    setG({ w, h, cx: w / 2, cy: h * 0.44, r: w * 0.44 });
  };

  const last = i === steps.length - 1;

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <Map style={{ position: 'absolute', inset: 0 }} mapStyle="https://tiles.openfreemap.org/styles/dark"
        logo={false} compass={false} attribution={false} dragPan={false} touchZoom={false} doubleTapZoom={false} touchRotate={false} touchPitch={false}>
        <Camera ref={camera} initialViewState={{ center: CENTER, ...steps[0].cam }} />
        <Layer type="fill-extrusion" id="tuto-buildings" source="openmaptiles" source-layer="building" paint={{
          'fill-extrusion-color': '#4a4643',
          'fill-extrusion-height': ['get', 'render_height'],
          'fill-extrusion-base': ['get', 'render_min_height'],
          'fill-extrusion-opacity': 0.9,
        }} />
      </Map>
      {/* Voile sombre : le décor reste en arrière-plan, les éléments de jeu ressortent. */}
      <View pointerEvents="none" style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(18,17,17,0.35)' }} />

      <View style={{ position: 'absolute', inset: 0 }} onLayout={onLayout} pointerEvents="none">
        {g && <step.Scene key={i} p={p} g={g} />}
      </View>

      {/* Zones de tap : gauche = précédent, reste = suivant. */}
      <View style={{ position: 'absolute', inset: 0, flexDirection: 'row' }}>
        <Pressable style={{ flex: 1 }} onPress={() => setI(Math.max(0, i - 1))} accessibilityLabel="Étape précédente" />
        <Pressable style={{ flex: 2 }} onPress={() => (last ? onDone() : setI(i + 1))} accessibilityLabel="Étape suivante" />
      </View>

      <SafeAreaView edges={['top']} style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 12 }} pointerEvents="box-none">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: CARD, borderRadius: radius.block, paddingLeft: 16, paddingRight: 8, height: 52 }}>
          <View style={{ flex: 1, flexDirection: 'row', gap: 5 }}>
            {steps.map((_, k) => (
              <View key={k} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(242,240,238,0.22)', overflow: 'hidden' }}>
                {k < i && <View style={{ flex: 1, backgroundColor: INK }} />}
                {k === i && <Animated.View style={{ flex: 1, backgroundColor: INK, transformOrigin: 'left', transform: [{ scaleX: p }] }} />}
              </View>
            ))}
          </View>
          <Pressable onPress={onDone} hitSlop={10} accessibilityRole="button" style={{ paddingHorizontal: 8, height: 44, justifyContent: 'center' }}>
            <Text style={{ fontFamily: fonts.bold, fontSize: 17, color: INK }}>Passer</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      <SafeAreaView edges={['bottom']} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 12, paddingBottom: 8 }} pointerEvents="box-none">
        <View style={{ backgroundColor: CARD, borderRadius: radius.block + 4, padding: 22, gap: 8 }} pointerEvents="box-none">
          <Text style={{ fontFamily: fonts.bold, fontSize: 13, color: '#FF6A4D', letterSpacing: 1.2 }}>{step.eyebrow.toUpperCase()}</Text>
          <Text style={{ fontFamily: fonts.displayBlack, fontSize: 26, lineHeight: 31, color: INK }}>{step.title}</Text>
          <Text style={{ fontFamily: fonts.body, fontSize: 16, lineHeight: 22, color: '#B3AEAA' }}>{step.body}</Text>
          {last && (
            <Pressable onPress={onDone} accessibilityRole="button" style={{ marginTop: 10, height: 56, borderRadius: radius.block, backgroundColor: RED, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: fonts.bold, fontSize: 18, color: '#FFF7F4' }}>C'est parti</Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

// ---------- Éléments de scène ----------

function Zone({ g, scale = 1, opacity = 1, red }: { g: Geo; scale?: number | Animated.AnimatedInterpolation<number>; opacity?: number | Animated.AnimatedInterpolation<number>; red?: boolean }) {
  return (
    <Animated.View style={{
      position: 'absolute', left: g.cx - g.r, top: g.cy - g.r, width: g.r * 2, height: g.r * 2, borderRadius: g.r,
      borderWidth: 2.5, borderColor: RED, backgroundColor: red ? 'rgba(238,46,20,0.12)' : 'rgba(238,46,20,0.06)',
      opacity, transform: [{ scale }],
    }} />
  );
}

type Pt = { x: number; y: number };

/** Joueur animé de `from` vers `to` (fractions du rayon) pendant la première moitié de l'étape. */
function Dot({ g, kind, label, from, to, p, fadeOut, appearAt }: {
  g: Geo; kind: 'fugitive' | 'team' | 'target' | 'exposed'; label: string; from: Pt; to: Pt; p: Animated.Value; fadeOut?: boolean; appearAt?: number;
}) {
  const move = (a: number, b: number) => p.interpolate({ inputRange: [0, 0.5], outputRange: [a * g.r, b * g.r], extrapolate: 'clamp', easing: Easing.out(Easing.cubic) });
  const opacity = fadeOut
    ? p.interpolate({ inputRange: [0, 0.35, 0.55], outputRange: [1, 1, 0], extrapolate: 'clamp' })
    : appearAt !== undefined
      ? p.interpolate({ inputRange: [appearAt - 0.05, appearAt + 0.05], outputRange: [0, 1], extrapolate: 'clamp' })
      : 1;
  return (
    <Animated.View style={{ position: 'absolute', left: g.cx, top: g.cy, flexDirection: 'row', alignItems: 'center', gap: 6, opacity, transform: [{ translateX: move(from.x, to.x) }, { translateY: move(from.y, to.y) }, { translateX: -9 }, { translateY: -9 }] }}>
      <PlayerSymbol kind={kind} />
      <View style={{ backgroundColor: 'rgba(18,17,17,0.85)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
        <Text style={{ fontFamily: fonts.bold, fontSize: 13, color: kind === 'exposed' ? '#FF6A4D' : INK }}>{label}</Text>
      </View>
    </Animated.View>
  );
}

/** Mêmes symboles que sur la carte en partie : point plein = équipe, cible = position signalée. */
function PlayerSymbol({ kind }: { kind: 'fugitive' | 'team' | 'target' | 'exposed' }) {
  if (kind === 'team') return <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: RED, borderWidth: 2.5, borderColor: BG, margin: 1 }} />;
  if (kind === 'fugitive') return <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: INK, borderWidth: 2.5, borderColor: BG }} />;
  const c = kind === 'exposed' ? RED : INK;
  return (
    <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2.5, borderColor: c, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(18,17,17,0.6)' }}>
      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: c }} />
    </View>
  );
}

function Hud({ label, from, p, right, sub }: { label: string; from: number; p: Animated.Value; right: string; sub: string }) {
  const [s, setS] = useState(from);
  useEffect(() => {
    const id = setInterval(() => setS(v => Math.max(0, v - 1)), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <Animated.View style={{ position: 'absolute', top: 120, left: 12, right: 12, flexDirection: 'row', backgroundColor: CARD, borderRadius: radius.block, opacity: p.interpolate({ inputRange: [0, 0.1], outputRange: [0, 1], extrapolate: 'clamp' }) }}>
      <View style={{ flex: 1, padding: 14, borderRightWidth: 1, borderRightColor: '#2F2D2B' }}>
        <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: '#9A9591' }}>{label}</Text>
        <Text style={{ fontFamily: fonts.displayBlack, fontSize: 32, color: INK, fontVariant: ['tabular-nums'] }}>{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</Text>
      </View>
      <View style={{ flex: 1, padding: 14, gap: 8 }}>
        <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: '#9A9591' }}>{right}</Text>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: '#2A2827' }} />
        <Text style={{ fontFamily: fonts.body, fontSize: 12, color: '#9A9591' }}>{sub}</Text>
      </View>
    </Animated.View>
  );
}

function PingFlash({ p }: { p: Animated.Value }) {
  return (
    <Animated.View style={{ position: 'absolute', inset: 0, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(110,18,8,0.86)', opacity: p.interpolate({ inputRange: [0.08, 0.14, 0.32, 0.4], outputRange: [0, 1, 1, 0], extrapolate: 'clamp' }) }}>
      <Text style={{ fontFamily: fonts.bold, fontSize: 16, color: '#FFB4A6', letterSpacing: 2 }}>4 FUGITIFS REPÉRÉS</Text>
      <Text style={{ fontFamily: fonts.displayBlack, fontSize: 88, color: '#FFF7F4' }}>Ping !</Text>
    </Animated.View>
  );
}

/** Le fugitif a bougé depuis le ping : la cible reste à l'ancienne position, le vrai joueur est ailleurs. */
function Lag({ p, g }: StepProps) {
  const old = { x: -0.25, y: 0.05 };
  const now = { x: 0.45, y: -0.35 };
  const halo = g.r * 0.32;
  const ghostOpacity = p.interpolate({ inputRange: [0.3, 0.45], outputRange: [0, 0.55], extrapolate: 'clamp' });
  return (
    <>
      <Zone g={g} />
      <Animated.View style={{ position: 'absolute', left: g.cx + old.x * g.r - halo, top: g.cy + old.y * g.r - halo, width: halo * 2, height: halo * 2, borderRadius: halo, backgroundColor: 'rgba(242,240,238,0.12)', borderWidth: 1, borderColor: 'rgba(242,240,238,0.35)', opacity: p.interpolate({ inputRange: [0.05, 0.2], outputRange: [0, 1], extrapolate: 'clamp' }) }} />
      <Dot g={g} kind="target" label="NINA 1:00" from={old} to={old} p={p} />
      {/* Où est vraiment Nina maintenant : ce que les chasseurs ne voient pas. */}
      <Animated.View style={{ position: 'absolute', left: g.cx, top: g.cy, opacity: ghostOpacity, transform: [
        { translateX: p.interpolate({ inputRange: [0.3, 0.9], outputRange: [old.x * g.r, now.x * g.r], extrapolate: 'clamp' }) },
        { translateY: p.interpolate({ inputRange: [0.3, 0.9], outputRange: [old.y * g.r, now.y * g.r], extrapolate: 'clamp' }) },
        { translateX: -9 }, { translateY: -9 }] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: INK, borderStyle: 'dashed' }} />
          <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: INK }}>maintenant ?</Text>
        </View>
      </Animated.View>
    </>
  );
}

function Shrink({ p, g }: StepProps) {
  const scale = p.interpolate({ inputRange: [0.05, 0.45], outputRange: [1, 0.62], extrapolate: 'clamp', easing: Easing.inOut(Easing.cubic) });
  const out = { x: 0.1, y: -0.82 }; // au-dessus de la zone réduite : l'étiquette reste dans l'écran
  return (
    <>
      <Zone g={g} scale={scale} />
      <Dot g={g} kind="target" label="SASHA 0:20" from={{ x: -0.3, y: 0.25 }} to={{ x: -0.3, y: 0.25 }} p={p} />
      <Dot g={g} kind="exposed" label="TEO hors zone · éliminé dans 0:42" from={out} to={out} p={p} appearAt={0.55} />
    </>
  );
}

function Capture({ p, g }: StepProps) {
  const size = g.w * 0.5;
  return (
    <Animated.View style={{ position: 'absolute', left: g.cx - size / 2 - 16, top: g.cy - size / 2 - 16, opacity: p.interpolate({ inputRange: [0, 0.12], outputRange: [0, 1], extrapolate: 'clamp' }) }}>
      <View style={{ backgroundColor: '#FFFFFF', padding: 16, borderRadius: radius.block }}>
        <QRCode value="KR1:DEMO:keep-runnin" size={size} />
      </View>
      {/* Cadre de scan et ligne qui balaie le code, puis validation. */}
      <View style={{ position: 'absolute', inset: -10, borderWidth: 3, borderColor: RED, borderRadius: radius.block + 6 }} />
      <Animated.View style={{ position: 'absolute', left: 6, right: 6, height: 3, backgroundColor: RED, top: 10,
        opacity: p.interpolate({ inputRange: [0.15, 0.2, 0.6, 0.65], outputRange: [0, 1, 1, 0], extrapolate: 'clamp' }),
        transform: [{ translateY: p.interpolate({ inputRange: [0.2, 0.4, 0.6], outputRange: [0, size + 10, 0], extrapolate: 'clamp' }) }] }} />
      <Animated.View style={{ position: 'absolute', left: 0, right: 0, bottom: -64, alignItems: 'center', opacity: p.interpolate({ inputRange: [0.65, 0.72], outputRange: [0, 1], extrapolate: 'clamp' }) }}>
        <View style={{ backgroundColor: RED, borderRadius: radius.inner, paddingHorizontal: 16, paddingVertical: 10 }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 16, color: '#FFF7F4' }}>Capture validée</Text>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

/** La radio : canal équipe puis bascule sur le canal global. */
function RadioScene({ p, g }: StepProps) {
  const appear = (from: number) => ({
    opacity: p.interpolate({ inputRange: [from, from + 0.06], outputRange: [0, 1], extrapolate: 'clamp' }),
    transform: [{ translateY: p.interpolate({ inputRange: [from, from + 0.06], outputRange: [12, 0], extrapolate: 'clamp' }) }],
  });
  const teamOn = p.interpolate({ inputRange: [0.48, 0.52], outputRange: [1, 0], extrapolate: 'clamp' });
  const allOn = p.interpolate({ inputRange: [0.48, 0.52], outputRange: [0, 1], extrapolate: 'clamp' });
  const bubble = (text: string, mine: boolean, from: number, name?: string) => (
    <Animated.View key={text} style={[{ alignItems: mine ? 'flex-end' : 'flex-start', gap: 4 }, appear(from)]}>
      {name && <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: '#9A9591', marginLeft: 10 }}>{name}</Text>}
      <View style={{ backgroundColor: mine ? RED : '#2A2827', borderRadius: radius.block, paddingHorizontal: 14, paddingVertical: 9, maxWidth: '82%' }}>
        <Text style={{ fontFamily: fonts.body, fontSize: 15, color: INK }}>{text}</Text>
      </View>
    </Animated.View>
  );
  const seg = (label: string, on: Animated.AnimatedInterpolation<number>) => (
    <View style={{ flex: 1, height: 34, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', inset: 0, backgroundColor: RED, borderRadius: radius.inner - 3, opacity: on }} />
      <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: INK }}>{label}</Text>
    </View>
  );
  return (
    <Animated.View style={{ position: 'absolute', left: 16, right: 16, top: g.cy - 190, backgroundColor: CARD, borderRadius: radius.block + 4, padding: 16, gap: 12,
      opacity: p.interpolate({ inputRange: [0, 0.08], outputRange: [0, 1], extrapolate: 'clamp' }) }}>
      <Text style={{ fontFamily: fonts.displayBlack, fontSize: 28, color: INK }}>Radio</Text>
      <View style={{ flexDirection: 'row', backgroundColor: '#2A2827', borderRadius: radius.inner, padding: 3 }}>
        {seg('Équipe', teamOn)}
        {seg('Tous', allOn)}
      </View>
      <View style={{ height: 190 }}>
        <Animated.View style={{ position: 'absolute', inset: 0, gap: 10, justifyContent: 'flex-end', opacity: teamOn }}>
          {bubble('Je prends le stade, toi la rue des Figuiers.', false, 0.1, 'Leo')}
          {bubble("J'en vois un !", true, 0.25)}
        </Animated.View>
        <Animated.View style={{ position: 'absolute', inset: 0, gap: 10, justifyContent: 'flex-end', opacity: allOn }}>
          {bubble('Vous ne nous aurez pas', false, 0.56, 'Nina (fugitive)')}
          {bubble('On verra au prochain ping', true, 0.72)}
        </Animated.View>
      </View>
    </Animated.View>
  );
}
