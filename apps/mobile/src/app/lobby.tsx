import { useEffect, useState } from 'react';
import { Alert, Pressable, Share, Text, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import type { RoleChoice, Rules } from '@kr/shared';
import { emit, leaveGame } from '../api';
import { currentPosition } from '../location';
import { useStore } from '../store';
import { fonts, radius, useTheme } from '../theme';
import { BackHeader, Button, Group, Row, Screen, Segmented, Stepper, T, Toggle, fmtDistance } from '../ui';

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const ROLE_LABEL: Record<RoleChoice, string> = { hunter: 'Chasseur', fugitive: 'Fugitif', random: 'Au hasard' };

export default function LobbyScreen() {
  const t = useTheme();
  const router = useRouter();
  const lobby = useStore(s => s.lobby);
  const me = useStore(s => s.user);
  const phase = useStore(s => s.game?.phase);
  const units = useStore(s => s.settings.units);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (phase && phase !== 'lobby') router.replace('/game');
  }, [phase]);

  if (!lobby || !me) return <Redirect href="/" />;

  const r = lobby.rules;
  const isHost = lobby.players.find(p => p.host)?.id === me.id;
  const myChoice = lobby.players.find(p => p.id === me.id)?.choice ?? 'random';
  const humans = lobby.players.filter(p => !p.isBot);

  const set = (patch: (r: Rules) => Rules) => emit('rules', patch(r)).catch(e => Alert.alert('Oups', e.message));
  const step = (label: string, value: string, fn: (d: number) => void, sub?: string) => (
    <Row title={label} sub={sub} value={value} right={isHost ? <Stepper onMinus={() => fn(-1)} onPlus={() => fn(1)} /> : undefined} />
  );

  async function start() {
    setBusy(true);
    try { await emit('start'); } catch (e) { Alert.alert('Impossible de lancer', (e as Error).message); } finally { setBusy(false); }
  }

  async function recenter() {
    try {
      const center = await currentPosition();
      await set(x => ({ ...x, zone: { ...x.zone, center } }));
    } catch (e) { Alert.alert('Oups', (e as Error).message); }
  }

  const shrinkText = r.zone.enabled
    ? `La zone rétrécit toutes les ${r.zone.shrinkEveryMin} min dès la fin de l'avance : ${fmtDistance(r.zone.startRadiusM, units)} → ${fmtDistance(r.zone.finalRadiusM, units)}, taille finale à 5 min de la fin.`
    : 'Pas de zone : la partie se joue partout.';

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Screen scroll>
        <BackHeader title={lobby.training ? 'Entraînement' : 'Salon'} right={
          <Pressable hitSlop={10} onPress={async () => { await leaveGame(); router.replace('/'); }}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 17, color: t.accentText }}>Quitter</Text>
          </Pressable>
        } />

        {!lobby.training && (
          <View style={{ backgroundColor: t.surface, borderRadius: radius.block, padding: 20 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <T kind="label">Code de la partie</T>
              <Pressable hitSlop={10} onPress={() => Share.share({ message: `Rejoins ma partie Keep Runni'n avec le code ${lobby.code}` })}>
                <Text style={{ fontFamily: fonts.semibold, fontSize: 17, color: t.accentText }}>Partager</Text>
              </Pressable>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 4 }}>
              <Text selectable style={{ fontFamily: fonts.displayBlack, fontSize: 56, color: t.text, letterSpacing: 1 }}>{lobby.code}</Text>
              {isHost && (
                <View style={{ backgroundColor: t.accentSoft, borderRadius: radius.inner, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 12 }}>
                  <Text style={{ fontFamily: fonts.semibold, color: t.accentText }}>Hôte</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {lobby.training && (
          <T kind="dim">Une manche d'entraînement. Les autres joueurs sont des bots qui se baladent autour de toi.</T>
        )}

        {!lobby.training && (
          <Group label={`Joueurs · ${humans.length}`}>
            {humans.map(p => (
              <Row key={p.id} title={p.name + (p.id === me.id ? ' (toi)' : '')} sub={`@${p.username}`} value={ROLE_LABEL[p.choice]} />
            ))}
          </Group>
        )}

        <Group label="Règles de la partie" footer={isHost ? undefined : "Seul l'hôte peut modifier les règles."}>
          {step('Durée', `${r.durationMin} min`, d => set(x => ({ ...x, durationMin: clamp(x.durationMin + d * 5, 5, 180) })))}
          {step('Pings', `Toutes les ${r.pingEveryMin} min`, d => set(x => ({ ...x, pingEveryMin: clamp(x.pingEveryMin + d, 1, 30) })))}
          {step('Avance', `${r.headStartMin} min`, d => set(x => ({ ...x, headStartMin: clamp(x.headStartMin + d, 0, 30) })))}
          <Row title="Les chasseurs peuvent parler" right={<Toggle value={r.huntersCanTalk} disabled={!isHost} onChange={v => set(x => ({ ...x, huntersCanTalk: v }))} />} />
          {step('Après la capture', '', d => set(x => ({ ...x, spectatorDelayMin: clamp(x.spectatorDelayMin + d, 0, 2) })),
            r.spectatorDelayMin ? `Regarder avec ${r.spectatorDelayMin} min de retard` : 'Regarder en direct')}
        </Group>

        <Group footer={shrinkText}>
          <Row title="Zone de jeu" right={<Toggle value={r.zone.enabled} disabled={!isHost} onChange={v => set(x => ({ ...x, zone: { ...x.zone, enabled: v } }))} />} />
          {r.zone.enabled && step('Taille', fmtDistance(r.zone.startRadiusM, units), d => set(x => {
            const startRadiusM = clamp(x.zone.startRadiusM + d * 50, 100, 5000);
            return { ...x, zone: { ...x.zone, startRadiusM, finalRadiusM: Math.min(x.zone.finalRadiusM, startRadiusM) } };
          }))}
          {r.zone.enabled && step('Taille finale', fmtDistance(r.zone.finalRadiusM, units), d => set(x => ({ ...x, zone: { ...x.zone, finalRadiusM: clamp(x.zone.finalRadiusM + d * 25, 25, x.zone.startRadiusM) } })))}
          {r.zone.enabled && step('Rétrécit', `Toutes les ${r.zone.shrinkEveryMin} min`, d => set(x => ({ ...x, zone: { ...x.zone, shrinkEveryMin: clamp(x.zone.shrinkEveryMin + d, 1, 30) } })))}
          {r.zone.enabled && isHost && <Row title="Centrer la zone sur moi" onPress={recenter} />}
        </Group>

        <Group label="Tu joues">
          <View style={{ padding: 12 }}>
            <Segmented<RoleChoice>
              stretch
              value={myChoice}
              onChange={role => emit('role', { role }).catch(e => Alert.alert('Oups', e.message))}
              options={(['hunter', 'fugitive', 'random'] as const).map(v => ({ value: v, label: ROLE_LABEL[v] }))}
            />
          </View>
        </Group>
        {!lobby.training && (
          <T kind="small" style={{ marginHorizontal: 4 }}>
            « Au hasard » complète l'équipe qui en a besoin, environ un chasseur pour trois joueurs.
          </T>
        )}
      </Screen>
      <View style={{ paddingHorizontal: 16, paddingBottom: 28, paddingTop: 8, backgroundColor: t.bg }}>
        {isHost
          ? <Button title={lobby.training ? "Lancer l'entraînement" : 'Lancer la partie'} onPress={start} loading={busy} />
          : <T kind="dim" style={{ textAlign: 'center', paddingVertical: 18 }}>En attente de l'hôte…</T>}
      </View>
    </View>
  );
}
