// Onglet Profil : compte, préférences, données locales.
import { useState } from 'react';
import { AppState, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { getAppIconName, setAlternateAppIcon, supportsAlternateIcons } from 'expo-alternate-app-icons';
import { updateMe } from '../api';
import { clearStats } from '../stats';
import { getState, setState, useStore, type Settings } from '../store';
import { CheckIcon } from '../icons';
import { PALETTES, PALETTE_IDS, fonts, notifColor, radius, themeOf, useTheme, type PaletteId } from '../theme';
import { Mark } from '../logo';
import { Group, Row, Segmented, Toggle, initial, showDialog } from '../ui';
import { LocalDataNotice } from './activity';

export function ProfileTab() {
  const t = useTheme();
  const router = useRouter();
  const user = useStore(s => s.user);
  const settings = useStore(s => s.settings);
  const connected = useStore(s => s.connected);

  const patch = (p: Partial<Settings>) => setState(s => ({ settings: { ...s.settings, ...p } }));
  const dyn = settings.dynamicColors;

  // Alert.prompt n'existe que sur iOS : on édite le nom et le username en ligne.
  const [edit, setEdit] = useState<null | 'name' | 'username'>(null);
  const [draft, setDraft] = useState('');

  async function save() {
    try {
      await updateMe(edit === 'name' ? { name: draft.trim() } : { username: draft.trim().toLowerCase() });
      setEdit(null);
    } catch (e) {
      showDialog({ title: 'Modification impossible', message: (e as Error).message });
    }
  }

  const input = (value: string, onChange: (s: string) => void, onSubmit: () => void, extra = {}) => (
    <TextInput value={value} onChangeText={onChange} onSubmitEditing={onSubmit} autoFocus autoCapitalize="none" autoCorrect={false}
      selectionColor={t.accent} placeholderTextColor={t.textDim}
      style={{ marginHorizontal: 16, marginVertical: 10, height: 48, borderRadius: radius.inner, backgroundColor: t.surface2, paddingHorizontal: 14, fontFamily: fonts.body, fontSize: 17, color: t.text }}
      {...extra} />
  );

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32, gap: 12 }} keyboardShouldPersistTaps="handled">
      <Text accessibilityRole="header" style={{ fontFamily: fonts.hero, fontSize: 52, lineHeight: 52, letterSpacing: -1, color: t.text, marginHorizontal: 4 }}>Profil</Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: t.surface, borderWidth: 1, borderColor: t.line, borderRadius: radius.block, padding: 14 }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: t.dark ? t.surface2 : t.text, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: fonts.hero, fontSize: 26, color: t.accent }}>{initial(user?.name ?? '')}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 20, color: t.text }} numberOfLines={1}>{user?.name}</Text>
          <Text style={{ fontFamily: fonts.monoMedium, fontSize: 13, color: t.textDim }}>@{user?.username}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: connected ? t.accent : t.danger }} />
          <Text style={{ fontFamily: fonts.monoMedium, fontSize: 11, color: t.textDim }}>{connected ? 'EN LIGNE' : 'HORS LIGNE'}</Text>
        </View>
      </View>

      <Group label="Compte">
        {edit === 'name' ? input(draft, setDraft, save, { maxLength: 24, returnKeyType: 'done' })
          : <Row title="Nom" value={user?.name} onPress={() => { setDraft(user?.name ?? ''); setEdit('name'); }} />}
        {edit === 'username' ? input(draft, setDraft, save, { maxLength: 20, returnKeyType: 'done' })
          : <Row title="Nom d'utilisateur" value={user ? `@${user.username}` : ''} onPress={() => { setDraft(user?.username ?? ''); setEdit('username'); }} />}
      </Group>

      <Group label="Préférences" footer="La nuit, Sombre fatigue moins les yeux et risque moins de te trahir.">
        <Row title="Unités" right={<Segmented value={settings.units} onChange={units => patch({ units })} options={[{ value: 'km', label: 'km' }, { value: 'mi', label: 'mi' }]} />} />
        <Row title="Apparence" right={
          <Segmented value={settings.appearance} onChange={appearance => patch({ appearance })}
            options={[{ value: 'system', label: 'Auto' }, { value: 'light', label: 'Clair' }, { value: 'dark', label: 'Sombre' }]} />
        } />
      </Group>

      <Group label="Couleurs" footer={!dyn.enabled ? "La couleur de toute l'app, carte comprise."
        : dyn.by === 'mode' ? "En salon et en partie, la couleur suit le mode joué. Partout ailleurs, c'est ta palette."
        : "En partie, la couleur suit ton rôle dès qu'il est tiré. Partout ailleurs, c'est ta palette."}>
        <View style={{ paddingVertical: 12 }}>
          <PalettePicker value={settings.palette} onChange={palette => patch({ palette })} />
        </View>
        <Row title="En partie" right={
          <Segmented value={dyn.enabled ? dyn.by : 'off'} onChange={v => patch({ dynamicColors: { ...dyn, enabled: v !== 'off', by: v === 'off' ? dyn.by : v } })}
            options={[{ value: 'off', label: 'Fixe' }, { value: 'mode', label: 'Mode' }, { value: 'role', label: 'Rôle' }]} />
        } />
        {dyn.enabled && (dyn.by === 'mode'
          ? [['classic', 'Classique'], ['zombie', 'Zombie']] as const
          : [['hunter', 'Chasseur'], ['fugitive', 'Fugitif']] as const
        ).map(([key, label]) => (
          <View key={key} style={{ paddingVertical: 12, gap: 8 }}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: t.text, marginLeft: 16 }}>{label}</Text>
            <PalettePicker value={dyn[key]} onChange={id => patch({ dynamicColors: { ...dyn, [key]: id } })} />
          </View>
        ))}
      </Group>

      {supportsAlternateIcons && <AppIconGroup />}

      <Group label="Notifications" footer="S'applique dès la prochaine partie. L'aperçu montre un Android proche de la version d'origine : selon la marque du téléphone et sa version d'Android, la couleur peut s'afficher autrement, voire pas du tout.">
        <NotifPreview palette={settings.notifPalette} />
        <View style={{ paddingVertical: 12 }}>
          <PalettePicker value={settings.notifPalette} onChange={notifPalette => patch({ notifPalette })} />
        </View>
      </Group>

      <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: t.textDim, marginLeft: 4, marginTop: 8 }}>Tes données</Text>
      <LocalDataNotice />
      <Group>
        <Row title="Effacer mes stats" danger onPress={() => showDialog({
          title: 'Effacer tes stats ?', message: 'Toutes tes parties enregistrées sur ce téléphone seront supprimées. Exporte-les avant si tu veux les garder.',
          actions: [{ label: 'Effacer', kind: 'danger', onPress: clearStats }, { label: 'Annuler', kind: 'cancel' }],
        })} />
      </Group>

      <Group label="Aide">
        <Row title="Comment ça marche" onPress={() => router.push('/tutorial')} />
        <Row title="Autorisations" sub="Position, caméra, notifications, batterie" onPress={() => router.push('/permissions')} />
      </Group>

      <Text style={{ fontFamily: fonts.monoMedium, fontSize: 12, color: t.textDim, textAlign: 'center', marginTop: 8 }}>SCATTER · v{Constants.expoConfig?.version}</Text>
    </ScrollView>
  );
}

const iconName = (id: PaletteId) => (id === 'foret' ? null : id[0].toUpperCase() + id.slice(1));

// Android : changer d'icône désactive l'entrée de l'app qui tourne, et certains téléphones (Samsung) ferment l'app aussitôt.
// On applique donc le changement quand l'app passe en arrière-plan : si elle est fermée à ce moment-là, personne ne le voit.
// Jamais pendant une partie (salon compris) : la fermeture couperait la connexion et le suivi GPS.
let pendingIcon: PaletteId | null = null;
if (Platform.OS === 'android') {
  AppState.addEventListener('change', s => {
    if (s !== 'background' || !pendingIcon) return;
    const { game, lobby } = getState();
    if (lobby && game?.phase !== 'ended') return; // retenté au prochain passage en arrière-plan
    const id = pendingIcon;
    pendingIcon = null;
    setAlternateAppIcon(iconName(id)).catch(() => {});
  });
}

/** Couleur de l'icône de l'app : une icône par palette, compilée dans l'app (assets/icons). Forêt = l'icône d'origine. */
function AppIconGroup() {
  const t = useTheme();
  const phase = useStore(s => s.game?.phase);
  const playing = phase === 'headstart' || phase === 'hunt';
  // L'icône active est lue sur le téléphone (vraie même après une réinstallation) : rien à enregistrer.
  const [icon, setIcon] = useState<PaletteId>(() => pendingIcon ?? (getAppIconName()?.toLowerCase() as PaletteId | undefined) ?? 'foret');
  const p = themeOf(icon, true);

  async function choose(id: PaletteId) {
    if (playing) return showDialog({ title: 'Pas pendant une partie', message: "Change l'icône une fois la partie finie." });
    if (Platform.OS === 'android') {
      pendingIcon = id;
      setIcon(id);
      return;
    }
    try {
      await setAlternateAppIcon(iconName(id));
      setIcon(id);
    } catch (e) {
      showDialog({ title: 'Icône inchangée', message: (e as Error).message });
    }
  }

  return (
    <Group label="Icône de l'app" footer={Platform.OS === 'android'
      ? "La nouvelle icône s'applique quand tu quittes l'app. L'écran d'accueil peut mettre quelques secondes à l'afficher."
      : 'Le système confirme le changement.'}>
      <View accessibilityLabel="Aperçu de l'icône" style={{ alignItems: 'center', gap: 6, paddingTop: 16 }}>
        <View style={{ width: 72, height: 72, borderRadius: 18, backgroundColor: p.bg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: t.line }}>
          <Mark size={46} color={p.text} dot={p.accent} />
        </View>
        <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: t.text }}>Scatter</Text>
      </View>
      <View style={{ paddingVertical: 12, opacity: playing ? 0.4 : 1 }}>
        <PalettePicker value={icon} onChange={choose} />
      </View>
    </Group>
  );
}

/** Aperçu de la notification affichée pendant une partie, façon Android. */
function NotifPreview({ palette }: { palette: PaletteId }) {
  // Android colore toute la notification du suivi GPS : fond à la couleur choisie, texte foncé ou clair selon le contraste.
  const color = notifColor(palette);
  const lum = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16) / 255).map(c => (c <= 0.04 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * lum[0] + 0.7152 * lum[1] + 0.0722 * lum[2];
  const ink = (L + 0.05) / 0.05 > 1.05 / (L + 0.05) ? '#1A1A1A' : '#FFFFFF'; // le plus contrasté, comme Android
  return (
    <View accessibilityLabel="Aperçu de la notification" style={{ marginHorizontal: 12, marginTop: 12, borderRadius: 22, backgroundColor: color, padding: 14, flexDirection: 'row', gap: 12 }}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#0F1712', alignItems: 'center', justifyContent: 'center' }}>
        <Mark size={22} color="#D4FF3A" dot="#D4FF3A" />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: ink }}>Scatter · Maintenant</Text>
        <Text style={{ fontFamily: fonts.bold, fontSize: 15, color: ink }}>Scatter</Text>
        <Text style={{ fontFamily: fonts.body, fontSize: 14, lineHeight: 19, color: ink }}>Partie en cours. Ta position est partagée avec le serveur de jeu.</Text>
      </View>
    </View>
  );
}

/** Palettes en aperçu : fond, surface et accent de chacune, dans l'apparence actuelle. */
function PalettePicker({ value, onChange }: { value: PaletteId; onChange: (id: PaletteId) => void }) {
  const t = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
      {PALETTE_IDS.map(id => {
        const p = themeOf(id, t.dark);
        const on = id === value;
        return (
          <Pressable key={id} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={PALETTES[id].name} onPress={() => onChange(id)}
            style={({ pressed }) => ({ alignItems: 'center', gap: 6, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
            <View style={{ width: 64, height: 64, borderRadius: 18, backgroundColor: p.bg, borderWidth: on ? 2.5 : 1, borderColor: on ? t.text : t.line, padding: 8, justifyContent: 'space-between' }}>
              <View style={{ height: 10, borderRadius: 5, backgroundColor: p.surface2 }} />
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: p.accent, alignItems: 'center', justifyContent: 'center' }}>
                  {on && <CheckIcon size={13} color={p.onAccent} weight="bold" />}
                </View>
                <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: p.text, opacity: 0.85 }} />
              </View>
            </View>
            <Text style={{ fontFamily: on ? fonts.bold : fonts.medium, fontSize: 12, color: on ? t.text : t.textDim }}>{PALETTES[id].name}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
