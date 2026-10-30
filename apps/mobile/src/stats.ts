// Stats des parties, stockées uniquement sur le téléphone (fichier JSON dans le dossier de l'app).
import { useSyncExternalStore } from 'react';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { distanceM, type GameMode, type GameView, type LatLng, type Role } from '@kr/shared';

export interface GameRecord {
  code: string;
  date: number;            // Date.now() de fin
  training: boolean;
  mode?: GameMode;         // absent des parties enregistrées avant la v0.5
  role: Role;
  won: boolean;
  caught: boolean;
  captures: number;
  /** Fugitif : temps tenu depuis le début de la chasse. Chasseur : durée de la chasse. */
  survivedMs: number;
  distanceM: number;
  zone: { center: LatLng; radiusM: number } | null;
  track: LatLng[];         // trajet simplifié, pour la carte partageable
}

const file = () => new File(Paths.document, 'stats.json');
let records: GameRecord[] = [];
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

function load() {
  if (loaded) return;
  loaded = true;
  try {
    const f = file();
    if (f.exists) records = JSON.parse(f.textSync());
  } catch { records = []; }
}

function save() {
  try {
    const f = file();
    if (!f.exists) f.create();
    f.writeSync(JSON.stringify(records));
  } catch { /* stockage indisponible : les stats restent en mémoire pour la session */ }
}

export function useRecords(): GameRecord[] {
  load();
  return useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, () => records);
}

// ---------- Trajet de la manche en cours ----------

const MIN_STEP_M = 8;     // ignore le bruit du GPS
const MAX_ACC_M = 30;     // relevé trop imprécis : ne compte pas dans le trajet
const MAX_POINTS = 600;   // ~1 point par 8 m : largement assez pour 30 min de course
let track: { code: string; points: LatLng[]; distance: number } | null = null;

/** Appelé à chaque position envoyée au serveur pendant une manche. */
export function trackPosition(code: string, p: LatLng, acc?: number) {
  if (acc !== undefined && acc > MAX_ACC_M) return;
  if (!track || track.code !== code) track = { code, points: [], distance: 0 };
  const last = track.points.at(-1);
  if (last) {
    const d = distanceM(last, p);
    if (d < MIN_STEP_M) return;
    if (d < 500) track.distance += d; // un saut énorme = GPS qui se recale, pas une course
  }
  track.points.push(p);
  if (track.points.length > MAX_POINTS) track.points = track.points.filter((_, i) => i % 2 === 0);
}

/** Enregistre la partie terminée (une seule fois par partie). */
export function recordGame(game: GameView) {
  load();
  if (records.some(r => r.code === game.code && Date.now() - r.date < 6 * 3600_000)) return;
  const t = track?.code === game.code ? track : null;
  const end = Math.min(game.clock, game.huntEnd);
  const survivedMs = game.me.role === 'fugitive'
    ? Math.max(0, (game.me.caughtAt ?? end) - game.huntStart)
    : Math.max(0, end - game.huntStart);
  records = [{
    code: game.code,
    date: Date.now(),
    training: game.training,
    mode: game.mode,
    role: game.me.role,
    won: game.winner === game.me.role,
    caught: game.me.caught,
    captures: game.me.captures ?? 0,
    survivedMs,
    distanceM: Math.round(t?.distance ?? 0),
    zone: game.zone.enabled ? { center: game.zone.center, radiusM: game.zone.radiusM } : null,
    track: t?.points ?? [],
  }, ...records].slice(0, 200);
  track = null;
  save();
  emit();
}

export function clearStats() {
  records = [];
  save();
  emit();
}

/** Exporte les stats en fichier JSON via la feuille de partage du téléphone. */
export async function exportStats() {
  load();
  const f = new File(Paths.cache, `scatter-stats-${new Date().toISOString().slice(0, 10)}.json`);
  if (f.exists) f.delete();
  f.create();
  f.writeSync(JSON.stringify({ app: 'Scatter', exportedAt: new Date().toISOString(), games: records }, null, 2));
  await Sharing.shareAsync(f.uri, { mimeType: 'application/json', dialogTitle: 'Exporter mes stats' });
}

export interface Totals { games: number; wins: number; captures: number; distanceM: number; survivedMs: number; asHunter: number; asFugitive: number }

/** Totaux des vraies parties (les entraînements sont listés mais ne comptent pas). */
export function totals(list: GameRecord[]): Totals {
  const real = list.filter(r => !r.training);
  return {
    games: real.length,
    wins: real.filter(r => r.won).length,
    captures: real.reduce((n, r) => n + r.captures, 0),
    distanceM: real.reduce((n, r) => n + r.distanceM, 0),
    survivedMs: real.filter(r => r.role === 'fugitive').reduce((n, r) => n + r.survivedMs, 0),
    asHunter: real.filter(r => r.role === 'hunter').length,
    asFugitive: real.filter(r => r.role === 'fugitive').length,
  };
}
