import type { LatLng } from '@kr/shared';

/** Polygone approchant un cercle de `r` mètres (64 côtés). */
export function circle(c: LatLng, r: number): GeoJSON.Feature<GeoJSON.Polygon> {
  const coords: [number, number][] = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * 2 * Math.PI;
    coords.push([
      c.lng + (r * Math.sin(a)) / (111_320 * Math.cos((c.lat * Math.PI) / 180)),
      c.lat + (r * Math.cos(a)) / 111_320,
    ]);
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coords] } };
}

/** Zoom qui fait tenir une zone de `radiusM` mètres à l'écran. */
export const zoomFor = (radiusM: number) => 16 - Math.log2(Math.max(radiusM, 80) / 160);

/** « 45.9012° N · 4.6034° E » */
export const fmtLatLng = (p: LatLng) =>
  `${Math.abs(p.lat).toFixed(4)}° ${p.lat >= 0 ? 'N' : 'S'} · ${Math.abs(p.lng).toFixed(4)}° ${p.lng >= 0 ? 'E' : 'O'}`;
