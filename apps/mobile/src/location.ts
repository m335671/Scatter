// Suivi GPS en arrière-plan pendant une partie : le téléphone est dans la poche.
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { sendPosition } from './api';

const TASK = 'kr-location';

// Doit être défini au niveau du module, pas dans un composant.
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TASK, async ({ data, error }) => {
  if (error || !data) return;
  const last = data.locations.at(-1);
  if (last) sendPosition(last.coords.latitude, last.coords.longitude, last.coords.accuracy ?? undefined);
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
  if (await Location.hasStartedLocationUpdatesAsync(TASK).catch(() => false)) return;
  const bg = await Location.getBackgroundPermissionsAsync();
  if (bg.granted) {
    await Location.startLocationUpdatesAsync(TASK, {
      accuracy: Location.Accuracy.High,
      // Position envoyée au moins toutes les 2 s, même immobile : l'équipe voit du vrai direct.
      timeInterval: 2000,
      distanceInterval: 0,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "Keep Runni'n",
        notificationBody: 'Partie en cours. Ta position est partagée avec le serveur de jeu.',
        notificationColor: '#EE2E14',
      },
    });
  } else if (!foregroundSub) {
    // Sans la permission « toujours », on suit au moins quand l'app est ouverte.
    foregroundSub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 2000, distanceInterval: 0 },
      p => sendPosition(p.coords.latitude, p.coords.longitude, p.coords.accuracy ?? undefined),
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
