import { useColorScheme } from 'react-native';
import type { GameMode } from '@kr/shared';
import { useStore } from './store';

// L'accent est une couleur de fond (texte `onAccent` dessus) ; `accentText` est sa version lisible en texte.
// `danger` signale hors zone, erreurs et actions destructives : toujours distinct de l'accent.
interface Base {
  bg: string; surface: string; surface2: string; text: string; textDim: string; line: string;
  accent: string; accentText: string; onAccent: string; danger: string; onDanger: string;
}

export const PALETTES = {
  foret: {
    name: 'Forêt',
    dark: { bg: '#0F1712', surface: '#15201A', surface2: '#1E2C23', text: '#E8EEE4', textDim: '#9DB09F', line: '#2C3B2F', accent: '#D4FF3A', accentText: '#D4FF3A', onAccent: '#0F1712', danger: '#FF7A59', onDanger: '#1A0A05' },
    light: { bg: '#EEF1E8', surface: '#FFFFFF', surface2: '#E2E7DA', text: '#16241B', textDim: '#5E6B60', line: '#D5DBCC', accent: '#C6EF2E', accentText: '#3B6B14', onAccent: '#16241B', danger: '#C2410C', onDanger: '#FFF4EE' },
  },
  braise: {
    name: 'Braise',
    dark: { bg: '#161111', surface: '#211919', surface2: '#2C2221', text: '#F2ECEA', textDim: '#AE9F9B', line: '#3A2D2B', accent: '#FF4D3A', accentText: '#FF6B5A', onAccent: '#FFF5F3', danger: '#FFB547', onDanger: '#1A1205' },
    light: { bg: '#F5F1EF', surface: '#FFFFFF', surface2: '#EAE3E0', text: '#241514', textDim: '#6E5E5B', line: '#E0D6D2', accent: '#E8361F', accentText: '#B8250F', onAccent: '#FFFFFF', danger: '#B45309', onDanger: '#FFF7ED' },
  },
  ocean: {
    name: 'Océan',
    dark: { bg: '#0E141B', surface: '#151E28', surface2: '#1E2A36', text: '#E6EEF5', textDim: '#93A6B8', line: '#283746', accent: '#3DD6F5', accentText: '#5FE0FA', onAccent: '#08131A', danger: '#FF7A59', onDanger: '#1A0A05' },
    light: { bg: '#EEF3F7', surface: '#FFFFFF', surface2: '#DEE7EE', text: '#0F1E2B', textDim: '#556676', line: '#D2DDE6', accent: '#22B8DA', accentText: '#0B6E86', onAccent: '#06202A', danger: '#C2410C', onDanger: '#FFF4EE' },
  },
  ambre: {
    name: 'Ambre',
    dark: { bg: '#15130E', surface: '#1F1C15', surface2: '#2A261D', text: '#F2EEE4', textDim: '#A9A08C', line: '#36312A', accent: '#FFB224', accentText: '#FFC04D', onAccent: '#1A1205', danger: '#FF5A5A', onDanger: '#1A0505' },
    light: { bg: '#F6F2E9', surface: '#FFFFFF', surface2: '#ECE5D6', text: '#221C10', textDim: '#6B6250', line: '#E0D7C4', accent: '#F5A300', accentText: '#8A5A00', onAccent: '#221C10', danger: '#C81E1E', onDanger: '#FFF1F1' },
  },
  lavande: {
    name: 'Lavande',
    dark: { bg: '#121019', surface: '#1B1824', surface2: '#252131', text: '#ECE9F5', textDim: '#A39DB8', line: '#312C40', accent: '#B69CFF', accentText: '#C6B2FF', onAccent: '#120E1F', danger: '#FF7A59', onDanger: '#1A0A05' },
    light: { bg: '#F3F1F8', surface: '#FFFFFF', surface2: '#E6E2F0', text: '#1B1628', textDim: '#625C75', line: '#DAD5E6', accent: '#8B6CF0', accentText: '#5B3FC4', onAccent: '#FFFFFF', danger: '#C2410C', onDanger: '#FFF4EE' },
  },
  ardoise: {
    name: 'Ardoise',
    dark: { bg: '#111213', surface: '#1A1B1D', surface2: '#242628', text: '#EDEEEF', textDim: '#9A9DA2', line: '#2E3033', accent: '#F2F2F2', accentText: '#FFFFFF', onAccent: '#111213', danger: '#FF6B57', onDanger: '#1A0A05' },
    light: { bg: '#F2F2F3', surface: '#FFFFFF', surface2: '#E4E5E7', text: '#151618', textDim: '#5F6268', line: '#D8D9DC', accent: '#151618', accentText: '#151618', onAccent: '#FFFFFF', danger: '#C2410C', onDanger: '#FFF4EE' },
  },
} satisfies Record<string, { name: string; dark: Base; light: Base }>;

export type PaletteId = keyof typeof PALETTES;
export const PALETTE_IDS = Object.keys(PALETTES) as PaletteId[];

const rgba = (hex: string, a: number) =>
  `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;

const build = (b: Base, dark: boolean) => ({ ...b, dark, accentSoft: rgba(b.accent, dark ? 0.14 : 0.3) });
export type Theme = ReturnType<typeof build>;

// Thèmes construits une fois : chaque écran reçoit le même objet tant que rien ne change.
const THEMES = Object.fromEntries(PALETTE_IDS.map(id => [id, { dark: build(PALETTES[id].dark, true), light: build(PALETTES[id].light, false) }])) as
  Record<PaletteId, { dark: Theme; light: Theme }>;

export const themeOf = (id: PaletteId, dark: boolean): Theme => (THEMES[id] ?? THEMES.foret)[dark ? 'dark' : 'light'];
/** Couleur Android des notifications (icône, nom de l'app) : l'accent sombre de la palette choisie. */
export const notifColor = (id: PaletteId) => themeOf(id, true).accent;

/** Palette active : celle du mode de la partie en cours si « couleur selon le mode » est activé, sinon la palette choisie. */
export function usePaletteId(): PaletteId {
  const settings = useStore(s => s.settings);
  const mode = useStore(s => s.lobby?.rules.mode) as GameMode | undefined;
  return settings.dynamicColors.enabled && mode ? settings.dynamicColors[mode] : settings.palette;
}

/** `forceDark` : écrans toujours sombres (tutoriel, image de partage). */
export function useTheme(forceDark?: boolean): Theme {
  const system = useColorScheme();
  const pref = useStore(s => s.settings.appearance);
  const id = usePaletteId();
  const mode = pref === 'system' ? system : pref;
  return themeOf(id, forceDark || mode !== 'light');
}

export const fonts = {
  hero: 'BricolageCondensed-ExtraBold',
  display: 'Bricolage-Bold',
  displayBlack: 'Bricolage-ExtraBold',
  body: 'Bricolage-Regular',
  medium: 'Bricolage-Medium',
  semibold: 'Bricolage-SemiBold',
  bold: 'Bricolage-Bold',
  mono: 'JetBrainsMono-SemiBold',
  monoMedium: 'JetBrainsMono-Medium',
};

export const fontFiles = {
  [fonts.hero]: require('../assets/fonts/BricolageCondensed-ExtraBold.ttf'),
  [fonts.displayBlack]: require('../assets/fonts/Bricolage-ExtraBold.ttf'),
  [fonts.body]: require('../assets/fonts/Bricolage-Regular.ttf'),
  [fonts.medium]: require('../assets/fonts/Bricolage-Medium.ttf'),
  [fonts.semibold]: require('../assets/fonts/Bricolage-SemiBold.ttf'),
  [fonts.bold]: require('../assets/fonts/Bricolage-Bold.ttf'),
  [fonts.mono]: require('../assets/fonts/JetBrainsMono-SemiBold.ttf'),
  [fonts.monoMedium]: require('../assets/fonts/JetBrainsMono-Medium.ttf'),
};

/** Une seule échelle d'arrondis : 18 pour les blocs, 12 pour les éléments internes, pilule pour les boutons. */
export const radius = { block: 18, inner: 12, pill: 999 };
