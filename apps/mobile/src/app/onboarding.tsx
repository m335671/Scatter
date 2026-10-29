import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CaretLeftIcon, CheckIcon } from 'phosphor-react-native';
import { register, usernameAvailable } from '../api';
import { askLocation } from '../location';
import { useStore } from '../store';
import { fonts, radius, useTheme } from '../theme';
import { Button, Field, Screen, Steps, T, KeyboardSpacer } from '../ui';

const TOTAL = 3;
const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9_]/g, '').slice(0, 20);

export default function Onboarding() {
  const t = useTheme();
  const router = useRouter();
  const hasAccount = useStore(s => !!s.token);
  const [step, setStep] = useState(hasAccount ? 3 : 1);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [available, setAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Vérifie la disponibilité du @username pendant la frappe.
  useEffect(() => {
    if (step !== 2) return;
    setAvailable(null);
    if (username.length < 3) return;
    const id = setTimeout(() => usernameAvailable(username).then(setAvailable).catch(() => setAvailable(null)), 350);
    return () => clearTimeout(id);
  }, [username, step]);

  async function next() {
    setError('');
    if (step === 1) {
      if (!username) setUsername(slug(name));
      return setStep(2);
    }
    if (step === 2) {
      setBusy(true);
      try {
        await register(name.trim(), username);
        setStep(3);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
      return;
    }
    await askLocation().catch(() => {});
    router.replace('/');
  }

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 48 }}>
      <View style={{ width: 90 }}>{step === 2 ? <BackHeaderMini onPress={() => setStep(1)} /> : null}</View>
      <Steps step={step} total={TOTAL} />
      <T kind="dim" style={{ width: 90, textAlign: 'right' }}>{step} sur {TOTAL}</T>
    </View>
  );

  return (
    <Screen>
        {header}
        {step === 1 && (
          <>
            <T kind="title" style={{ marginTop: 24 }}>On t'appelle comment ?</T>
            <T kind="dim">C'est le nom qui s'affiche sur la carte et dans la radio.</T>
            <Field value={name} onChangeText={setName} placeholder="Ton nom" autoFocus maxLength={24} returnKeyType="next" onSubmitEditing={() => name.trim() && next()} />
            <View style={{ backgroundColor: t.surface, borderRadius: radius.block, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <T kind="dim">Sur la carte</T>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: t.accent }} />
                <View style={{ backgroundColor: t.bg, borderRadius: radius.inner, paddingHorizontal: 12, paddingVertical: 6 }}>
                  <T style={{ fontFamily: fonts.bold, fontSize: 15 }}>{name.trim() || 'Toi'}</T>
                </View>
              </View>
            </View>
          </>
        )}
        {step === 2 && (
          <>
            <T kind="title" style={{ marginTop: 24 }}>Choisis un nom d'utilisateur</T>
            <T kind="dim">Personne d'autre ne peut l'avoir. Lettres, chiffres et _ uniquement.</T>
            <Field
              prefix="@" value={username} onChangeText={s => setUsername(slug(s))} autoFocus autoCapitalize="none" autoCorrect={false}
              ok={available === true} error={available === false}
              right={available ? <CheckIcon size={26} color={t.accent} weight="bold" /> : null}
            />
            {available === true && <T style={{ fontFamily: fonts.semibold }}>@{username} est à toi.</T>}
            {available === false && <T style={{ color: t.accentText, fontFamily: fonts.semibold }}>@{username} est déjà pris.</T>}
          </>
        )}
        {step === 3 && (
          <>
            <T kind="title" style={{ marginTop: 24 }}>Ta position, même écran éteint</T>
            <T kind="dim">
              Pendant une manche, ton téléphone reste dans ta poche. Choisis « Toujours autoriser » pour que ta position continue d'être envoyée.
            </T>
            <T kind="dim">
              Elle n'est partagée que pendant une manche, avec ton équipe en direct et avec l'équipe adverse au moment des pings.
            </T>
          </>
        )}
        <View style={{ flex: 1 }} />
        {error ? <T style={{ color: t.accentText, textAlign: 'center' }}>{error}</T> : null}
        <Button
          title={step === 3 ? 'Autoriser la position' : 'Continuer'}
          onPress={next}
          loading={busy}
          disabled={(step === 1 && !name.trim()) || (step === 2 && available !== true)}
        />
        {step === 3 && <Button kind="ghost" title="Plus tard" onPress={() => router.replace('/')} />}
      <KeyboardSpacer />
    </Screen>
  );
}

function BackHeaderMini({ onPress }: { onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Retour" hitSlop={12} onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      <CaretLeftIcon size={24} color={t.accentText} weight="bold" />
      <T style={{ color: t.accentText, fontFamily: fonts.semibold, fontSize: 18 }}>Retour</T>
    </Pressable>
  );
}
