import { useColorScheme } from 'react-native';
import { useStore } from './store';

const accent = '#EE2E14';

const light = {
  dark: false,
  bg: '#F2F2F2',
  surface: '#E8E6E4',
  surface2: '#DCD9D6',
  text: '#161414',
  textDim: '#67625E',
  line: '#D3CFCB',
  accent,
  accentText: '#C62410', // rouge lisible sur fond clair pour les liens
  accentSoft: 'rgba(238,46,20,0.12)',
  onAccent: '#FFF7F4',
  mapStyle: 'https://tiles.openfreemap.org/styles/positron',
};

const dark: typeof light = {
  dark: true,
  bg: '#121111',
  surface: '#1E1D1C',
  surface2: '#2A2827',
  text: '#F2F0EE',
  textDim: '#9A9591',
  line: '#2F2D2B',
  accent,
  accentText: '#FF6A4D',
  accentSoft: 'rgba(238,46,20,0.18)',
  onAccent: '#FFF7F4',
  mapStyle: 'https://tiles.openfreemap.org/styles/dark',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  const system = useColorScheme();
  const pref = useStore(s => s.settings.appearance);
  const mode = pref === 'system' ? system : pref;
  return mode === 'light' ? light : dark;
}

export const fonts = {
  hero: 'ArchivoExtraCondensed-Black',
  display: 'ArchivoExpanded-ExtraBold',
  displayBlack: 'ArchivoExpanded-Black',
  body: 'Archivo-Regular',
  medium: 'Archivo-Medium',
  semibold: 'Archivo-SemiBold',
  bold: 'Archivo-Bold',
};

export const fontFiles = {
  [fonts.hero]: require('../assets/fonts/ArchivoExtraCondensed-Black.ttf'),
  [fonts.display]: require('../assets/fonts/ArchivoExpanded-ExtraBold.ttf'),
  [fonts.displayBlack]: require('../assets/fonts/ArchivoExpanded-Black.ttf'),
  [fonts.body]: require('../assets/fonts/Archivo-Regular.ttf'),
  [fonts.medium]: require('../assets/fonts/Archivo-Medium.ttf'),
  [fonts.semibold]: require('../assets/fonts/Archivo-SemiBold.ttf'),
  [fonts.bold]: require('../assets/fonts/Archivo-Bold.ttf'),
};

/** Une seule échelle d'arrondis : 20 pour les blocs, 14 pour les éléments internes. */
export const radius = { block: 20, inner: 14 };
