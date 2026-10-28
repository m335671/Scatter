import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { PaperPlaneRightIcon } from 'phosphor-react-native';
import type { Channel, GameView } from '@kr/shared';
import { emit } from './api';
import { setState, useStore } from './store';
import { fonts, radius, useTheme } from './theme';
import { fmtClock, showDialog } from './ui';

const QUICK: Record<'hunter' | 'fugitive' | 'all', string[]> = {
  hunter: ["J'en vois un !", 'Surveillez le canal', 'Vous êtes où ?'],
  fugitive: ['Je suis repéré !', 'Je bouge', 'Vous êtes où ?'],
  all: ['Bonne chance !', 'Vous ne m\'aurez pas', 'Bien joué'],
};

/** Hauteur réservée à la barre d'onglets flottante de l'écran de partie. */
const TAB_SPACE = 104;

const ago = (ms: number) => (ms < 60_000 ? "à l'instant" : `il y a ${Math.floor(ms / 60_000)} min`);

/**
 * Hauteur du clavier affiché. Android en plein écran (edge-to-edge) ne redimensionne plus la fenêtre :
 * on remonte la saisie nous-mêmes.
 */
function useKeyboardHeight() {
  const [h, setH] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', e => setH(e.endCoordinates.height));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setH(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return h;
}

export function Radio({ game }: { game: GameView }) {
  const t = useTheme();
  const [channel, setChannel] = useState<Channel>('team');
  const chat = useStore(s => s.chat);
  const unread = useStore(s => s.unread);
  const huntersCanTalk = useStore(s => s.lobby?.rules.huntersCanTalk ?? true);
  const canTalk = channel === 'all' || huntersCanTalk || game.me.role === 'fugitive';
  const [text, setText] = useState('');
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const keyboard = useKeyboardHeight();

  const messages = chat.filter(m => m.channel === channel);
  // Le canal affiché est lu : on remet son compteur à zéro.
  useEffect(() => { setState(s => ({ unread: { ...s.unread, [channel]: 0 } })); }, [channel, messages.length]);

  const teamOnAir = game.team.filter(p => !p.caught).length;
  const teamName = game.me.role === 'hunter' ? 'chasseurs' : 'fugitifs';

  async function send(msg: string) {
    if (!msg.trim()) return;
    setText('');
    try { await emit('chat', { text: msg, channel }); } catch (e) { showDialog({ title: 'Message non envoyé', message: (e as Error).message }); }
  }

  const tab = (c: Channel, label: string) => {
    const on = channel === c;
    return (
      <Pressable key={c} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => setChannel(c)}
        style={{ flex: 1, height: 40, borderRadius: radius.inner - 3, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, backgroundColor: on ? t.accent : 'transparent' }}>
        <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: on ? t.onAccent : t.text }}>{label}</Text>
        {!on && unread[c] > 0 && (
          <View style={{ minWidth: 20, height: 20, borderRadius: 10, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }}>
            <Text style={{ fontFamily: fonts.bold, fontSize: 11, color: t.onAccent }}>{unread[c] > 9 ? '9+' : unread[c]}</Text>
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ paddingHorizontal: 16, paddingBottom: 12, gap: 12, borderBottomWidth: 1, borderBottomColor: t.line }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: fonts.displayBlack, fontSize: 40, color: t.text }} accessibilityRole="header">Radio</Text>
            <Text style={{ fontFamily: fonts.body, fontSize: 16, color: t.textDim }}>
              {channel === 'team' ? `Canal des ${teamName} · ${teamOnAir} à l'antenne` : 'Canal global · les deux équipes entendent'}
            </Text>
          </View>
          <View style={{ backgroundColor: t.surface, borderRadius: radius.block, paddingHorizontal: 16, paddingVertical: 10 }}>
            <Text style={{ fontFamily: fonts.displayBlack, fontSize: 20, color: t.text, fontVariant: ['tabular-nums'] }}>{fmtClock(game.huntEnd - game.clock)}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', backgroundColor: t.surface2, borderRadius: radius.inner, padding: 3 }}>
          {tab('team', 'Équipe')}
          {tab('all', 'Tous')}
        </View>
      </View>

      <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1, justifyContent: 'flex-end' }}
        keyboardShouldPersistTaps="handled" onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
        {messages.length === 0 && (
          <Text style={{ fontFamily: fonts.body, fontSize: 15, color: t.textDim, textAlign: 'center' }}>
            {channel === 'team' ? `Seuls les ${teamName} entendent ce canal.` : 'Ce canal est entendu par les deux équipes. Attention à ce que tu dis.'}
          </Text>
        )}
        {messages.map(m => {
          if (m.system) {
            return (
              <Text key={m.id} style={{ fontFamily: fonts.bold, fontSize: 15, color: t.accentText, textAlign: 'center', paddingHorizontal: 16 }}>
                {ago(game.clock - m.at)} · {m.text}
              </Text>
            );
          }
          const mine = m.from === game.me.id;
          return (
            <View key={m.id} style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
              {!mine && <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: t.textDim, marginLeft: 12, marginBottom: 4 }}>{m.fromName} · {ago(game.clock - m.at)}</Text>}
              <View style={{ maxWidth: '80%', backgroundColor: mine ? t.accent : t.surface, borderRadius: radius.block, paddingHorizontal: 16, paddingVertical: 12 }}>
                <Text style={{ fontFamily: fonts.body, fontSize: 18, lineHeight: 24, color: mine ? t.onAccent : t.text }}>{m.text}</Text>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Clavier ouvert : la saisie se cale juste au-dessus. Fermé : au-dessus de la barre d'onglets. */}
      {canTalk ? (
        <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: keyboard ? keyboard + 8 : TAB_SPACE, gap: 10, backgroundColor: t.bg }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
            {QUICK[channel === 'all' ? 'all' : game.me.role].map(q => (
              <Pressable key={q} onPress={() => send(q)} style={({ pressed }) => ({ borderWidth: 1.5, borderColor: t.line, borderRadius: radius.block, paddingHorizontal: 18, height: 44, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
                <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: t.text }}>{q}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TextInput
              value={text} onChangeText={setText} placeholder={channel === 'team' ? 'Écris à ton équipe' : 'Écris à tout le monde'} placeholderTextColor={t.textDim}
              maxLength={280} returnKeyType="send" onSubmitEditing={() => send(text)} submitBehavior="submit" selectionColor={t.accent}
              style={{ flex: 1, height: 54, borderRadius: radius.block, backgroundColor: t.surface, paddingHorizontal: 18, fontFamily: fonts.body, fontSize: 17, color: t.text }}
            />
            <Pressable accessibilityRole="button" accessibilityLabel="Envoyer" onPress={() => send(text)}
              style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: text.trim() ? t.accent : t.surface, alignItems: 'center', justifyContent: 'center' }}>
              <PaperPlaneRightIcon size={24} color={text.trim() ? t.onAccent : t.textDim} weight="fill" />
            </Pressable>
          </View>
        </View>
      ) : (
        <Text style={{ fontFamily: fonts.medium, fontSize: 15, color: t.textDim, textAlign: 'center', padding: 16, paddingBottom: TAB_SPACE }}>
          Dans cette partie, les chasseurs ne peuvent pas parler sur leur canal. La radio « Tous » reste ouverte.
        </Text>
      )}
    </View>
  );
}
