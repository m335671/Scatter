import Svg, { Circle } from 'react-native-svg';

/** La marque Scatter : la zone en pointillés, un joueur qui s'en échappe. Même géométrie que assets/brand/mark.svg. */
export function Mark({ size = 34, color, dot }: { size?: number; color: string; dot: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 34 34" accessibilityLabel="Scatter">
      <Circle cx={17} cy={17} r={15} fill="none" stroke={color} strokeWidth={2} strokeDasharray="3 3" />
      <Circle cx={20} cy={14} r={8} fill="none" stroke={color} strokeWidth={2} />
      <Circle cx={22} cy={12} r={3.2} fill={dot} />
    </Svg>
  );
}
