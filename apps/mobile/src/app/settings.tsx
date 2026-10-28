import { useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { connect, updateMe } from '../api';
import { setState, useStore, type Settings } from '../store';
import { fonts, radius, useTheme } from '../theme';
import { Group, Row, Screen, Segmented } from '../ui';

export default function SettingsScreen() {
  const t = useTheme();
  const router = useRouter();
  const user = useStore(s => s.user);
  const settings = useStore(s => s.settings);
  const connected = useStore(s => s.connected);
  const [server, setServer] = useState(settings.serverUrl);

  const patch = (p: Partial<Settings>) => setState(s => ({ settings: { ...s.settings, ...p } }));

  // Alert.prompt n'existe que sur iOS : on édite le nom et le username en ligne.
  const [edit, setEdit] = useState<null | 'name' | 'username'>(null);
  const [draft, setDraft] = useState('');

  async function save() {
    try {
      await updateMe(edit === 'name' ? { name: draft.trim() } : { username: draft.trim().toLowerCase() });
      setEdit(null);
    } catch (e) {
      Alert.alert('Oups', (e as Error).message);
    }
  }

  function saveServer() {
    patch({ serverUrl: server.trim() });
    connect();
  }

  const input = (value: string, onChange: (s: string) => void, onSubmit: () => void, extra = {}) => (
    <TextInput value={value} onChangeText={onChange} onSubmitEditing={onSubmit} autoFocus autoCapitalize="none" autoCorrect={false}
      selectionColor={t.accent} placeholderTextColor={t.textDim}
      style={{ marginHorizontal: 16, marginVertical: 10, height: 48, borderRadius: radius.inner, backgroundColor: t.surface2, paddingHorizontal: 14, fontFamily: fonts.body, fontSize: 17, color: t.text }}
      {...extra} />
  );

  return (
    <Screen scroll>
      <View style={{ height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: fonts.semibold, fontSize: 18, color: t.text }}>Réglages</Text>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ position: 'absolute', right: 0 }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 18, color: t.accentText }}>OK</Text>
        </Pressable>
      </View>

      <Group label="Compte">
        {edit === 'name' ? input(draft, setDraft, save, { maxLength: 24, returnKeyType: 'done' })
          : <Row title="Nom" value={user?.name} onPress={() => { setDraft(user?.name ?? ''); setEdit('name'); }} />}
        {edit === 'username' ? input(draft, setDraft, save, { maxLength: 20, returnKeyType: 'done' })
          : <Row title="Nom d'utilisateur" value={user ? `@${user.username}` : ''} onPress={() => { setDraft(user?.username ?? ''); setEdit('username'); }} />}
      </Group>

      <Group label="Sécurité" footer="Pour bloquer quelqu'un, appuie longuement sur son message dans la radio. Touche un joueur ici pour le débloquer.">
        {settings.blocked.length === 0
          ? <Row title="Aucun joueur bloqué" />
          : settings.blocked.map(b => (
            <Row key={b.id} title={b.name} value="Débloquer" onPress={() => patch({ blocked: settings.blocked.filter(x => x.id !== b.id) })} />
          ))}
      </Group>

      <Group footer="La nuit, Sombre fatigue moins les yeux et risque moins de te trahir.">
        <Row title="Unités" right={<Segmented value={settings.units} onChange={units => patch({ units })} options={[{ value: 'km', label: 'km' }, { value: 'mi', label: 'mi' }]} />} />
        <Row title="Apparence" right={
          <Segmented value={settings.appearance} onChange={appearance => patch({ appearance })}
            options={[{ value: 'system', label: 'Auto' }, { value: 'light', label: 'Clair' }, { value: 'dark', label: 'Sombre' }]} />
        } />
      </Group>

      <Group label="Serveur" footer={connected ? 'Connecté.' : 'Non connecté. Keep Runni\'n est open source : tu peux héberger ton propre serveur.'}>
        {input(server, setServer, saveServer, { autoFocus: false, keyboardType: 'url', placeholder: 'https://keeprunnin.exemple.fr', returnKeyType: 'done' })}
        {server.trim() !== settings.serverUrl && <Row title="Enregistrer l'adresse" onPress={saveServer} />}
      </Group>
    </Screen>
  );
}
