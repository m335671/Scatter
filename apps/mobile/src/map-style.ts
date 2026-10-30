// Fond de carte aux couleurs de l'app : on télécharge le style OpenFreeMap et on recolore ses couches.
// Les tuiles restent celles d'OpenFreeMap ; seules les couleurs changent.
import { useSyncExternalStore } from 'react';
import type { StyleSpecification } from '@maplibre/maplibre-react-native';

type Mode = 'dark' | 'light';
const SOURCE: Record<Mode, string> = {
  dark: 'https://tiles.openfreemap.org/styles/dark',
  light: 'https://tiles.openfreemap.org/styles/positron',
};

const PALETTE: Record<Mode, Record<string, string>> = {
  dark: {
    bg: '#0F1712', land: '#111A14', park: '#17271D', water: '#14232B', building: '#18231C', buildingLine: '#202D24',
    road: '#22312A', major: '#2B3C32', casing: '#16201A', label: '#7E917F', waterLabel: '#5F7F8C', halo: '#0F1712',
  },
  light: {
    bg: '#EEF1E8', land: '#EAEEE3', park: '#D6E4C8', water: '#C4D9DC', building: '#E1E5D9', buildingLine: '#D5DBCC',
    road: '#FFFFFF', major: '#FFFFFF', casing: '#D5DBCC', label: '#5E6B60', waterLabel: '#4F7A82', halo: '#EEF1E8',
  },
};

type Layer = { id: string; type: string; paint?: Record<string, unknown> };

function recolor(style: { layers: Layer[] }, mode: Mode) {
  const c = PALETTE[mode];
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
  return style;
}

const cache: Partial<Record<Mode, StyleSpecification>> = {};
const pending: Partial<Record<Mode, Promise<void>>> = {};
const listeners = new Set<() => void>();

function load(mode: Mode) {
  pending[mode] ??= fetch(SOURCE[mode])
    .then(r => r.json())
    .then(s => { cache[mode] = recolor(s, mode) as unknown as StyleSpecification; listeners.forEach(l => l()); })
    .catch(() => { pending[mode] = undefined; }); // réessai au prochain affichage
  return pending[mode];
}

/** À appeler au lancement : le style est prêt avant la première carte. */
export const preloadMapStyles = () => { load('dark'); load('light'); };

/** Style recoloré, ou le style OpenFreeMap d'origine tant qu'il n'est pas chargé (hors ligne par exemple). */
export function useMapStyle(dark: boolean): string | StyleSpecification {
  const mode: Mode = dark ? 'dark' : 'light';
  load(mode);
  return useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, () => cache[mode] ?? SOURCE[mode]);
}
