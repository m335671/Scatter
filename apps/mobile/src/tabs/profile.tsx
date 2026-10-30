// Onglet Profil : compte, préférences, données locales, serveur.
import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { connect, updateMe } from '../api';
import { clearStats } from '../stats';
import { DEFAULT_SERVER, setState, useStore, type Settings } from '../store';
import { fonts, radius, useTheme } from '../theme';
import { Group, Row, Segmented, showDialog } from '../ui';
import { LocalDataNotice } from './activity';

export function ProfileTab() {
  const t = useTheme();
  const router = useRouter();
  const user = useStore(s => s.user);
  const settings = useStore(s => s.settings);
  const connected = useStore(s => s.connected);
  const [server, setServer] = useState(settings.serverUrl || DEFAULT_SERVER);

  const patch = (p: Partial<Settings>) => setState(s => ({ settings: { ...s.settings, ...p } }));

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
