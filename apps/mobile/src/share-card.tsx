// Carte d'une partie, à partager en image : trajet, résultat, chiffres clés.
import { type ComponentRef, forwardRef } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import type { LatLng } from '@kr/shared';
import { Mark } from './logo';
import type { GameRecord } from './stats';
import { fonts, radius } from './theme';
import { fmtClock, fmtDistance } from './ui';

// Toujours aux couleurs sombres de l'app, quel que soit le thème : l'image partagée reste reconnaissable.
const LIME = '#D4FF3A';
const INK = '#E8EEE4';
const DIM = '#9DB09F';
const BG = '#0F1712';
const PANEL = '#15201A';
const LINE = '#2C3B2F';

/** Projette le trajet (et la zone) dans un carré de `size` px, nord en haut. */
export function project(track: LatLng[], zone: GameRecord['zone'], size: number, pad: number) {
  const pts = [...track];
  if (zone) {
    const dLat = zone.radiusM / 111_320, dLng = zone.radiusM / (111_320 * Math.cos((zone.center.lat * Math.PI) / 180));
    pts.push({ lat: zone.center.lat + dLat, lng: zone.center.lng + dLng }, { lat: zone.center.lat - dLat, lng: zone.center.lng - dLng });
  }
  const lat0 = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xs = pts.map(p => p.lng * k), ys = pts.map(p => p.lat);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY, 1e-6);
  const scale = (size - pad * 2) / span;
  const ox = pad + ((size - pad * 2) - (maxX - minX) * scale) / 2;
  const oy = pad + ((size - pad * 2) - (maxY - minY) * scale) / 2;
  const to = (p: LatLng) => ({ x: ox + (p.lng * k - minX) * scale, y: oy + (maxY - p.lat) * scale });
  return { to, scale: scale / 111_320 };
}

export const ShareCard = forwardRef<ComponentRef<typeof View>, { record: GameRecord; name: string; units: 'km' | 'mi'; width: number }>(
  function ShareCard({ record: r, name, units, width }, ref) {
    const mapSize = width - 40;
    const hasTrack = r.track.length > 1;
    const p = hasTrack || r.zone ? project(r.track, r.zone, mapSize, 22) : null;
    const d = p && hasTrack ? r.track.map((pt, i) => `${i ? 'L' : 'M'}${p.to(pt).x.toFixed(1)},${p.to(pt).y.toFixed(1)}`).join(' ') : '';
    const start = p && hasTrack ? p.to(r.track[0]) : null;
    const end = p && hasTrack ? p.to(r.track.at(-1)!) : null;
    const zc = p && r.zone ? p.to(r.zone.center) : null;

    const role = r.role === 'hunter' ? 'Chasseur' : 'Fugitif';
    const date = new Date(r.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
    const headline = r.role === 'fugitive'
      ? (r.caught ? `Attrapé après ${fmtClock(r.survivedMs)}.` : `Tenu ${fmtClock(r.survivedMs)}.`)
      : `${r.captures} capture${r.captures > 1 ? 's' : ''}.`;
    const stat = (value: string, unit: string, label: string) => (
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: fonts.mono, fontSize: 24, color: INK }} numberOfLines={1} adjustsFontSizeToFit>
          {value}<Text style={{ fontSize: 14 }}>{unit}</Text>
        </Text>
        <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: DIM }}>{label}</Text>
      </View>
    );
    const dist = fmtDistance(r.distanceM, units).split(' ');

    return (
      <View ref={ref} collapsable={false} style={{ width, backgroundColor: BG, borderRadius: radius.block + 8, padding: 20, gap: 16, borderWidth: 1, borderColor: LINE }}>
        <View style={{ width: mapSize, height: mapSize, backgroundColor: PANEL, borderRadius: radius.block, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
          {p ? (
            <Svg width={mapSize} height={mapSize}>
              {zc && r.zone && <Circle cx={zc.x} cy={zc.y} r={r.zone.radiusM * p.scale} fill="rgba(212,255,58,0.06)" stroke={DIM} strokeWidth={2} strokeDasharray="6 5" />}
              {hasTrack && <Path d={d} fill="none" stroke={LIME} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />}
              {start && <Circle cx={start.x} cy={start.y} r={6} fill={PANEL} stroke={INK} strokeWidth={3} />}
              {end && <Circle cx={end.x} cy={end.y} r={7} fill={LIME} stroke={BG} strokeWidth={3} />}
            </Svg>
          ) : (
            <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: DIM }}>Pas de trajet enregistré</Text>
          )}
        </View>
        <View style={{ gap: 2 }}>
          <Text style={{ fontFamily: fonts.monoMedium, fontSize: 12, color: DIM }} numberOfLines={1}>{name} · {role} · {date}{r.training ? ' · Entraînement' : ''}</Text>
          <Text style={{ fontFamily: fonts.hero, fontSize: 34, lineHeight: 38, letterSpacing: -1, color: INK }} numberOfLines={1} adjustsFontSizeToFit>{headline}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {stat(dist[0], ` ${dist[1] ?? ''}`, 'parcourus')}
          {r.role === 'fugitive' ? stat(fmtClock(r.survivedMs), '', 'en fuite') : stat(String(r.captures), '', `capture${r.captures > 1 ? 's' : ''}`)}
          {stat(r.won ? 'Gagné' : 'Perdu', '', `en ${role.toLowerCase()}`)}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
          <Mark size={24} color={INK} dot={LIME} />
          <Text style={{ fontFamily: fonts.hero, fontSize: 22, color: INK, letterSpacing: -0.5 }}>scatter</Text>
        </View>
      </View>
    );
  },
);
