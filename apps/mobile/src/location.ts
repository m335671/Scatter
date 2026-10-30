// Suivi GPS en arrière-plan pendant une partie : le téléphone est dans la poche.
import { useEffect, useState } from 'react';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { ensureConnected, sendPosition } from './api';

const TASK = 'kr-location';
const MAX_AGE_MS = 30_000;   // position en cache (dernière connue) : trop vieille pour être « en direct »
const BAD_ACC_M = 100;       // relevé par antenne / Wi-Fi : peut placer le joueur à plusieurs centaines de mètres
const BAD_ACC_GRACE_MS = 20_000;
let lastGoodAt = 0;
/** Dernier relevé reçu, même rejeté : sert au voyant GPS du HUD. */
let lastFix = { at: 0, acc: undefined as number | undefined };
let trackingSince = 0;

/** Filtre les relevés trompeurs. Un relevé imprécis passe quand même si on n'a rien de mieux depuis 20 s (sinon le joueur disparaît). */
function send(loc: Location.LocationObject) {
  const now = Date.now();
  if (now - loc.timestamp > MAX_AGE_MS) return;
  const acc = loc.coords.accuracy ?? undefined;
  lastFix = { at: now, acc };
  if (acc !== undefined && acc > BAD_ACC_M && now - lastGoodAt < BAD_ACC_GRACE_MS) return;
  if (acc === undefined || acc <= BAD_ACC_M) lastGoodAt = now;
  sendPosition(loc.coords.latitude, loc.coords.longitude, acc);
}

// Doit être défini au niveau du module, pas dans un composant.
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TASK, async ({ data, error }) => {
  if (error || !data) return;
  // Si Android a relancé l'app sans interface (processus tué), il faut rouvrir la connexion.
  await ensureConnected();
  const last = data.locations.at(-1);
  if (last) send(last);
});

/** Demande les permissions. Renvoie 'background', 'foreground' ou 'denied'. */
export async function askLocation(): Promise<'background' | 'foreground' | 'denied'> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (!fg.granted) return 'denied';
  const bg = await Location.requestBackgroundPermissionsAsync();
  return bg.granted ? 'background' : 'foreground';
}

export async function currentPosition() {
  const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return { lat: p.coords.latitude, lng: p.coords.longitude };
}

let foregroundSub: Location.LocationSubscription | null = null;

export async function startTracking() {
  trackingSince = Date.now();
  if (await Location.hasStartedLocationUpdatesAsync(TASK).catch(() => false)) return;
  const bg = await Location.getBackgroundPermissionsAsync();
  if (bg.granted) {
    try {
      await Location.startLocationUpdatesAsync(TASK, {
        accuracy: Location.Accuracy.High,
        // Position envoyée au moins toutes les 2 s, même immobile : l'équipe voit du vrai direct.
        timeInterval: 2000,
        distanceInterval: 0,
        showsBackgroundLocationIndicator: true,
        // iOS : ne pas couper le GPS quand on s'arrête de courir, profil « sport ».
        pausesUpdatesAutomatically: false,
        activityType: Location.ActivityType.Fitness,
        foregroundService: {
          notificationTitle: 'Scatter',
          notificationBody: 'Partie en cours. Ta position est partagée avec le serveur de jeu.',
          notificationColor: '#D4FF3A',
        },
      });
      foregroundSub?.remove();
      foregroundSub = null;
      return;
    } catch {
      // Android refuse parfois de démarrer le service (app en arrière-plan au mauvais moment) : on suit au premier plan.
    }
  }
  if (!foregroundSub) {
    // Sans la permission « toujours », on suit au moins quand l'app est ouverte.
    foregroundSub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 2000, distanceInterval: 0 },
      send,
    );
  }
}

export async function stopTracking() {
  foregroundSub?.remove();
  foregroundSub = null;
  if (await Location.hasStartedLocationUpdatesAsync(TASK).catch(() => false)) {
    await Location.stopLocationUpdatesAsync(TASK);
  }
}

const LOST_MS = 20_000;
const WEAK_ACC_M = 50;
export type GpsStatus = { kind: 'ok' } | { kind: 'weak'; acc: number } | { kind: 'lost'; sinceS: number };

/** État du GPS pour le joueur lui-même, réévalué toutes les 2 s. */
export function useGpsStatus(): GpsStatus {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 2000);
    return () => clearInterval(id);
  }, []);
  const ref = Math.max(lastFix.at, trackingSince);
  if (ref && now - ref > LOST_MS) return { kind: 'lost', sinceS: Math.round((now - (lastFix.at || trackingSince)) / 1000) };
  if (lastFix.acc !== undefined && lastFix.acc > WEAK_ACC_M) return { kind: 'weak', acc: Math.round(lastFix.acc) };
  return { kind: 'ok' };
}
