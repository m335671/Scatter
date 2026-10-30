// Fond de carte aux couleurs de la palette : on télécharge le style OpenFreeMap et on recolore ses couches.
// Les tuiles restent celles d'OpenFreeMap ; seules les couleurs changent.
import { useMemo, useSyncExternalStore } from 'react';
import type { StyleSpecification } from '@maplibre/maplibre-react-native';
import type { Theme } from './theme';

type Mode = 'dark' | 'light';
const SOURCE: Record<Mode, string> = {
  dark: 'https://tiles.openfreemap.org/styles/dark',
  light: 'https://tiles.openfreemap.org/styles/positron',
};

/** Mélange deux couleurs #RRGGBB (k = part de b). */
export function mix(a: string, b: string, k: number) {
  const c = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return '#' + [0, 1, 2].map(i => Math.round(c(a, i) * (1 - k) + c(b, i) * k).toString(16).padStart(2, '0')).join('');
}

/** Couleurs de la carte tirées de la palette : parcs et eau gardent une teinte verte et bleue discrète. */
function mapColors(t: Theme): Record<string, string> {
  return t.dark ? {
    bg: t.bg, land: mix(t.bg, t.surface, 0.4), park: mix(t.bg, '#3F7A4A', 0.2), water: mix(t.bg, '#3A6E92', 0.3),
    building: t.surface, buildingLine: t.line, road: t.surface2, major: mix(t.surface2, t.text, 0.08), casing: t.surface,
    label: t.textDim, waterLabel: mix(t.textDim, '#6FA8C8', 0.4), halo: t.bg,
  } : {
    bg: t.bg, land: mix(t.bg, t.surface2, 0.3), park: mix(t.bg, '#9CC08A', 0.35), water: mix(t.bg, '#8FB8CC', 0.45),
    building: t.surface2, buildingLine: t.line, road: '#FFFFFF', major: '#FFFFFF', casing: t.line,
    label: t.textDim, waterLabel: mix(t.textDim, '#4F7A92', 0.5), halo: t.bg,
  };
}

type Layer = { id: string; type: string; paint?: Record<string, unknown> };

function recolor(raw: { layers: Layer[] }, c: Record<string, string>) {
  const style = JSON.parse(JSON.stringify(raw)) as { layers: Layer[] };
  for (const l of style.layers) {
    const p = (l.paint ??= {});
    const id = l.id;
    if (l.type === 'background') p['background-color'] = c.bg;
    else if (l.type === 'fill') {
      if (/water/.test(id)) p['fill-color'] = c.water;
      else if (/building/.test(id)) { p['fill-color'] = c.building; p['fill-outline-color'] = c.buildingLine; }
      else if (/park|wood|grass/.test(id)) p['fill-color'] = c.park;
      else if (/landuse|landcover/.test(id)) p['fill-color'] = c.land;
      else p['fill-color'] = c.bg;
    } else if (l.type === 'line') {
      if (/waterway/.test(id)) p['line-color'] = c.water;
      else if (/casing|boundary|railway(?!.*dash)/.test(id)) p['line-color'] = c.casing;
      else if (/dash/.test(id)) p['line-color'] = c.bg;
      else if (/major|motorway|runway/.test(id)) p['line-color'] = c.major;
      else p['line-color'] = c.road;
    } else if (l.type === 'symbol' && 'text-color' in p) {
      p['text-color'] = /water/.test(id) ? c.waterLabel : c.label;
      p['text-halo-color'] = c.halo;
    }
  }
  return style as unknown as StyleSpecification;
}

const raw: Partial<Record<Mode, { layers: Layer[] }>> = {};
const pending: Partial<Record<Mode, Promise<void>>> = {};
const listeners = new Set<() => void>();
const recolored = new Map<string, StyleSpecification>();

function load(mode: Mode) {
  pending[mode] ??= fetch(SOURCE[mode])
    .then(r => r.json())
    .then(s => { raw[mode] = s; listeners.forEach(l => l()); })
    .catch(() => { pending[mode] = undefined; }); // réessai au prochain affichage
  return pending[mode];
}

/** À appeler au lancement : le style est prêt avant la première carte. */
export const preloadMapStyles = () => { load('dark'); load('light'); };

/** Style recoloré, ou le style OpenFreeMap d'origine tant qu'il n'est pas chargé (hors ligne par exemple). */
export function useMapStyle(t: Theme): string | StyleSpecification {
  const mode: Mode = t.dark ? 'dark' : 'light';
  load(mode);
  const base = useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, () => raw[mode]);
  return useMemo(() => {
    if (!base) return SOURCE[mode];
    const key = `${t.bg}${t.surface}${t.surface2}`;
    if (!recolored.has(key)) recolored.set(key, recolor(base, mapColors(t)));
    return recolored.get(key)!;
  }, [base, t]);
}
