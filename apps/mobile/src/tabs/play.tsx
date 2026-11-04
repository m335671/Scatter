// Onglet Jouer : la carte autour de toi en fond, et deux actions : créer une partie, ou en rejoindre une avec un code.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, AppState, Dimensions, Easing, Pressable, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { Camera, GeoJSONSource, Layer, Map } from '@maplibre/maplibre-react-native';
import { CaretRightIcon, MapPinIcon, ScanIcon } from '../icons';
import { defaultRules, type LatLng } from '@kr/shared';
import { emit, leaveGame } from '../api';
import { askLocation, currentPosition, zonePosition } from '../location';
import { Mark } from '../logo';
import { useMapStyle } from '../map-style';
import { useRecords } from '../stats';
import { useStore } from '../store';
import { fonts, radius, useTheme } from '../theme';
import { Button, fmtClock, haptic, showDialog, useKeyboardHeight } from '../ui';
import { circle, zoomFor } from '../zone';

const START_RADIUS = defaultRules({ lat: 0, lng: 0 }).zone.startRadiusM;

/** En-tête : résumé de la dernière partie (entraînement compris), qui mène à l'onglet Activité. */
function LastGame({ onPress, disabled }: { onPress: () => void; disabled: boolean }) {
  const t = useTheme();
  const records = useRecords();
  const last = records[0];
  const wins = records.filter(r => !r.training && r.won).length;
  const games = records.filter(r => !r.training).length;
  const box = { alignItems: 'flex-end', gap: 2, backgroundColor: t.bg, borderRadius: radius.inner, paddingHorizontal: 12, paddingVertical: 8, flexShrink: 1 } as const;
  if (!last) {
    return (
      <View style={box}>
        <Text style={{ fontFamily: fonts.monoMedium, fontSize: 11, letterSpacing: 1, color: t.textDim }}>AUCUNE PARTIE</Text>
        <Text style={{ fontFamily: fonts.mono, fontSize: 14, color: t.accentText }}>à toi de jouer</Text>
      </View>
    );
  }
  const days = Math.round((startOfDay(Date.now()) - startOfDay(last.date)) / 86_400_000);
  const when = days === 0 ? "AUJOURD'HUI" : days === 1 ? 'HIER'
    : new Date(last.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }).toUpperCase();
  const result = last.role === 'fugitive'
    ? (last.caught ? `Attrapé ${fmtClock(last.survivedMs)}` : `Survécu ${fmtClock(last.survivedMs)}`)
    : `${last.captures} capture${last.captures > 1 ? 's' : ''}`;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Dernière partie : ${result}. Voir l'activité`} onPress={onPress} hitSlop={8} disabled={disabled}
      style={({ pressed }) => ({ ...box, opacity: pressed || disabled ? 0.6 : 1 })}>
      <Text numberOfLines={1} style={{ fontFamily: fonts.monoMedium, fontSize: 11, letterSpacing: 1, color: t.textDim }}>
        {last.training ? 'ENTRAÎNEMENT' : 'DERNIÈRE'} · {when}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text numberOfLines={1} style={{ fontFamily: fonts.mono, fontSize: 15, color: t.text }}>{result}</Text>
        <View style={{ borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1, backgroundColor: last.won ? t.accent : 'transparent', borderWidth: last.won ? 0 : 1, borderColor: t.line }}>
          <Text style={{ fontFamily: fonts.mono, fontSize: 10, color: last.won ? t.onAccent : t.textDim }}>{last.won ? 'GAGNÉ' : 'PERDU'}</Text>
        </View>
      </View>
      {games > 0 && <Text style={{ fontFamily: fonts.monoMedium, fontSize: 11, color: t.textDim }}>{wins}/{games} VICTOIRES</Text>}
    </Pressable>
  );
}

const startOfDay = (ms: number) => new Date(ms).setHours(0, 0, 0, 0);

/**
 * Clavier ouvert : seul le panneau d'actions remonte juste au-dessus, la carte et l'en-tête ne bougent pas.
 * Si le téléphone redimensionne déjà la fenêtre, le panneau est déjà au-dessus : rien à faire.
 */
function useLiftAboveKeyboard() {
  const kb = useKeyboardHeight();
  const ref = useRef<React.ComponentRef<typeof View>>(null);
  const lift = useRef(new Animated.Value(0)).current;
  const to = useRef(0);
  useEffect(() => {
    ref.current?.measureInWindow((_x, y, _w, h) => {
      const bottom = y + h - to.current; // bas du panneau au repos
      to.current = kb ? Math.min(0, Dimensions.get('screen').height - kb - 12 - bottom) : 0;
      Animated.timing(lift, { toValue: to.current, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    });
  }, [kb]);
  return { ref, style: { transform: [{ translateY: lift }] } };
}

export function PlayTab({ onActivity, onBusy }: { onActivity: () => void; onBusy: (busy: boolean) => void }) {
  const t = useTheme();
  const router = useRouter();
  const connected = useStore(s => s.connected);
  const lobby = useStore(s => s.lobby);
  const phase = useStore(s => s.game?.phase);
  const [busy, setBusyState] = useState<'create' | 'train' | 'join' | null>(null);
  const [code, setCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const here = useHere();
  const panel = useLiftAboveKeyboard();
  // Verrou synchrone : deux appuis rapides passeraient avant que l'état `busy` ne soit rendu.
  const lock = useRef(false);
  const setBusy = (b: typeof busy) => { lock.current = !!b; setBusyState(b); onBusy(!!b); };

  async function create(training: boolean) {
    if (lock.current) return;
    setBusy(training ? 'train' : 'create');
    try {
      const center = await zonePosition();
      await emit('create', { rules: defaultRules(center), training });
      router.push('/lobby');
    } catch (e) {
      showDialog({ title: 'Impossible de créer la partie', message: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function join() {
    if (lock.current) return;
    setBusy('join');
    setJoinError('');
    try {
      await emit('join', { code });
      haptic.success();
      setCode('');
      router.push('/lobby');
      askLocation().catch(() => {}); // demandée dans le salon, sans retarder l'arrivée
    } catch (e) {
      haptic.error();
      setJoinError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const inGame = phase === 'headstart' || phase === 'hunt';
  // Déjà dans une vraie partie (salon ou manche) : on y retourne ou on la quitte, mais pas de nouvelle partie par-dessus.
  const engaged = !!lobby && !lobby.training && phase !== 'ended';
  const off = !connected || !!busy || engaged;

  function quit() {
    showDialog({
      title: inGame ? 'Quitter la partie ?' : 'Quitter le salon ?',
      message: inGame
        ? "C'est définitif : tu ne pourras pas revenir dans cette partie. Un fugitif qui quitte compte comme attrapé."
        : 'Tu pourras revenir avec le code tant que la partie n’a pas commencé.',
      actions: [{ label: 'Quitter', kind: 'danger', onPress: () => { leaveGame(); } }, { label: 'Annuler', kind: 'cancel' }],
    });
  }

  return (
    <View style={{ flex: 1 }}>
      {/* La carte autour de toi en fond : on joue dans de vraies rues. */}
      <HereMap here={here} radiusM={START_RADIUS} />

      <View pointerEvents="box-none" style={{ flex: 1, paddingHorizontal: 16, paddingTop: 8, gap: 12 }}>
        <View pointerEvents="box-none" style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <View pointerEvents="none" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: t.bg, borderRadius: radius.pill, paddingLeft: 10, paddingRight: 16, paddingVertical: 8 }}>
            <Mark size={28} color={t.text} dot={t.dark ? t.accent : t.text} />
            <Text accessibilityRole="header" style={{ fontFamily: fonts.hero, fontSize: 24, color: t.text, letterSpacing: -0.5 }}>scatter</Text>
          </View>
          <LastGame onPress={onActivity} disabled={!!busy} />
        </View>

        {/* Seules les vraies parties, en cours ou en salon, sont proposées : pas les entraînements ni les parties finies. */}
        {engaged && (
          <View style={{ backgroundColor: t.surface, borderWidth: 1, borderColor: t.line, borderRadius: radius.block, overflow: 'hidden' }}>
            <Pressable onPress={() => router.push(inGame ? '/game' : '/lobby')}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, opacity: pressed ? 0.85 : 1 })}>
              <View style={{ gap: 2 }}>
                <Text style={{ fontFamily: fonts.monoMedium, fontSize: 12, letterSpacing: 1, color: t.textDim }}>{inGame ? 'PARTIE EN COURS' : 'SALON OUVERT'}</Text>
                <Text style={{ fontFamily: fonts.bold, fontSize: 17, color: t.text }}>{lobby.code} · touche pour y retourner</Text>
              </View>
              <CaretRightIcon size={20} color={t.accentText} weight="bold" />
            </Pressable>
            <Pressable accessibilityRole="button" onPress={quit} hitSlop={4}
              style={({ pressed }) => ({ borderTopWidth: 1, borderTopColor: t.line, paddingHorizontal: 16, paddingVertical: 10, opacity: pressed ? 0.6 : 1 })}>
              <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: t.danger }}>{inGame ? 'Quitter la partie' : 'Quitter le salon'}</Text>
            </Pressable>
          </View>
        )}

        <View pointerEvents="box-none" style={{ flex: 1 }} />

        {/* Les deux actions, rien d'autre : créer, ou rejoindre avec un code. */}
        <Animated.View ref={panel.ref} style={[{ backgroundColor: t.dark ? t.bg : t.surface, borderRadius: radius.block + 10, borderWidth: t.dark ? 1 : 0, borderColor: t.line, padding: 12, gap: 12, marginBottom: 4 }, panel.style]}>
          <Button title={engaged ? 'Quitte ta partie pour en créer une' : 'Créer une partie'} arrow={!engaged} onPress={() => create(false)} loading={busy === 'create'} disabled={off} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: t.dark ? t.surface : t.surface2, borderRadius: radius.pill, borderWidth: 1, borderColor: joinError ? t.danger : t.line, height: 58, paddingLeft: 20, paddingRight: 6 }}>
            <TextInput
              value={code} onChangeText={s => { setJoinError(''); setCode(s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)); }}
              placeholder="CODE" placeholderTextColor={t.textDim} selectionColor={t.accent}
              autoCapitalize="characters" autoCorrect={false} returnKeyType="go" onSubmitEditing={() => code.length === 6 && join()}
              accessibilityLabel="Code de la partie" editable={!busy && !engaged}
              style={{ flex: 1, fontFamily: fonts.mono, fontSize: 20, letterSpacing: 5, color: t.text, paddingVertical: 0 }} />
            <Pressable accessibilityRole="button" accessibilityLabel="Scanner le QR du salon" onPress={() => { haptic.tap(); router.push('/scan?mode=join'); }} disabled={off}
              style={({ pressed }) => ({ width: 46, height: 46, borderRadius: 23, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center', opacity: off ? 0.4 : 1, transform: [{ scale: pressed ? 0.94 : 1 }] })}>
              <ScanIcon size={22} color={t.text} />
            </Pressable>
            <Pressable accessibilityRole="button" onPress={join} disabled={code.length !== 6 || off}
              style={({ pressed }) => ({ height: 46, paddingHorizontal: 18, borderRadius: 23, justifyContent: 'center', backgroundColor: code.length === 6 ? t.accent : t.surface2, opacity: !connected || engaged ? 0.4 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] })}>
              {busy === 'join'
                ? <ActivityIndicator color={t.onAccent} />
                : <Text style={{ fontFamily: fonts.bold, fontSize: 15, color: code.length === 6 ? t.onAccent : t.textDim }}>Rejoindre</Text>}
            </Pressable>
          </View>
          {joinError ? <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: t.danger, marginHorizontal: 8, marginTop: -4 }}>{joinError}</Text> : null}

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 4 }}>
            {connected
              ? <Pressable hitSlop={10} disabled={!!busy} onPress={() => router.push('/tutorial')}><Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: t.textDim, opacity: busy ? 0.4 : 1 }}>Comment ça marche</Text></Pressable>
              : <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: t.danger, flexShrink: 1 }} numberOfLines={1}>Connexion au serveur…</Text>}
            <Pressable hitSlop={10} onPress={() => create(true)} disabled={off}>
              <Text style={{ fontFamily: fonts.bold, fontSize: 15, color: t.accentText, opacity: connected && !engaged && (!busy || busy === 'train') ? 1 : 0.4 }}>{busy === 'train' ? 'Préparation…' : "S'entraîner →"}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

type Here = { status: 'loading' | 'denied' | 'ok'; pos?: LatLng; ask: () => void };

/** Position actuelle, seulement si la localisation est déjà autorisée : l'accueil ne déclenche pas de demande tout seul. */
function useHere(): Here {
  const [state, setState] = useState<Omit<Here, 'ask'>>({ status: 'loading' });
  const locate = async (ask: boolean) => {
    const perm = ask ? await Location.requestForegroundPermissionsAsync() : await Location.getForegroundPermissionsAsync();
    if (!perm.granted) return setState({ status: 'denied' });
    // Dernière position connue d'abord (instantané), puis une position fraîche.
    const known = await Location.getLastKnownPositionAsync().catch(() => null);
    if (known) setState({ status: 'ok', pos: { lat: known.coords.latitude, lng: known.coords.longitude } });
    const pos = await currentPosition().catch(() => null);
    if (pos) setState({ status: 'ok', pos });
    else if (!known) setState({ status: 'denied' });
  };
  useEffect(() => { locate(false).catch(() => setState({ status: 'denied' })); }, []);
  // Autorisation donnée ailleurs (écran « Avant de jouer », réglages du téléphone) : on revérifie au retour.
  const missing = state.status === 'denied';
  useFocusEffect(useCallback(() => { if (missing) locate(false).catch(() => {}); }, [missing]));
  useEffect(() => {
    if (!missing) return;
    const sub = AppState.addEventListener('change', s => s === 'active' && locate(false).catch(() => {}));
    return () => sub.remove();
  }, [missing]);
  return { ...state, ask: () => { locate(true).catch(() => {}); } };
}

/** Carte plein écran, estompée, centrée sur toi (au-dessus du panneau d'actions). Sans position : invitation à l'autoriser. */
function HereMap({ here, radiusM }: { here: Here; radiusM: number }) {
  const t = useTheme();
  const mapStyle = useMapStyle(t);
  const zone = useMemo(() => here.pos && circle(here.pos, radiusM), [here.pos?.lat, here.pos?.lng, radiusM]);
  return (
    <View style={{ position: 'absolute', inset: 0, backgroundColor: t.surface2 }}>
      {here.pos ? (
        <>
          <Map style={{ flex: 1 }} androidView="texture" mapStyle={mapStyle} logo={false} compass={false} attribution={false}
            dragPan={false} touchZoom={false} touchRotate={false} touchPitch={false} accessibilityLabel="Carte autour de toi">
            <Camera center={[here.pos.lng, here.pos.lat]} zoom={zoomFor(radiusM) - 0.2} padding={{ top: 40, bottom: 260 }} />
            <GeoJSONSource id="here-zone" data={zone!}>
              <Layer type="fill" id="here-zone-fill" paint={{ 'fill-color': t.accent, 'fill-opacity': t.dark ? 0.08 : 0.18 }} />
              <Layer type="line" id="here-zone-line" paint={{ 'line-color': t.dark ? t.accent : t.text, 'line-width': 2, 'line-dasharray': [3, 2], 'line-opacity': 0.7 }} />
            </GeoJSONSource>
            <GeoJSONSource id="here-me" data={{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [here.pos.lng, here.pos.lat] } }}>
              <Layer type="circle" id="here-me-halo" paint={{ 'circle-radius': 18, 'circle-color': t.text, 'circle-opacity': 0.12 }} />
              <Layer type="circle" id="here-me-dot" paint={{ 'circle-radius': 7, 'circle-color': t.dark ? t.accent : t.text, 'circle-stroke-width': 3, 'circle-stroke-color': t.bg }} />
            </GeoJSONSource>
          </Map>
          {/* Voile : la carte reste un décor, les actions passent devant. */}
          <View pointerEvents="none" style={{ position: 'absolute', inset: 0, backgroundColor: t.bg, opacity: t.dark ? 0.3 : 0.2 }} />
        </>
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, paddingBottom: 280, gap: 12 }}>
          {here.status === 'loading' ? <ActivityIndicator color={t.textDim} /> : (
            <>
              <MapPinIcon size={32} color={t.textDim} />
              <Text style={{ fontFamily: fonts.medium, fontSize: 15, color: t.textDim, textAlign: 'center' }}>Autorise ta position pour voir la zone de jeu autour de toi.</Text>
              <Pressable onPress={here.ask} hitSlop={10}><Text style={{ fontFamily: fonts.bold, fontSize: 15, color: t.accentText }}>Autoriser</Text></Pressable>
            </>
          )}
        </View>
      )}
    </View>
  );
}
