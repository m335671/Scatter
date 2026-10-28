import Svg, { Circle } from 'react-native-svg';

/** La marque Keep Runni'n : la zone qui se resserre. Même géométrie que assets/brand/mark.svg. */
export function Mark({ size = 40, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="13 15 74 74" accessibilityLabel="Keep Runni'n">
      <Circle cx={50} cy={52} r={34} fill="none" stroke={color} strokeWidth={5} opacity={0.35} />
      <Circle cx={56} cy={47} r={23} fill="none" stroke={color} strokeWidth={6} opacity={0.65} />
      <Circle cx={61} cy={43} r={13} fill="none" stroke={color} strokeWidth={7} />
      <Circle cx={63} cy={42} r={5} fill={color} />
    </Svg>
  );
}
