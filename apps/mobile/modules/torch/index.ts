import { requireOptionalNativeModule } from 'expo';

// Module natif local (android/, ios/). Absent (Expo Go, vieux build) : pas de bouton lampe.
const Torch = requireOptionalNativeModule<{ isAvailable(): boolean; setEnabled(on: boolean): Promise<void> }>('Torch');

export const torchAvailable = (() => { try { return !!Torch?.isAvailable(); } catch { return false; } })();
export const setTorch = (on: boolean) => Torch?.setEnabled(on) ?? Promise.resolve();
