import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import { CaretDownIcon, CheckIcon, CopyIcon, QrCodeIcon, XIcon } from '../icons';
import { defaultRules, type LobbyPlayer, type RoleChoice, type Rules } from '@kr/shared';
import { emit, leaveGame } from '../api';
import { currentPosition, freshPosition } from '../location';
import { useStore } from '../store';
import { fonts, radius, useTheme } from '../theme';
import { BackHeader, Button, Choices, Group, Row, Segmented, T, Toggle, fmtDistance, haptic, initial, showDialog } from '../ui';

const ROLE_LABEL: Record<RoleChoice, string> = { hunter: 'Chasseur', fugitive: 'Fugitif', random: 'Au hasard' };
/** Mode affiché : la Dispersion est une règle à part (`dispersion`), jouée en Classique. */
type ModeChoice = 'classic' | 'zombie' | 'dispersion';

export default function LobbyScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const lobby = useStore(s => s.lobby);
  const me = useStore(s => s.user);
  const phase = useStore(s => s.game?.phase);
  const units = useStore(s => s.settings.units);
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState(false);
  const [all, setAll] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (phase && phase !== 'lobby') router.replace('/game');
  }, [phase]);

  if (!lobby || !me) return <Redirect href="/" />;

  // Un serveur plus ancien que l'app n'envoie pas tous les réglages (ex. `bots`) : on complète avec les valeurs par défaut.
  const r: Rules = { ...defaultRules(lobby.rules.zone.center), ...lobby.rules };
  const isHost = lobby.players.find(p => p.host)?.id === me.id;
  const myChoice = lobby.players.find(p => p.id === me.id)?.choice ?? 'random';
  const humans = lobby.players.filter(p => !p.isBot);
  // Un serveur plus ancien n'envoie pas `ready` : personne n'est alors bloqué.
  const isReady = (p: LobbyPlayer) => p.ready ?? true;
  const iAmReady = isReady(lobby.players.find(p => p.id === me.id)!);
  const readyCount = humans.filter(isReady).length;
  const allReady = readyCount === humans.length;
  const alone = !lobby.training && humans.length < 2;

  const set = (patch: (r: Rules) => Rules) => emit('rules', patch(r)).catch(e => showDialog({ title: 'Modification refusée', message: e.message }));
  // Hôte : valeurs prêtes à toucher. Les autres voient seulement la valeur.
  const pick = (title: string, value: number, options: number[], label: (v: number) => string, onPick: (v: number) => void, sub?: string) =>
    isHost ? <Choices title={title} sub={sub} value={value} options={options} label={label} onChange={onPick} />
      : <Row title={title} sub={sub} value={label(value)} />;
  const min = (v: number) => `${v} min`;
  const m = (v: number) => fmtDistance(v, units);
  const freeRoles = lobby.training || r.freeRoles;
  // Nombre de chasseurs fixé ou Dispersion : rôles tirés au sort, les choix ne servent à rien.
  const drawn = r.hunters > 0 || r.dispersion;
  const mode: ModeChoice = r.dispersion ? 'dispersion' : r.mode;
  const changeRole = (role: RoleChoice, id?: string) =>
    emit('role', { role, id }).catch(e => showDialog({ title: 'Changement refusé', message: e.message }));
  // Rôles choisis par l'hôte : il touche la pastille d'un joueur pour la changer.
  const pickRole = (p: LobbyPlayer) => showDialog({
    title: `Rôle de ${p.name}`,
    actions: (['hunter', 'fugitive', 'random'] as const).map(role => ({
      label: ROLE_LABEL[role], kind: role === p.choice ? 'primary' as const : 'cancel' as const, onPress: () => changeRole(role, p.id),
    })),
  });

  async function start() {
    setBusy(true);
    // La zone a été placée sur la dernière position connue (création instantanée) : on la recale sur une position fraîche.
    try { await emit('start', { center: (await freshPosition()) ?? undefined }); } catch (e) { showDialog({ title: 'Impossible de lancer', message: (e as Error).message }); } finally { setBusy(false); }
  }

  function kick(p: LobbyPlayer) {
    showDialog({
      title: `Exclure ${p.name} ?`,
      message: `${p.name} quittera le salon et ne pourra plus le rejoindre, même avec le code ou le QR. En cas d'erreur, il faudra créer un nouveau salon.`,
      actions: [
        { label: 'Exclure', kind: 'danger', onPress: () => emit('kick', { id: p.id }).catch(e => showDialog({ title: 'Action impossible', message: e.message })) },
        { label: 'Annuler', kind: 'cancel' },
      ],
    });
  }

  async function copy() {
    await Clipboard.setStringAsync(lobby!.code);
    haptic.success();
    setCopied(true); // la coche remplace l'icône un instant : copié
    setTimeout(() => setCopied(false), 1500);
  }

  async function toggleReady() {
    setBusy(true);
    try { await emit('ready', { ready: !iAmReady }); if (!iAmReady) haptic.success(); } catch (e) { showDialog({ title: 'Action impossible', message: (e as Error).message }); } finally { setBusy(false); }
  }

  async function recenter() {
    try {
      const center = await currentPosition();
      await set(x => ({ ...x, zone: { ...x.zone, center } }));
    } catch (e) { showDialog({ title: 'Position introuvable', message: (e as Error).message }); }
  }

  const shrinkText = r.zone.enabled
    ? `La zone rétrécit toutes les ${r.zone.shrinkEveryMin} min dès la fin de l'avance : ${fmtDistance(r.zone.startRadiusM, units)} → ${fmtDistance(r.zone.finalRadiusM, units)}, taille finale à 5 min de la fin.`
    : 'Pas de zone : la partie se joue partout.';

  const tile = (value: string, label: string) => (
    <View style={{ flex: 1, backgroundColor: t.surface, borderWidth: t.dark ? 1 : 0, borderColor: t.line, borderRadius: radius.block, padding: 12 }}>
      <Text style={{ fontFamily: fonts.mono, fontSize: 21, color: t.text }} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: t.textDim }}>{label}</Text>
    </View>
  );
  // Carte du code : encre foncée en clair, surface en sombre.
  const codeBg = t.dark ? t.surface : t.text;
  const codeFg = t.dark ? t.text : t.bg;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 8, gap: 12 }}>
        <BackHeader title={lobby.training ? 'Entraînement' : isHost ? "Salon · tu es l'hôte" : 'Salon'} right={
          <Pressable hitSlop={10} onPress={async () => { await leaveGame(); router.replace('/'); }}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: t.danger }}>Quitter</Text>
          </Pressable>
        } />

        {!lobby.training && (
          <View style={{ backgroundColor: codeBg, borderWidth: t.dark ? 1 : 0, borderColor: t.line, borderRadius: radius.block + 10, paddingVertical: 18, paddingLeft: 20, paddingRight: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: codeFg, opacity: 0.7 }}>Code à partager</Text>
              <Text selectable numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: fonts.mono, fontSize: 38, letterSpacing: 4, color: codeFg }}>{lobby.code}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Afficher le QR code du salon" onPress={() => setQr(true)}
              style={({ pressed }) => ({ width: 60, height: 60, borderRadius: 18, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.94 : 1 }] })}>
              <QrCodeIcon size={30} color={t.onAccent} weight="bold" />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={copied ? 'Code copié' : 'Copier le code du salon'} onPress={copy}
              style={({ pressed }) => ({ width: 60, height: 60, borderRadius: 18, borderWidth: 1.5, borderColor: codeFg, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.94 : 1 }] })}>
              {copied ? <CheckIcon size={28} color={codeFg} weight="bold" /> : <CopyIcon size={28} color={codeFg} weight="bold" />}
            </Pressable>
          </View>
        )}

        {!lobby.training && (
          <View style={{ backgroundColor: t.surface, borderWidth: t.dark ? 1 : 0, borderColor: t.line, borderRadius: radius.block + 6, paddingHorizontal: 16, paddingVertical: 4 }}>
            {humans.map((p, i) => (
              <PlayerRow key={p.id} p={p} me={p.id === me.id} first={i === 0} ready={isReady(p)} drawn={drawn}
                onKick={isHost && p.id !== me.id ? () => kick(p) : undefined}
                onRole={isHost && !freeRoles && !drawn ? () => pickRole(p) : undefined} />
            ))}
            {humans.length < 3 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: t.line }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.textDim }} />
                <Text style={{ fontFamily: fonts.medium, fontSize: 15, color: t.textDim }}>En attente d'un joueur…</Text>
              </View>
            )}
          </View>
        )}

        {lobby.training && (
          <Group label="Bots" footer={r.bots.smart
            ? 'Malins : les chasseurs courent vers ton dernier ping, les fugitifs fuient les chasseurs repérés.'
            : 'Promeneurs : les bots se baladent au hasard dans la zone.'}>
            {r.mode !== 'zombie' && pick('Bots chasseurs', r.bots.hunters, [0, 1, 2, 3, 4, 5], String, v => set(x => ({ ...x, bots: { ...x.bots, hunters: v } })))}
            {/* Zombie : tous les bots comptent ensemble, un seul chasseur est tiré au départ. */}
            {r.mode === 'zombie'
              ? pick('Bots', r.bots.hunters + r.bots.fugitives, [1, 2, 3, 4, 5, 6, 8, 10].filter(v => v >= r.bots.hunters), String,
                v => set(x => ({ ...x, bots: { ...x.bots, fugitives: v - x.bots.hunters } })))
              : pick('Bots fugitifs', r.bots.fugitives, [0, 1, 2, 3, 4, 5, 6, 8, 10], String, v => set(x => ({ ...x, bots: { ...x.bots, fugitives: v } })))}
            <Row title="Bots malins" right={<Toggle value={r.bots.smart} onChange={v => set(x => ({ ...x, bots: { ...x.bots, smart: v } }))} />} />
            <Row title="Messages radio des bots" sub="Un coéquipier commente chaque ping" right={<Toggle value={r.bots.chatty} onChange={v => set(x => ({ ...x, bots: { ...x.bots, chatty: v } }))} />} />
          </Group>
        )}

        <Group label="Tu joues" footer={drawn ? `Rôles tirés au sort${r.hunters ? ` (${r.hunters} chasseur${r.hunters > 1 ? 's' : ''})` : ''}, révélés ${r.dispersion ? "à la fin de l'avance" : 'au lancement'}.`
          : lobby.training ? undefined
          : !freeRoles ? (isHost ? 'Touche la pastille d’un joueur pour choisir son rôle.' : "C'est l'hôte qui choisit les rôles.")
          : r.mode === 'zombie' ? "« Chasseur » : volontaire pour être le premier chasseur."
          : "« Au hasard » complète l'équipe qui en a besoin, environ un chasseur pour trois joueurs."}>
          {drawn ? <Row title="Ton rôle" value="Au sort" />
          : freeRoles || isHost ? (
            <View style={{ padding: 12 }}>
              <Segmented<RoleChoice> stretch value={myChoice} onChange={role => changeRole(role)}
                options={(['hunter', 'fugitive', 'random'] as const).map(v => ({ value: v, label: ROLE_LABEL[v] }))} />
            </View>
          ) : <Row title="Ton rôle" value={ROLE_LABEL[myChoice]} />}
        </Group>

        <Group label="Mode" footer={{
          classic: 'Deux équipes fixes : un fugitif attrapé passe spectateur.',
          zombie: 'Un chasseur au départ, chaque fugitif attrapé le rejoint.',
          dispersion: "Tout le monde s'éparpille sans rôle, les chasseurs sont tirés au sort à la fin de l'avance.",
        }[mode]}>
          {isHost ? (
            <View style={{ padding: 12 }}>
              {/* Dispersion sans avance n'aurait pas de course : on en met une. */}
              <Segmented<ModeChoice> stretch value={mode} onChange={m => set(x => ({
                ...x, mode: m === 'zombie' ? 'zombie' : 'classic', dispersion: m === 'dispersion',
                headStartMin: m === 'dispersion' && !x.headStartMin ? 3 : x.headStartMin,
              }))}
                options={[{ value: 'classic', label: 'Classique' }, { value: 'zombie', label: 'Zombie' }, { value: 'dispersion', label: 'Dispersion' }]} />
            </View>
          ) : <Row title="Mode" value={{ classic: 'Classique', zombie: 'Zombie', dispersion: 'Dispersion' }[mode]} />}
        </Group>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          {tile(`${r.durationMin}′`, 'durée')}
          {tile(`${r.pingEveryMin}′`, 'pings')}
          {tile(r.zone.enabled ? fmtDistance(r.zone.startRadiusM, units).replace(' ', '') : '—', 'zone')}
        </View>

        <Pressable accessibilityRole="button" accessibilityState={{ expanded: all }} onPress={() => setAll(v => !v)} hitSlop={8}
          style={{ flexDirection: 'row', alignSelf: 'center', alignItems: 'center', gap: 6, paddingVertical: 4 }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 15, color: t.accentText }}>{all ? 'Masquer les réglages' : isHost ? 'Tous les réglages' : 'Voir tous les réglages'}</Text>
          <CaretDownIcon size={16} color={t.accentText} weight="bold" style={{ transform: [{ rotate: all ? '180deg' : '0deg' }] }} />
        </Pressable>

        {all && (
          <>
            <Group label="Règles de la partie" footer={isHost ? undefined : "Seul l'hôte peut modifier les règles."}>
              {pick('Durée', r.durationMin, [10, 15, 20, 30, 45, 60, 90, 120], min, v => set(x => ({ ...x, durationMin: v })))}
              {pick('Ping toutes les', r.pingEveryMin, [1, 2, 3, 5, 10], min, v => set(x => ({ ...x, pingEveryMin: v })))}
              {pick(r.dispersion ? 'Course de départ' : 'Avance des fugitifs', r.headStartMin, [0, 1, 2, 3, 5, 10].filter(v => v || !r.dispersion), min, v => set(x => ({ ...x, headStartMin: v })))}
              {pick(r.mode === 'zombie' ? 'Chasseurs au départ' : 'Chasseurs', r.hunters, [0, 1, 2, 3, 4, 5].filter(v => v < Math.max(2, lobby.players.length)),
                v => (v ? String(v) : 'Auto'), v => set(x => ({ ...x, hunters: v })), 'Tirés au sort, révélés au départ')}
              {pick('Les fugitifs voient les chasseurs', r.huntersShownEvery, [1, 2, 3, 5, 0],
                v => (v === 1 ? 'À chaque ping' : v ? `Toutes les ${v * r.pingEveryMin} min` : 'Jamais'),
                v => set(x => ({ ...x, huntersShownEvery: v })), 'Moins souvent : plus de vigilance et de radio')}
              {!lobby.training && (
                <Row title="Chacun choisit son rôle" sub={r.freeRoles ? undefined : "Coupé : l'hôte choisit pour tout le monde"}
                  right={<Toggle value={r.freeRoles} disabled={!isHost} onChange={v => set(x => ({ ...x, freeRoles: v }))} />} />
              )}
              <Row title="Les chasseurs peuvent parler" right={<Toggle value={r.huntersCanTalk} disabled={!isHost} onChange={v => set(x => ({ ...x, huntersCanTalk: v }))} />} />
              {pick('Après la capture', r.spectatorDelayMin, [0, 1, 2], v => (v ? `${v} min de retard` : 'En direct'),
                v => set(x => ({ ...x, spectatorDelayMin: v })), 'Ce que voit un joueur attrapé')}
            </Group>

            <Group footer={shrinkText}>
              <Row title="Zone de jeu" right={<Toggle value={r.zone.enabled} disabled={!isHost} onChange={v => set(x => ({ ...x, zone: { ...x.zone, enabled: v } }))} />} />
              {r.zone.enabled && pick('Taille au départ', r.zone.startRadiusM, [200, 300, 400, 500, 750, 1000, 1500, 2000], m,
                v => set(x => ({ ...x, zone: { ...x.zone, startRadiusM: v, finalRadiusM: Math.min(x.zone.finalRadiusM, v) } })))}
              {r.zone.enabled && pick('Taille finale', r.zone.finalRadiusM, [25, 50, 100, 150, 200, 300, 500].filter(v => v <= r.zone.startRadiusM), m,
                v => set(x => ({ ...x, zone: { ...x.zone, finalRadiusM: v } })))}
              {r.zone.enabled && pick('Rétrécit toutes les', r.zone.shrinkEveryMin, [1, 2, 3, 5, 10], min, v => set(x => ({ ...x, zone: { ...x.zone, shrinkEveryMin: v } })))}
              {r.zone.enabled && isHost && <Row title="Centrer la zone sur moi" onPress={recenter} />}
            </Group>
          </>
        )}
      </ScrollView>

      <View style={{ paddingHorizontal: 16, paddingBottom: Math.max(insets.bottom, 16), paddingTop: 8, backgroundColor: t.bg }}>
        {isHost
          ? <Button arrow={allReady && !alone} disabled={!allReady || alone} onPress={start} loading={busy}
              title={lobby.training ? "Lancer l'entraînement" : alone ? 'Il faut au moins 2 joueurs' : allReady ? `Lancer la partie · ${humans.length} joueurs` : `Prêts : ${readyCount}/${humans.length}`} />
          : iAmReady
            ? (
              <View style={{ gap: 8 }}>
                <T kind="dim" style={{ textAlign: 'center' }}>Tu es prêt. En attente de l'hôte…</T>
                <Button kind="secondary" title="Je ne suis plus prêt" onPress={toggleReady} loading={busy} />
              </View>
            )
            : <Button arrow title="Je suis prêt" onPress={toggleReady} loading={busy} />}
      </View>

      <QrModal code={lobby.code} visible={qr} onClose={() => setQr(false)} />
    </SafeAreaView>
  );
}

/** `onKick` : l'hôte exclut un autre joueur (croix, ou toucher la ligne). `onRole` : l'hôte choisit le rôle (pastille). */
/** `drawn` : rôles tirés au sort, la pastille ne montre aucun choix. */
function PlayerRow({ p, me, first, ready, drawn, onKick, onRole }: { p: LobbyPlayer; me: boolean; first: boolean; ready: boolean; drawn: boolean; onKick?: () => void; onRole?: () => void }) {
  const t = useTheme();
  const pill = {
    hunter: { bg: t.accent, fg: t.onAccent, border: t.accent },
    fugitive: { bg: t.text, fg: t.bg, border: t.text },
    random: { bg: 'transparent', fg: t.text, border: t.line },
  }[drawn ? 'random' : p.choice];
  return (
    <Pressable onPress={onKick} disabled={!onKick} accessibilityHint={onKick ? 'Exclure ce joueur du salon' : undefined}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: first ? 0 : 1, borderTopColor: t.line, opacity: pressed ? 0.6 : 1 })}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: me ? (t.dark ? t.accent : t.text) : t.surface2, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: fonts.bold, fontSize: 15, color: me ? (t.dark ? t.onAccent : t.accent) : t.text }}>{initial(p.name)}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: fonts.bold, fontSize: 16, color: t.text }} numberOfLines={1}>{p.name}{me ? ' (toi)' : ''}</Text>
        <Text style={{ fontFamily: fonts.monoMedium, fontSize: 12, color: t.textDim }} numberOfLines={1}>@{p.username}{p.host ? ' · HÔTE' : ''}</Text>
      </View>
      <View accessibilityLabel={ready ? 'Prêt' : 'Pas prêt'}
        style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: ready ? t.accent : 'transparent', borderWidth: ready ? 0 : 1.5, borderStyle: 'dashed', borderColor: t.textDim }}>
        {ready && <CheckIcon size={14} color={t.onAccent} weight="bold" />}
      </View>
      <Pressable onPress={onRole} disabled={!onRole} hitSlop={6} accessibilityRole={onRole ? 'button' : undefined}
        accessibilityLabel={`Rôle : ${drawn ? 'au sort' : ROLE_LABEL[p.choice]}`} accessibilityHint={onRole ? 'Choisir le rôle de ce joueur' : undefined}
        style={({ pressed }) => ({ height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: pill.bg, borderWidth: 1.5, borderColor: pill.border, flexDirection: 'row', alignItems: 'center', gap: 5, opacity: pressed ? 0.7 : 1 })}>
        <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: pill.fg }}>{drawn ? 'Au sort' : ROLE_LABEL[p.choice]}</Text>
        {onRole && <CaretDownIcon size={13} color={pill.fg} weight="bold" />}
      </Pressable>
      {onKick && (
        <Pressable onPress={onKick} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Exclure ${p.name}`}
          style={({ pressed }) => ({ width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: t.danger, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.9 : 1 }] })}>
          <XIcon size={14} color={t.danger} weight="bold" />
        </Pressable>
      )}
    </Pressable>
  );
}

/** QR du salon : il contient seulement le code, à scanner depuis l'onglet Jouer d'un autre téléphone. */
function QrModal({ code, visible, onClose }: { code: string; visible: boolean; onClose: () => void }) {
  const t = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 }} onPress={onClose} accessibilityLabel="Fermer">
        <Pressable onPress={() => {}} style={{ backgroundColor: t.bg, borderWidth: 1, borderColor: t.line, borderRadius: radius.block + 10, padding: 22, gap: 14, alignItems: 'center' }}>
          <Text style={{ fontFamily: fonts.hero, fontSize: 28, color: t.text, letterSpacing: -0.5 }}>Scanne pour rejoindre</Text>
          <Text style={{ fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: t.textDim, textAlign: 'center' }}>Sur l'autre téléphone : onglet Jouer, bouton scanner à côté du code.</Text>
          <View style={{ backgroundColor: '#FFFFFF', padding: 18, borderRadius: radius.block }}>
            <QRCode value={code} size={220} color="#0F1712" />
          </View>
          <Text selectable style={{ fontFamily: fonts.mono, fontSize: 30, letterSpacing: 6, color: t.text }}>{code}</Text>
          <View style={{ alignSelf: 'stretch', gap: 10 }}>
            <Button title="Envoyer le code" onPress={() => Share.share({ message: `Rejoins ma partie Scatter avec le code ${code}` })} />
            <Button title="Fermer" kind="secondary" onPress={onClose} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
