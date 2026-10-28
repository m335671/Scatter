import { z } from 'zod';

// ---------- Règles ----------

export const LatLng = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type LatLng = z.infer<typeof LatLng>;

export const Rules = z.object({
  durationMin: z.number().int().min(5).max(180),
  pingEveryMin: z.number().int().min(1).max(30),
  headStartMin: z.number().int().min(0).max(30),
  huntersCanTalk: z.boolean(),
  spectatorDelayMin: z.number().int().min(0).max(2), // limité par l'historique de positions (3 min)
  zone: z.object({
    enabled: z.boolean(),
    center: LatLng,
    startRadiusM: z.number().min(50).max(10_000),
    finalRadiusM: z.number().min(25).max(10_000),
    shrinkEveryMin: z.number().int().min(1).max(60),
  }).refine(z => z.finalRadiusM <= z.startRadiusM, 'finalRadiusM > startRadiusM'),
});
export type Rules = z.infer<typeof Rules>;

export const defaultRules = (center: LatLng): Rules => ({
  durationMin: 30,
  pingEveryMin: 2,
  headStartMin: 3,
  huntersCanTalk: true,
  spectatorDelayMin: 1,
  zone: { enabled: true, center, startRadiusM: 420, finalRadiusM: 150, shrinkEveryMin: 5 },
});

/** Les chasseurs voient la position des fugitifs telle qu'elle était PING_DELAY_MS avant le ping. */
export const PING_DELAY_MS = 60_000;
/** La zone atteint sa taille finale à cette durée de la fin. */
export const FINAL_ZONE_BEFORE_END_MS = 5 * 60_000;
export const MIN = 60_000;

// ---------- Messages client → serveur (frontière de confiance) ----------

export const Username = z.string().regex(/^[a-z0-9_]{3,20}$/);
export const DisplayName = z.string().trim().min(1).max(24);
export const Register = z.object({ name: DisplayName, username: Username });
export const UpdateMe = z.object({ name: DisplayName.optional(), username: Username.optional() });

export const RoleChoice = z.enum(['hunter', 'fugitive', 'random']);
export type RoleChoice = z.infer<typeof RoleChoice>;
export type Role = 'hunter' | 'fugitive';

export const C2S = {
  empty: z.object({}),
  create: z.object({ rules: Rules, training: z.boolean().default(false) }),
  join: z.object({ code: z.string().trim().toUpperCase().length(6) }),
  rules: Rules,
  role: z.object({ role: RoleChoice }),
  pos: LatLng.extend({ acc: z.number().min(0).max(10_000).optional() }),
  capture: z.object({ qr: z.string().max(200) }),
  chat: z.object({ text: z.string().trim().min(1).max(280), channel: z.enum(['team', 'all']).default('team') }),
  training: z.discriminatedUnion('action', [
    z.object({ action: z.literal('ping') }),
    z.object({ action: z.literal('advance') }),
    z.object({ action: z.literal('speed'), value: z.union([z.literal(1), z.literal(5), z.literal(20)]) }),
    z.object({ action: z.literal('end') }),
  ]),
};

// ---------- Serveur → client ----------

export type Phase = 'lobby' | 'headstart' | 'hunt' | 'ended';

export interface LobbyPlayer { id: string; name: string; username: string; choice: RoleChoice; isBot: boolean; host: boolean }
export interface Lobby { code: string; rules: Rules; training: boolean; players: LobbyPlayer[] }

/** acc : précision GPS en mètres au moment de la mesure (absente pour les bots). */
export interface SeenPlayer { id: string; name: string; role: Role; lat: number; lng: number; t: number; acc?: number; caught: boolean; exposed?: boolean }

export interface GameView {
  code: string;
  phase: Phase;
  training: boolean;
  speed: number;
  clock: number;      // horloge de jeu (ms depuis le lancement)
  huntStart: number;
  huntEnd: number;
  nextPingAt: number | null;
  zone: { enabled: boolean; center: LatLng; radiusM: number; nextShrinkAt: number | null };
  me: { id: string; role: Role; caught: boolean; outOfZone: boolean; qr: string | null };
  fugitivesLeft: number;
  fugitivesTotal: number;
  team: SeenPlayer[];                        // coéquipiers en direct
  ping: { at: number; players: SeenPlayer[] } | null; // dernier ping de l'équipe adverse
  spectating: SeenPlayer[];                  // fugitif attrapé : tout le monde en différé
  winner: Role | null;
}

/** channel : « team » = radio de l'équipe, « all » = radio globale (les deux équipes). */
export type Channel = 'team' | 'all';
export interface ChatMessage { id: string; at: number; from: string | null; fromName: string | null; text: string; system: boolean; channel: Channel }

// ---------- Géo ----------

export function distanceM(a: LatLng, b: LatLng): number {
  const R = 6_371_000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Rayon de la zone à l'instant `clock`, par paliers de shrinkEveryMin dès la fin de l'avance. */
export function zoneRadius(rules: Rules, clock: number): number {
  const z = rules.zone;
  const huntStart = rules.headStartMin * MIN;
  const shrinkEnd = huntStart + rules.durationMin * MIN - FINAL_ZONE_BEFORE_END_MS;
  const step = z.shrinkEveryMin * MIN;
  const totalSteps = Math.max(1, Math.floor((shrinkEnd - huntStart) / step));
  const done = clock < huntStart ? 0 : Math.min(totalSteps, Math.floor((clock - huntStart) / step));
  return z.startRadiusM - ((z.startRadiusM - z.finalRadiusM) * done) / totalSteps;
}

export function nextShrinkAt(rules: Rules, clock: number): number | null {
  if (!rules.zone.enabled) return null;
  const huntStart = rules.headStartMin * MIN;
  const step = rules.zone.shrinkEveryMin * MIN;
  const shrinkEnd = huntStart + rules.durationMin * MIN - FINAL_ZONE_BEFORE_END_MS;
  const next = clock < huntStart ? huntStart + step : huntStart + (Math.floor((clock - huntStart) / step) + 1) * step;
  return next > shrinkEnd ? null : next;
}
