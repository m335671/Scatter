// Permissions de l'app, vérifiées à chaque démarrage et à chaque retour au premier plan.
import { Linking, Platform } from 'react-native';
import * as Location from 'expo-location';
import { Camera } from 'expo-camera';
import * as Battery from 'expo-battery';
import * as Notifications from 'expo-notifications';
import * as IntentLauncher from 'expo-intent-launcher';
import Constants from 'expo-constants';

export type PermKey = 'location' | 'background' | 'camera' | 'notifications' | 'battery';
export type PermStatus = 'granted' | 'ask' | 'blocked'; // blocked = refusée définitivement, il faut passer par les réglages

export interface Perm { key: PermKey; title: string; why: string; status: PermStatus }

const status = (r: { granted: boolean; canAskAgain: boolean }): PermStatus =>
  r.granted ? 'granted' : r.canAskAgain ? 'ask' : 'blocked';

const TEXT: Record<PermKey, { title: string; why: string }> = {
  location: { title: 'Position', why: 'Te placer sur la carte et dans la zone de jeu.' },
  background: {
    title: Platform.OS === 'ios' ? 'Position « Toujours »' : 'Position en arrière-plan',
    why: 'Continuer à envoyer ta position quand le téléphone est dans ta poche.',
  },
  camera: { title: 'Caméra', why: 'Scanner le QR code d\'un fugitif pour l\'attraper.' },
  notifications: { title: 'Notifications', why: 'Messages radio, pings et alertes de zone quand le téléphone est dans ta poche.' },
  battery: { title: 'Batterie sans restriction', why: 'Empêcher Android de couper l\'app en arrière-plan pendant une partie.' },
};

/** Android uniquement : l'optimisation de batterie peut tuer le suivi GPS écran éteint. iOS n'a pas d'équivalent. */
const KEYS: PermKey[] = Platform.OS === 'android' ? ['location', 'background', 'camera', 'notifications', 'battery'] : ['location', 'background', 'camera', 'notifications'];

export async function checkAll(): Promise<Perm[]> {
  const [fg, bg, cam, notif, optimized] = await Promise.all([
    Location.getForegroundPermissionsAsync(),
    Location.getBackgroundPermissionsAsync(),
    Camera.getCameraPermissionsAsync(),
    Notifications.getPermissionsAsync(),
    Platform.OS === 'android' ? Battery.isBatteryOptimizationEnabledAsync().catch(() => false) : Promise.resolve(false),
  ]);
  const s: Record<PermKey, PermStatus> = {
    location: status(fg), background: status(bg), camera: status(cam), notifications: status(notif),
    battery: optimized ? 'ask' : 'granted',
  };
  return KEYS.map(key => ({ key, ...TEXT[key], status: s[key] }));
}

/** Demande une permission. Si elle est bloquée, ouvre les réglages de l'app. */
export async function request(key: PermKey, current: PermStatus) {
  if (current === 'blocked') return Linking.openSettings();
  if (key === 'battery') return requestBattery();
  switch (key) {
    case 'location': await Location.requestForegroundPermissionsAsync(); break;
    // La position « toujours » exige d'abord la position « pendant l'utilisation ».
    // Android 11+ ouvre la page des réglages, iOS affiche sa propre demande.
    case 'background':
      if (!(await Location.getForegroundPermissionsAsync()).granted) await Location.requestForegroundPermissionsAsync();
      await Location.requestBackgroundPermissionsAsync();
      break;
    case 'camera': await Camera.requestCameraPermissionsAsync(); break;
    case 'notifications': await Notifications.requestPermissionsAsync(); break;
  }
}

/** Demande système « ne pas optimiser » ; certains fabricants la bloquent : on ouvre alors la liste des réglages. */
async function requestBattery() {
  const pkg = Constants.expoConfig?.android?.package ?? 'com.m335671.scatter';
  try {
    await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, { data: `package:${pkg}` });
  } catch {
    await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS).catch(() => Linking.openSettings());
  }
}

export const allGranted = (perms: Perm[]) => perms.every(p => p.status === 'granted');
