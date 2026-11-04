import { requireOptionalNativeModule } from 'expo';

// Module natif local (android/, ios/). Absent (Expo Go, vieux build) : pas de bouton lampe.
const Torch = requireOptionalNativeModule<{
  isAvailable(): boolean;
  maxLevel(): number;
  setEnabled(on: boolean): Promise<void>;
  setLevel(level: number): Promise<void>;
}>('Torch');

export const torchAvailable = (() => { try { return !!Torch?.isAvailable(); } catch { return false; } })();
/** Niveaux de luminosité : 1 = allumée ou éteinte seulement (Android avant 13, lampe non réglable). */
export const torchLevels = (() => { try { return Torch?.maxLevel() ?? 0; } catch { return 0; } })();
export const setTorch = (on: boolean) => Torch?.setEnabled(on) ?? Promise.resolve();
/** level : de 0 (éteinte) à 1 (pleine puissance). */
export const setTorchLevel = (level: number) => Torch?.setLevel(level) ?? Promise.resolve();
