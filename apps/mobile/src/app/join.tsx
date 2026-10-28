import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { useRouter } from 'expo-router';
import { emit } from '../api';
import { askLocation } from '../location';
import { useTheme } from '../theme';
import { BackHeader, Button, Field, Screen, T } from '../ui';

export default function Join() {
  const t = useTheme();
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function join() {
    setBusy(true);
    setError('');
    try {
      await emit('join', { code });
      await askLocation().catch(() => {});
      router.replace('/lobby');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1, gap: 12 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <BackHeader />
        <T kind="title" style={{ marginTop: 16 }}>Rejoindre une partie</T>
        <T kind="dim">Demande le code à l'hôte. Il est affiché en haut de son salon.</T>
        <Field
          value={code} onChangeText={s => setCode(s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
          placeholder="TACO42" autoFocus autoCapitalize="characters" autoCorrect={false}
          error={!!error} returnKeyType="go" onSubmitEditing={() => code.length === 6 && join()}
          style={{ letterSpacing: 4 }}
        />
        {error ? <T style={{ color: t.accentText }}>{error}</T> : null}
        <View style={{ flex: 1 }} />
        <Button title="Rejoindre" onPress={join} loading={busy} disabled={code.length !== 6} />
      </KeyboardAvoidingView>
    </Screen>
  );
}
