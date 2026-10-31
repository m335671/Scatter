// Composants de base : une seule source pour les couleurs, typos et arrondis.
import { type ReactNode, useEffect, useState } from 'react';
import {
  ActivityIndicator, Dimensions, Keyboard, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View,
  type PressableProps, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowRightIcon, CaretLeftIcon, CaretRightIcon } from './icons';
import { useRouter } from 'expo-router';
import { fonts, radius, useTheme } from './theme';
import { setState, useStore, type Dialog } from './store';

export function Screen({ children, scroll, style }: { children: ReactNode; scroll?: boolean; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  // Toucher hors d'un champ ou faire défiler ferme le clavier (iOS n'a pas de geste pour ça).
  const inner = scroll
    ? <ScrollView contentContainerStyle={[{ padding: 16, paddingBottom: 40, gap: 12 }, style]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">{children}</ScrollView>
    : <Pressable accessible={false} onPress={Keyboard.dismiss} style={[{ flex: 1, padding: 16, gap: 12 }, style]}>{children}</Pressable>;
  return <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>{inner}</SafeAreaView>;
}

type TextKind = 'hero' | 'title' | 'h2' | 'body' | 'dim' | 'label' | 'small' | 'eyebrow' | 'mono';

export function T({ kind = 'body', style, children, ...rest }: { kind?: TextKind; style?: StyleProp<TextStyle>; children: ReactNode; numberOfLines?: number; selectable?: boolean }) {
  const t = useTheme();
  const k: Record<TextKind, TextStyle> = {
    hero: { fontFamily: fonts.hero, fontSize: 52, lineHeight: 54, color: t.text, letterSpacing: -1 },
    title: { fontFamily: fonts.hero, fontSize: 36, lineHeight: 40, color: t.text, letterSpacing: -0.2 },
    h2: { fontFamily: fonts.display, fontSize: 22, lineHeight: 26, color: t.text },
    body: { fontFamily: fonts.body, fontSize: 17, lineHeight: 23, color: t.text },
    dim: { fontFamily: fonts.body, fontSize: 16, lineHeight: 22, color: t.textDim },
    label: { fontFamily: fonts.medium, fontSize: 14, color: t.textDim },
    small: { fontFamily: fonts.medium, fontSize: 13, color: t.textDim },
    eyebrow: { fontFamily: fonts.monoMedium, fontSize: 12, letterSpacing: 1, color: t.textDim },
    mono: { fontFamily: fonts.mono, fontSize: 24, color: t.text },
  };
  return <Text style={[k[kind], style]} {...rest}>{children}</Text>;
}

/** Bouton pilule. `arrow` : flèche dans sa propre pastille, calée à droite. */
export function Button({ title, onPress, kind = 'primary', loading, disabled, style, arrow }: {
  title: string; onPress?: () => void; kind?: 'primary' | 'secondary' | 'ghost' | 'danger'; loading?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>; arrow?: boolean;
}) {
  const t = useTheme();
  const bg = { primary: t.accent, secondary: t.surface, ghost: 'transparent', danger: t.danger }[kind];
  const fg = { primary: t.onAccent, secondary: t.text, ghost: t.textDim, danger: t.onDanger }[kind];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        { backgroundColor: bg, borderRadius: radius.pill, height: 58, alignItems: 'center', justifyContent: arrow ? 'space-between' : 'center', flexDirection: 'row', paddingLeft: arrow ? 22 : 20, paddingRight: arrow ? 7 : 20 },
        kind === 'secondary' && { borderWidth: 1, borderColor: t.line },
        (disabled && !loading) && { opacity: 0.4 },
        pressed && { transform: [{ scale: 0.98 }], opacity: 0.9 },
        style,
      ]}
    >
      {loading
        ? <ActivityIndicator color={fg} style={{ flex: 1 }} />
        : <Text style={{ fontFamily: fonts.bold, fontSize: 18, color: fg, flexShrink: 1 }} numberOfLines={1}>{title}</Text>}
      {arrow && !loading && (
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: kind === 'primary' ? t.onAccent : t.accent, alignItems: 'center', justifyContent: 'center' }}>
          <ArrowRightIcon size={20} color={kind === 'primary' ? t.accent : t.onAccent} weight="bold" />
        </View>
      )}
    </Pressable>
  );
}

export function BackHeader({ title, right }: { title?: string; right?: ReactNode }) {
  const t = useTheme();
  const router = useRouter();
  return (
    <View style={{ height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <View style={{ minWidth: 90 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Retour" hitSlop={8} onPress={() => router.canGoBack() ? router.back() : router.replace('/')}
          style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: t.surface, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.94 : 1 }] })}>
          <CaretLeftIcon size={20} color={t.text} weight="bold" />
        </Pressable>
      </View>
      {title ? <Text style={{ fontFamily: fonts.monoMedium, fontSize: 12, letterSpacing: 1, color: t.textDim }}>{title.toUpperCase()}</Text> : null}
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
      <View style={{ backgroundColor: t.surface, borderRadius: radius.block, overflow: 'hidden', borderWidth: t.dark ? 1 : 0, borderColor: t.line }}>
        {items.map((c, i) => (
          <View key={i}>
            {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.line, marginLeft: 16 }} />}
            {c}
          </View>
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
      <View style={{ flex: 1, minWidth: 90 }}>
        <Text style={{ fontFamily: danger ? fonts.semibold : fonts.body, fontSize: 17, color: danger ? t.danger : t.text }}>{title}</Text>
        {sub ? <Text style={{ fontFamily: fonts.body, fontSize: 15, color: t.textDim, marginTop: 2 }}>{sub}</Text> : null}
      </View>
      {value ? <Text style={{ fontFamily: fonts.body, fontSize: 17, color: t.textDim }} numberOfLines={1}>{value}</Text> : null}
      {right ? <View style={{ flexShrink: 0 }}>{right}</View> : null}
      {onPress && !right && !danger ? <CaretRightIcon size={18} color={t.textDim} /> : null}
    </Pressable>
  );
}

export function Segmented<V extends string | number>({ options, value, onChange, stretch }: {
  options: { value: V; label: string }[]; value: V; onChange: (v: V) => void; stretch?: boolean;
}) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: t.surface2, borderRadius: radius.inner, padding: 3 }}>
      {options.map(o => {
        const on = o.value === value;
        return (
          <Pressable key={String(o.value)} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => onChange(o.value)}
            style={{ height: 40, justifyContent: 'center', alignItems: 'center', borderRadius: radius.inner - 3, backgroundColor: on ? t.accent : 'transparent', flexGrow: stretch ? 1 : 0, paddingHorizontal: 14 }}>
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
  return <Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: t.accent, false: t.surface2 }} thumbColor={value ? t.onAccent : t.textDim} />;
}

export function Field(props: TextInputProps & { prefix?: string; ok?: boolean; error?: boolean; right?: ReactNode }) {
  const t = useTheme();
  const { prefix, ok, error, right, style, ...rest } = props;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderColor: error ? t.danger : ok ? t.line : t.accent, borderRadius: radius.block, backgroundColor: t.surface, paddingHorizontal: 18, height: 72 }}>
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

/** Boîte de dialogue aux couleurs de l'app, à la place des alertes Android/iOS natives. */
export const showDialog = (dialog: Dialog) => setState({ dialog });

/** Première lettre d'un nom pour un avatar. Array.from découpe par caractère : un emoji n'est pas coupé en deux. */
export const initial = (name: string) => (Array.from(name)[0] ?? '').toUpperCase();

export function DialogHost() {
  const t = useTheme();
  const d = useStore(s => s.dialog);
  const close = () => setState({ dialog: null });
  const actions = d?.actions?.length ? d.actions : [{ label: 'OK', kind: 'primary' as const }];
  return (
    <Modal visible={!!d} transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 24 }} onPress={close} accessibilityLabel="Fermer">
        <Pressable style={{ backgroundColor: t.bg, borderRadius: radius.block + 6, padding: 22, gap: 10, borderWidth: 1, borderColor: t.line }} onPress={() => {}} accessibilityRole="alert">
          <Text style={{ fontFamily: fonts.hero, fontSize: 26, lineHeight: 29, color: t.text, letterSpacing: -0.5 }}>{d?.title}</Text>
          {d?.message ? <Text style={{ fontFamily: fonts.body, fontSize: 16, lineHeight: 22, color: t.textDim }}>{d.message}</Text> : null}
          <View style={{ gap: 10, marginTop: 10 }}>
            {actions.map(a => (
              <Button key={a.label} title={a.label}
                kind={a.kind === 'cancel' ? 'secondary' : a.kind === 'danger' ? 'danger' : 'primary'}
                style={a.kind === 'cancel' ? undefined : { height: 54 }}
                onPress={() => { close(); a.onPress?.(); }} />
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * Hauteur du clavier affiché. Android en plein écran et iOS ne redimensionnent pas la fenêtre :
 * chaque écran remonte son contenu lui-même.
 */
export function useKeyboardHeight() {
  const [h, setH] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', e =>
      setH(Math.max(e.endCoordinates.height, Dimensions.get('screen').height - e.endCoordinates.screenY)));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setH(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return h;
}

/** Espace vide de la hauteur du clavier : à mettre en bas d'un écran avec un champ de saisie. */
export function KeyboardSpacer() {
  const kb = useKeyboardHeight();
  const insets = useSafeAreaInsets();
  return <View style={{ height: Math.max(0, kb - insets.bottom) }} />;
}
