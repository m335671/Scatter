// Permissions de l'app, vérifiées à chaque démarrage et à chaque retour au premier plan.
import { Linking, Platform } from 'react-native';
import * as Location from 'expo-location';
import { Camera } from 'expo-camera';

export type PermKey = 'location' | 'background' | 'camera';
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
};

export async function checkAll(): Promise<Perm[]> {
  const [fg, bg, cam] = await Promise.all([
    Location.getForegroundPermissionsAsync(),
    Location.getBackgroundPermissionsAsync(),
    Camera.getCameraPermissionsAsync(),
  ]);
  const s: Record<PermKey, PermStatus> = { location: status(fg), background: status(bg), camera: status(cam) };
  return (Object.keys(TEXT) as PermKey[]).map(key => ({ key, ...TEXT[key], status: s[key] }));
}

/** Demande une permission. Si elle est bloquée, ouvre les réglages de l'app. */
export async function request(key: PermKey, current: PermStatus) {
  if (current === 'blocked') return Linking.openSettings();
  switch (key) {
    case 'location': await Location.requestForegroundPermissionsAsync(); break;
    // La position « toujours » exige d'abord la position « pendant l'utilisation ».
    // Android 11+ ouvre la page des réglages, iOS affiche sa propre demande.
    case 'background':
      if (!(await Location.getForegroundPermissionsAsync()).granted) await Location.requestForegroundPermissionsAsync();
      await Location.requestBackgroundPermissionsAsync();
      break;
    case 'camera': await Camera.requestCameraPermissionsAsync(); break;
  }
}

export const allGranted = (perms: Perm[]) => perms.every(p => p.status === 'granted');
