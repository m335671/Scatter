// Composants de base : une seule source pour les couleurs, typos et arrondis.
import { type ReactNode } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View,
  type PressableProps, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CaretLeftIcon, CaretRightIcon } from 'phosphor-react-native';
import { useRouter } from 'expo-router';
import { fonts, radius, useTheme } from './theme';

export function Screen({ children, scroll, style }: { children: ReactNode; scroll?: boolean; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const inner = scroll
    ? <ScrollView contentContainerStyle={[{ padding: 16, paddingBottom: 40, gap: 12 }, style]} keyboardShouldPersistTaps="handled">{children}</ScrollView>
    : <View style={[{ flex: 1, padding: 16, gap: 12 }, style]}>{children}</View>;
  return <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>{inner}</SafeAreaView>;
}

type TextKind = 'hero' | 'title' | 'h2' | 'body' | 'dim' | 'label' | 'small';

export function T({ kind = 'body', style, children, ...rest }: { kind?: TextKind; style?: StyleProp<TextStyle>; children: ReactNode; numberOfLines?: number; selectable?: boolean }) {
  const t = useTheme();
  const k: Record<TextKind, TextStyle> = {
    hero: { fontFamily: fonts.hero, fontSize: 112, lineHeight: 104, color: t.text, letterSpacing: -1 },
    title: { fontFamily: fonts.displayBlack, fontSize: 34, lineHeight: 38, color: t.text, letterSpacing: -0.5 },
    h2: { fontFamily: fonts.display, fontSize: 22, lineHeight: 26, color: t.text },
    body: { fontFamily: fonts.body, fontSize: 17, lineHeight: 23, color: t.text },
    dim: { fontFamily: fonts.body, fontSize: 16, lineHeight: 22, color: t.textDim },
    label: { fontFamily: fonts.medium, fontSize: 14, color: t.textDim },
    small: { fontFamily: fonts.medium, fontSize: 13, color: t.textDim },
  };
  return <Text style={[k[kind], style]} {...rest}>{children}</Text>;
}

export function Button({ title, onPress, kind = 'primary', loading, disabled, style }: {
  title: string; onPress?: () => void; kind?: 'primary' | 'secondary' | 'ghost' | 'danger'; loading?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const bg = { primary: t.accent, secondary: t.surface, ghost: 'transparent', danger: t.surface }[kind];
  const fg = { primary: t.onAccent, secondary: t.text, ghost: t.textDim, danger: t.accentText }[kind];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        { backgroundColor: bg, borderRadius: radius.block, height: 60, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
        (disabled && !loading) && { opacity: 0.4 },
        pressed && { transform: [{ scale: 0.98 }], opacity: 0.9 },
        style,
      ]}
    >
      {loading
        ? <ActivityIndicator color={fg} />
        : <Text style={{ fontFamily: fonts.bold, fontSize: 19, color: fg }} numberOfLines={1}>{title}</Text>}
    </Pressable>
  );
}

export function BackHeader({ title, right }: { title?: string; right?: ReactNode }) {
  const t = useTheme();
  const router = useRouter();
  return (
    <View style={{ height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Retour" hitSlop={12} onPress={() => router.canGoBack() ? router.back() : router.replace('/')} style={{ flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 90 }}>
        <CaretLeftIcon size={24} color={t.accentText} weight="bold" />
        <Text style={{ fontFamily: fonts.semibold, fontSize: 18, color: t.accentText }}>Retour</Text>
      </Pressable>
      {title ? <Text style={{ fontFamily: fonts.semibold, fontSize: 18, color: t.text }}>{title}</Text> : null}
      <View style={{ minWidth: 90, alignItems: 'flex-end' }}>{right}</View>
    </View>
  );
}

/** Groupe de lignes façon réglages iOS. */
export function Group({ children, label, footer }: { children: ReactNode; label?: string; footer?: string }) {
  const t = useTheme();
  const items = (Array.isArray(children) ? children : [children]).flat().filter(Boolean);
  return (
    <View style={{ gap: 8 }}>
      {label ? <T kind="label" style={{ marginLeft: 4, marginTop: 8 }}>{label}</T> : null}
      <View style={{ backgroundColor: t.surface, borderRadius: radius.block, overflow: 'hidden' }}>
        {items.map((c, i) => (
          <View key={i} style={i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line, marginLeft: 16 } : undefined}>{c}</View>
        ))}
      </View>
      {footer ? <T kind="small" style={{ marginHorizontal: 4, lineHeight: 19 }}>{footer}</T> : null}
    </View>
  );
}

export function Row({ title, sub, value, right, onPress, danger }: {
  title: string; sub?: string; value?: string; right?: ReactNode; onPress?: PressableProps['onPress']; danger?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [{ minHeight: 60, paddingVertical: 12, paddingRight: 16, paddingLeft: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }, pressed && { backgroundColor: t.surface2 }]}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: fonts.body, fontSize: 17, color: danger ? t.accentText : t.text }}>{title}</Text>
        {sub ? <Text style={{ fontFamily: fonts.body, fontSize: 15, color: t.textDim, marginTop: 2 }}>{sub}</Text> : null}
      </View>
      {value ? <Text style={{ fontFamily: fonts.body, fontSize: 17, color: t.textDim }} numberOfLines={1}>{value}</Text> : null}
      {right}
      {onPress && !right && !danger ? <CaretRightIcon size={18} color={t.textDim} /> : null}
    </Pressable>
  );
}

export function Segmented<V extends string | number>({ options, value, onChange }: {
  options: { value: V; label: string }[]; value: V; onChange: (v: V) => void;
}) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: t.surface2, borderRadius: radius.inner, padding: 3 }}>
      {options.map(o => {
        const on = o.value === value;
        return (
          <Pressable key={String(o.value)} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => onChange(o.value)}
            style={{ paddingHorizontal: 16, height: 40, justifyContent: 'center', alignItems: 'center', borderRadius: radius.inner - 3, backgroundColor: on ? t.accent : 'transparent', flexGrow: 1 }}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: on ? t.onAccent : t.text }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Stepper({ onMinus, onPlus, disabled }: { onMinus: () => void; onPlus: () => void; disabled?: boolean }) {
  const t = useTheme();
  const btn = (label: string, fn: () => void, a11y: string) => (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y} onPress={fn} disabled={disabled} hitSlop={4}
      style={({ pressed }) => ({ width: 48, height: 40, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.35 : pressed ? 0.6 : 1 })}>
      <Text style={{ fontFamily: fonts.semibold, fontSize: 24, color: t.text, marginTop: -2 }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', backgroundColor: t.surface2, borderRadius: radius.inner, alignItems: 'center' }}>
      {btn('−', onMinus, 'Diminuer')}
      <View style={{ width: StyleSheet.hairlineWidth, height: 20, backgroundColor: t.line }} />
      {btn('+', onPlus, 'Augmenter')}
    </View>
  );
}

export function Toggle({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const t = useTheme();
  return <Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: t.accent, false: t.surface2 }} thumbColor={t.onAccent} />;
}

export function Field(props: TextInputProps & { prefix?: string; ok?: boolean; error?: boolean; right?: ReactNode }) {
  const t = useTheme();
  const { prefix, ok, error, right, style, ...rest } = props;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderColor: error ? t.accent : ok ? t.textDim : t.accent, borderRadius: radius.block, backgroundColor: t.surface, paddingHorizontal: 18, height: 72 }}>
      {prefix ? <Text style={{ fontFamily: fonts.displayBlack, fontSize: 26, color: t.textDim }}>{prefix}</Text> : null}
      <TextInput
        placeholderTextColor={t.textDim}
        selectionColor={t.accent}
        style={[{ flex: 1, fontFamily: fonts.displayBlack, fontSize: 26, color: t.text, paddingVertical: 0 }, style]}
        {...rest}
      />
      {right}
    </View>
  );
}

/** Barre de progression des étapes d'onboarding. */
export function Steps({ step, total }: { step: number; total: number }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 6 }} accessibilityLabel={`Étape ${step} sur ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={{ width: 34, height: 5, borderRadius: 3, backgroundColor: i < step ? t.accent : t.surface2 }} />
      ))}
    </View>
  );
}

export const fmtClock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export const fmtDistance = (m: number, units: 'km' | 'mi') =>
  units === 'km'
    ? (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`)
    : (m < 1609 ? `${Math.round(m * 1.0936)} yd` : `${(m / 1609.34).toFixed(1)} mi`);
