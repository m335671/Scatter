import { useColorScheme } from 'react-native';
import { useStore } from './store';

// DA « Topo » : vert forêt, accent lime. L'accent est une couleur de fond (texte foncé dessus) ;
// `accentText` est sa version lisible en texte. `danger` signale hors zone, erreurs et actions destructives.
const dark = {
  dark: true,
  bg: '#0F1712',
  surface: '#15201A',
  surface2: '#1E2C23',
  text: '#E8EEE4',
  textDim: '#9DB09F',
  line: '#2C3B2F',
  accent: '#D4FF3A',
  accentText: '#D4FF3A',
  accentSoft: 'rgba(212,255,58,0.14)',
  onAccent: '#0F1712',
  danger: '#FF7A59',
  onDanger: '#1A0A05',
};

const light: typeof dark = {
  dark: false,
  bg: '#EEF1E8',
  surface: '#FFFFFF',
  surface2: '#E2E7DA',
  text: '#16241B',
  textDim: '#5E6B60',
  line: '#D5DBCC',
  accent: '#C6EF2E',
  accentText: '#3B6B14',
  accentSoft: 'rgba(198,239,46,0.30)',
  onAccent: '#16241B',
  danger: '#C2410C',
  onDanger: '#FFF4EE',
};

export type Theme = typeof dark;

export function useTheme(): Theme {
  const system = useColorScheme();
  const pref = useStore(s => s.settings.appearance);
  const mode = pref === 'system' ? system : pref;
  return mode === 'light' ? light : dark;
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
