// Onglet Profil : compte, préférences, données locales, serveur.
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { connect, updateMe } from '../api';
import { clearStats } from '../stats';
import { DEFAULT_SERVER, setState, useStore, type Settings } from '../store';
import { CheckIcon } from 'phosphor-react-native';
import { PALETTES, PALETTE_IDS, fonts, notifColor, radius, themeOf, useTheme, type PaletteId } from '../theme';
import { Mark } from '../logo';
import { Group, Row, Segmented, Toggle, showDialog } from '../ui';
import { LocalDataNotice } from './activity';

export function ProfileTab() {
  const t = useTheme();
  const router = useRouter();
  const user = useStore(s => s.user);
  const settings = useStore(s => s.settings);
  const connected = useStore(s => s.connected);
  const [server, setServer] = useState(settings.serverUrl || DEFAULT_SERVER);

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

  function saveServer() {
    // L'adresse du build n'est pas enregistrée : un futur build pourra la changer.
    patch({ serverUrl: server.trim() === DEFAULT_SERVER ? '' : server.trim() });
    connect();
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
          <Text style={{ fontFamily: fonts.hero, fontSize: 26, color: t.accent }}>{user?.name.slice(0, 1).toUpperCase()}</Text>
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

      <Group label="Couleurs" footer={dyn.enabled
        ? "En salon et en partie, la couleur suit le mode joué. Partout ailleurs, c'est ta palette."
        : "La couleur de toute l'app, carte comprise."}>
        <View style={{ paddingVertical: 12 }}>
          <PalettePicker value={settings.palette} onChange={palette => patch({ palette })} />
        </View>
        <Row title="Couleur selon le mode" sub="Une palette pour Classique, une autre pour Zombie"
          right={<Toggle value={dyn.enabled} onChange={enabled => patch({ dynamicColors: { ...dyn, enabled } })} />} />
        {dyn.enabled && (
          <View style={{ paddingVertical: 12, gap: 8 }}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: t.text, marginLeft: 16 }}>Classique</Text>
            <PalettePicker value={dyn.classic} onChange={classic => patch({ dynamicColors: { ...dyn, classic } })} />
          </View>
        )}
        {dyn.enabled && (
          <View style={{ paddingVertical: 12, gap: 8 }}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: t.text, marginLeft: 16 }}>Zombie</Text>
            <PalettePicker value={dyn.zombie} onChange={zombie => patch({ dynamicColors: { ...dyn, zombie } })} />
          </View>
        )}
      </Group>

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

      <Group label="Serveur" footer={connected ? 'Connecté.' : 'Non connecté. Scatter est open source : tu peux héberger ton propre serveur.'}>
        {input(server, setServer, saveServer, { autoFocus: false, keyboardType: 'url', placeholder: 'https://scatter.exemple.fr', returnKeyType: 'done' })}
        {server.trim() !== (settings.serverUrl || DEFAULT_SERVER) && <Row title="Enregistrer l'adresse" onPress={saveServer} />}
        {!!settings.serverUrl && <Row title="Revenir au serveur officiel" onPress={() => { setServer(DEFAULT_SERVER); patch({ serverUrl: '' }); connect(); }} />}
      </Group>

      <Text style={{ fontFamily: fonts.monoMedium, fontSize: 12, color: t.textDim, textAlign: 'center', marginTop: 8 }}>SCATTER · v{Constants.expoConfig?.version}</Text>
    </ScrollView>
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
