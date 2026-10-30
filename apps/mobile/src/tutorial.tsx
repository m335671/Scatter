// Tutoriel façon « stories » : vraie carte en fond (bâtiments 3D), éléments de jeu animés par-dessus.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import { Camera, Layer, Map, type CameraRef } from '@maplibre/maplibre-react-native';
import { useMapStyle } from './map-style';
import { fonts, radius } from './theme';

const STEP_MS = 6500;
// Toujours en sombre, aux couleurs de l'app.
const LIME = '#D4FF3A';
const ON_LIME = '#0F1712';
const DANGER = '#FF7A59';
const INK = '#E8EEE4';
const DIM = '#9DB09F';
const LINE = '#2C3B2F';
const SURFACE2 = '#1E2C23';
const BG = '#0F1712';
const CARD = 'rgba(21,32,26,0.95)';
// Lyon, Presqu'île : dense, lisible en 3D. Le décor ne dépend pas de la position du joueur.
const CENTER: [number, number] = [4.8335, 45.7605];

type Geo = { w: number; h: number; cx: number; cy: number; r: number };
type Pt = { x: number; y: number };
type StepProps = { p: Animated.Value; g: Geo };

/** tag : titre affiché sur la scène, au-dessus de la zone ; title + body : une ligne chacun, en bas. */
interface Step { tag: string; title: string; body: string; cam: { zoom: number; bearing: number; pitch: number }; Scene: (props: StepProps) => ReactNode }

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
const huntPos = (h: Pt, i: number) => ({ x: h.x * 4 + (i ? 0.1 : -0.1), y: h.y * 5 });

const steps: Step[] = [
  {
    tag: 'ZONE DE JEU', title: 'Une zone, de vraies rues.', body: "L'hôte la place autour de lui.",
    cam: { zoom: 15.6, bearing: -12, pitch: 35 },
    Scene: ({ p, g }) => (
      <>
        <Zone g={g} scale={p.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0.2, 1, 1], extrapolate: 'clamp' })} opacity={p.interpolate({ inputRange: [0, 0.15], outputRange: [0, 1], extrapolate: 'clamp' })} />
        <Radius g={g} p={p} />
      </>
    ),
  },
  {
    tag: "3 MIN D'AVANCE", title: 'Les fugitifs partent devant.', body: 'Les chasseurs attendent au centre.',
    cam: { zoom: 15.8, bearing: -4, pitch: 40 },
    Scene: ({ p, g }) => (
      <>
        <Zone g={g} />
        {FUGITIVES.map(f => <Dot key={f.name} g={g} kind="fugitive" label={f.name} from={{ x: 0, y: 0 }} to={f} p={p} />)}
        {HUNTERS.map(h => <Dot key={h.name} g={g} kind="team" label={h.name} from={{ x: h.x * 0.6, y: h.y * 0.6 }} to={{ x: h.x * 0.6, y: h.y * 0.6 }} p={p} />)}
        <Clock g={g} from={180} />
      </>
    ),
  },
  {
    tag: 'LA CHASSE', title: 'Puis la chasse commence.', body: "Tu vois ton équipe, jamais l'adversaire.",
    cam: { zoom: 16, bearing: 6, pitch: 45 },
    Scene: ({ p, g }) => (
      <>
        <Zone g={g} />
        {FUGITIVES.map(f => <Dot key={f.name} g={g} kind="fugitive" label={f.name} from={f} to={f} p={p} fadeOut />)}
        {FUGITIVES.map(f => <Dot key={`?${f.name}`} g={g} kind="unknown" label="?" from={f} to={f} p={p} appearAt={0.55} />)}
        {HUNTERS.map((h, i) => <Dot key={h.name} g={g} kind="team" label={h.name} from={{ x: 0, y: 0 }} to={huntPos(h, i)} p={p} />)}
      </>
    ),
  },
  {
    tag: 'PING · TOUTES LES 2 MIN', title: 'Ping : tout le monde est révélé.', body: "Un instant, chaque équipe voit l'autre.",
    cam: { zoom: 16, bearing: 14, pitch: 45 },
    Scene: ({ p, g }) => (
      <>
        <Zone g={g} />
        {HUNTERS.map((h, i) => <Dot key={h.name} g={g} kind="team" label={h.name} from={huntPos(h, i)} to={huntPos(h, i)} p={p} />)}
        {FUGITIVES.map(f => <Dot key={f.name} g={g} kind="target" label={`${f.name.toUpperCase()} 1:00`} from={f} to={f} p={p} appearAt={0.4} />)}
        <PingFlash p={p} />
      </>
    ),
  },
  {
    tag: "POSITION D'IL Y A 1 MIN", title: 'Avec 1 min de retard.', body: 'La cible montre où était le fugitif.',
    cam: { zoom: 17, bearing: 20, pitch: 50 },
    Scene: ({ p, g }) => <Lag p={p} g={g} />,
  },
  {
    tag: 'LA ZONE RÉTRÉCIT', title: 'Reste dans la zone.', body: 'Dehors : visible en direct, éliminé après 1 min.',
    cam: { zoom: 16, bearing: 10, pitch: 45 },
    Scene: ({ p, g }) => <Shrink p={p} g={g} />,
  },
  {
    tag: 'CAPTURE', title: 'Attrape, puis scanne.', body: 'Le QR du fugitif valide la capture.',
    cam: { zoom: 16.4, bearing: 0, pitch: 40 },
    Scene: ({ p, g }) => <Capture p={p} g={g} />,
  },
  {
    tag: 'RADIO', title: 'Parle à ton équipe… ou à tous.', body: 'Deux canaux : Équipe et Tous.',
    cam: { zoom: 15.8, bearing: 4, pitch: 35 },
    Scene: ({ p, g }) => <RadioScene p={p} g={g} />,
  },
  {
    tag: 'MODE ZOMBIE', title: 'Un chasseur contre tous.', body: 'Chaque fugitif attrapé change de camp.',
    cam: { zoom: 16, bearing: -6, pitch: 40 },
    Scene: ({ p, g }) => <Zombie p={p} g={g} />,
  },
  {
    tag: 'FIN DE PARTIE', title: "Tiens jusqu'au bout.", body: 'Tous attrapés : les chasseurs gagnent. Sinon, les fugitifs.',
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
  const mapStyle = useMapStyle(true);
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
      <Map style={{ position: 'absolute', inset: 0 }} mapStyle={mapStyle}
        logo={false} compass={false} attribution={false} dragPan={false} touchZoom={false} doubleTapZoom={false} touchRotate={false} touchPitch={false}>
        <Camera ref={camera} initialViewState={{ center: CENTER, ...steps[0].cam }} />
        <Layer type="fill-extrusion" id="tuto-buildings" source="openmaptiles" source-layer="building" paint={{
          'fill-extrusion-color': '#2B3C32',
          'fill-extrusion-height': ['get', 'render_height'],
          'fill-extrusion-base': ['get', 'render_min_height'],
          'fill-extrusion-opacity': 0.9,
        }} />
      </Map>
      {/* Voile sombre : le décor reste en arrière-plan, les éléments de jeu ressortent. */}
      <View pointerEvents="none" style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(15,23,18,0.35)' }} />

      <View style={{ position: 'absolute', inset: 0 }} onLayout={onLayout} pointerEvents="none">
        {g && <step.Scene key={i} p={p} g={g} />}
        {g && <Tag key={`t${i}`} g={g} p={p} text={step.tag} />}
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
              <View key={k} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(232,238,228,0.22)', overflow: 'hidden' }}>
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
        <View style={{ backgroundColor: CARD, borderRadius: radius.block + 4, paddingHorizontal: 20, paddingVertical: 18, gap: 4 }} pointerEvents="box-none">
          <Text style={{ fontFamily: fonts.hero, fontSize: 28, lineHeight: 31, color: INK }}>{step.title}</Text>
          <Text style={{ fontFamily: fonts.medium, fontSize: 16, lineHeight: 22, color: DIM }}>{step.body}</Text>
          {last && (
            <Pressable onPress={onDone} accessibilityRole="button" style={{ marginTop: 10, height: 56, borderRadius: radius.pill, backgroundColor: LIME, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: fonts.bold, fontSize: 18, color: ON_LIME }}>C'est parti</Text>
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
      borderWidth: 2.5, borderColor: red ? DANGER : LIME, borderStyle: 'dashed', backgroundColor: red ? 'rgba(255,122,89,0.14)' : 'rgba(212,255,58,0.07)',
      opacity, transform: [{ scale }],
    }} />
  );
}

/** Joueur animé de `from` vers `to` (fractions du rayon) pendant la première moitié de l'étape. */
function Dot({ g, kind, label, from, to, p, fadeOut, appearAt }: {
  g: Geo; kind: Kind; label: string; from: Pt; to: Pt; p: Animated.Value; fadeOut?: boolean; appearAt?: number;
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
      <View style={{ backgroundColor: 'rgba(15,23,18,0.88)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
        <Text style={{ fontFamily: fonts.bold, fontSize: 13, color: kind === 'exposed' || kind === 'zombie' ? DANGER : kind === 'unknown' ? DIM : INK }}>{label}</Text>
      </View>
    </Animated.View>
  );
}

type Kind = 'fugitive' | 'team' | 'target' | 'exposed' | 'unknown' | 'zombie';

/** Mêmes symboles que sur la carte en partie : point plein = équipe, cible = position signalée. */
function PlayerSymbol({ kind }: { kind: Kind }) {
  if (kind === 'unknown') return <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: DIM, borderStyle: 'dashed' }} />;
  if (kind === 'zombie') return <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: DANGER, borderWidth: 2.5, borderColor: BG }} />;
  if (kind === 'team') return <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: LIME, borderWidth: 2.5, borderColor: BG, margin: 1 }} />;
  if (kind === 'fugitive') return <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: INK, borderWidth: 2.5, borderColor: BG }} />;
  const c = kind === 'exposed' ? DANGER : INK;
  return (
    <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2.5, borderColor: c, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15,23,18,0.6)' }}>
      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: c }} />
    </View>
  );
}

/** Titre de l'étape, en pastille au-dessus de la zone : l'étape se comprend sans lire le bas. */
function Tag({ g, p, text }: { g: Geo; p: Animated.Value; text: string }) {
  return (
    <Animated.View style={{ position: 'absolute', left: 0, right: 0, top: g.cy - g.r - 54, alignItems: 'center',
      opacity: p.interpolate({ inputRange: [0, 0.06], outputRange: [0, 1], extrapolate: 'clamp' }),
      transform: [{ translateY: p.interpolate({ inputRange: [0, 0.06], outputRange: [8, 0], extrapolate: 'clamp' }) }] }}>
      <View style={{ backgroundColor: LIME, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 8 }}>
        <Text style={{ fontFamily: fonts.mono, fontSize: 14, letterSpacing: 1.5, color: ON_LIME }}>{text}</Text>
      </View>
    </Animated.View>
  );
}

/** Rayon de la zone, tracé du centre vers le bord. */
function Radius({ g, p }: StepProps) {
  const grow = p.interpolate({ inputRange: [0.35, 0.6], outputRange: [0, 1], extrapolate: 'clamp' });
  return (
    <>
      <Animated.View style={{ position: 'absolute', left: g.cx, top: g.cy - 1, width: g.r, height: 2, backgroundColor: LIME, transformOrigin: 'left', transform: [{ scaleX: grow }] }} />
      <View style={{ position: 'absolute', left: g.cx - 5, top: g.cy - 5, width: 10, height: 10, borderRadius: 5, backgroundColor: LIME }} />
      <Animated.Text style={{ position: 'absolute', left: g.cx + g.r * 0.25, top: g.cy - 30, fontFamily: fonts.mono, fontSize: 16, color: LIME, opacity: grow }}>420 m</Animated.Text>
    </>
  );
}

/** Compte à rebours de l'avance, au-dessus des chasseurs bloqués au centre. */
function Clock({ g, from }: { g: Geo; from: number }) {
  const [s, setS] = useState(from);
  useEffect(() => {
    const id = setInterval(() => setS(v => Math.max(0, v - 1)), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, top: g.cy + g.r * 0.22, alignItems: 'center' }}>
      <View style={{ backgroundColor: CARD, borderRadius: radius.inner, paddingHorizontal: 12, paddingVertical: 4 }}>
        <Text style={{ fontFamily: fonts.mono, fontSize: 22, color: INK }}>{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</Text>
      </View>
    </View>
  );
}

/** Zombie : Leo attrape Nina, Nina passe chasseuse. */
function Zombie({ p, g }: StepProps) {
  const nina = { x: -0.3, y: -0.2 };
  const burst = p.interpolate({ inputRange: [0.5, 0.75], outputRange: [0, 1], extrapolate: 'clamp' });
  const one = p.interpolate({ inputRange: [0.5, 0.55], outputRange: [1, 0], extrapolate: 'clamp' });
  const two = p.interpolate({ inputRange: [0.5, 0.55], outputRange: [0, 1], extrapolate: 'clamp' });
  return (
    <>
      <Zone g={g} />
      <Animated.View style={{ position: 'absolute', left: g.cx + nina.x * g.r - 40, top: g.cy + nina.y * g.r - 40, width: 80, height: 80, borderRadius: 40, borderWidth: 3, borderColor: DANGER,
        opacity: burst.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0, 1, 0] }), transform: [{ scale: burst.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1.6] }) }] }} />
      <Dot g={g} kind="zombie" label="Leo" from={{ x: 0.25, y: 0.35 }} to={{ x: -0.18, y: -0.08 }} p={p} />
      <Dot g={g} kind="fugitive" label="Nina" from={nina} to={nina} p={p} fadeOut />
      <Dot g={g} kind="zombie" label="Nina" from={nina} to={nina} p={p} appearAt={0.55} />
      {FUGITIVES.slice(1).map(f => <Dot key={f.name} g={g} kind="fugitive" label={f.name} from={f} to={f} p={p} />)}
      <View style={{ position: 'absolute', left: 0, right: 0, top: g.cy + g.r + 14, alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: CARD, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 6 }}>
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: DANGER }} />
          <View style={{ width: 112 }}>
            <Animated.Text numberOfLines={1} style={{ fontFamily: fonts.mono, fontSize: 14, color: INK, opacity: one }}>1 CHASSEUR</Animated.Text>
            <Animated.Text numberOfLines={1} style={{ position: 'absolute', left: 0, right: 0, fontFamily: fonts.mono, fontSize: 14, color: DANGER, opacity: two }}>2 CHASSEURS</Animated.Text>
          </View>
        </View>
      </View>
    </>
  );
}

function PingFlash({ p }: { p: Animated.Value }) {
  return (
    <Animated.View style={{ position: 'absolute', inset: 0, justifyContent: 'center', padding: 24, backgroundColor: LIME, opacity: p.interpolate({ inputRange: [0.08, 0.14, 0.32, 0.4], outputRange: [0, 1, 1, 0], extrapolate: 'clamp' }) }}>
      <Text style={{ fontFamily: fonts.mono, fontSize: 15, color: ON_LIME, opacity: 0.75, letterSpacing: 2 }}>4 FUGITIFS REPÉRÉS</Text>
      <Text style={{ fontFamily: fonts.hero, fontSize: 96, letterSpacing: -1.5, color: ON_LIME }}>Ping !</Text>
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
      <Animated.View style={{ position: 'absolute', left: g.cx + old.x * g.r - halo, top: g.cy + old.y * g.r - halo, width: halo * 2, height: halo * 2, borderRadius: halo, backgroundColor: 'rgba(232,238,228,0.12)', borderWidth: 1, borderColor: 'rgba(232,238,228,0.35)', opacity: p.interpolate({ inputRange: [0.05, 0.2], outputRange: [0, 1], extrapolate: 'clamp' }) }} />
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
  const out = { x: -0.35, y: -0.82 }; // au-dessus de la zone réduite : l'étiquette reste dans l'écran
  return (
    <>
      <Zone g={g} scale={scale} />
      <Dot g={g} kind="target" label="SASHA 0:20" from={{ x: -0.3, y: 0.25 }} to={{ x: -0.3, y: 0.25 }} p={p} />
      <Dot g={g} kind="exposed" label="TEO hors zone 0:42" from={out} to={out} p={p} appearAt={0.55} />
    </>
  );
}

function Capture({ p, g }: StepProps) {
  const size = g.w * 0.5;
  return (
    <Animated.View style={{ position: 'absolute', left: g.cx - size / 2 - 16, top: g.cy - size / 2 - 16, opacity: p.interpolate({ inputRange: [0, 0.12], outputRange: [0, 1], extrapolate: 'clamp' }) }}>
      <View style={{ backgroundColor: '#FFFFFF', padding: 16, borderRadius: radius.block }}>
        <QRCode value="KR1:DEMO:scatter" size={size} />
      </View>
      {/* Cadre de scan et ligne qui balaie le code, puis validation. */}
      <View style={{ position: 'absolute', inset: -10, borderWidth: 3, borderColor: LIME, borderRadius: radius.block + 6 }} />
      <Animated.View style={{ position: 'absolute', left: 6, right: 6, height: 3, backgroundColor: LIME, top: 10,
        opacity: p.interpolate({ inputRange: [0.15, 0.2, 0.6, 0.65], outputRange: [0, 1, 1, 0], extrapolate: 'clamp' }),
        transform: [{ translateY: p.interpolate({ inputRange: [0.2, 0.4, 0.6], outputRange: [0, size + 10, 0], extrapolate: 'clamp' }) }] }} />
      <Animated.View style={{ position: 'absolute', left: 0, right: 0, bottom: -64, alignItems: 'center', opacity: p.interpolate({ inputRange: [0.65, 0.72], outputRange: [0, 1], extrapolate: 'clamp' }) }}>
        <View style={{ backgroundColor: LIME, borderRadius: radius.pill, paddingHorizontal: 18, paddingVertical: 10 }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 16, color: ON_LIME }}>Capture validée</Text>
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
      {name && <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: DIM, marginLeft: 10 }}>{name}</Text>}
      <View style={{ backgroundColor: mine ? LIME : SURFACE2, borderRadius: radius.block, paddingHorizontal: 14, paddingVertical: 9, maxWidth: '82%' }}>
        <Text style={{ fontFamily: fonts.body, fontSize: 15, color: mine ? ON_LIME : INK }}>{text}</Text>
      </View>
    </Animated.View>
  );
  const seg = (label: string, on: Animated.AnimatedInterpolation<number>) => (
    <View style={{ flex: 1, height: 34, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', inset: 0, backgroundColor: LIME, borderRadius: radius.inner - 3, opacity: on }} />
      <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: INK }}>{label}</Text>
      <Animated.Text style={{ position: 'absolute', fontFamily: fonts.semibold, fontSize: 14, color: ON_LIME, opacity: on }}>{label}</Animated.Text>
    </View>
  );
  return (
    <Animated.View style={{ position: 'absolute', left: 16, right: 16, top: g.cy - 190, backgroundColor: CARD, borderRadius: radius.block + 4, padding: 16, gap: 12,
      opacity: p.interpolate({ inputRange: [0, 0.08], outputRange: [0, 1], extrapolate: 'clamp' }) }}>
      <Text style={{ fontFamily: fonts.hero, fontSize: 30, color: INK }}>Radio</Text>
      <View style={{ flexDirection: 'row', backgroundColor: SURFACE2, borderRadius: radius.inner, padding: 3 }}>
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
