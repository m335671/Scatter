import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { PaperPlaneRightIcon } from 'phosphor-react-native';
import type { GameView } from '@kr/shared';
import { emit } from './api';
import { setState, useStore } from './store';
import { fonts, radius, useTheme } from './theme';
import { fmtClock, showDialog } from './ui';

const QUICK = {
  hunter: ["J'en vois un !", 'Surveillez le canal', 'Vous êtes où ?'],
  fugitive: ['Je suis repéré !', 'Je bouge', 'Vous êtes où ?'],
};

/** Hauteur réservée à la barre d'onglets flottante de l'écran de partie. */
const TAB_SPACE = 104;

const ago = (ms: number) => (ms < 60_000 ? "à l'instant" : `il y a ${Math.floor(ms / 60_000)} min`);

export function Radio({ game }: { game: GameView }) {
  const t = useTheme();
  const chat = useStore(s => s.chat);
  const canTalk = useStore(s => s.lobby?.rules.huntersCanTalk ?? true) || game.me.role === 'fugitive';
  const [text, setText] = useState('');
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  useEffect(() => { setState({ unread: 0 }); }, [chat.length]);

  const teamOnAir = game.team.filter(p => !p.caught).length;

  async function send(msg: string) {
    if (!msg.trim()) return;
    setText('');
    try { await emit('chat', { text: msg }); } catch (e) { showDialog({ title: 'Message non envoyé', message: (e as Error).message }); }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: t.line, flexDirection: 'row', alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: fonts.displayBlack, fontSize: 40, color: t.text }} accessibilityRole="header">Radio</Text>
          <Text style={{ fontFamily: fonts.body, fontSize: 16, color: t.textDim }}>
            Canal des {game.me.role === 'hunter' ? 'chasseurs' : 'fugitifs'} · {teamOnAir} à l'antenne
          </Text>
        </View>
        <View style={{ backgroundColor: t.surface, borderRadius: radius.block, paddingHorizontal: 16, paddingVertical: 10 }}>
          <Text style={{ fontFamily: fonts.displayBlack, fontSize: 20, color: t.text, fontVariant: ['tabular-nums'] }}>{fmtClock(game.huntEnd - game.clock)}</Text>
        </View>
      </View>

      <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1, justifyContent: 'flex-end' }}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
        {chat.map(m => {
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

      {canTalk ? (
        <View style={{ paddingHorizontal: 12, paddingBottom: TAB_SPACE, gap: 10 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
            {QUICK[game.me.role].map(q => (
              <Pressable key={q} onPress={() => send(q)} style={({ pressed }) => ({ borderWidth: 1.5, borderColor: t.line, borderRadius: radius.block, paddingHorizontal: 18, height: 44, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
                <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: t.text }}>{q}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TextInput
              value={text} onChangeText={setText} placeholder="Écris à ton équipe" placeholderTextColor={t.textDim}
              maxLength={280} returnKeyType="send" onSubmitEditing={() => send(text)} selectionColor={t.accent}
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
          Dans cette partie, les chasseurs ne peuvent pas parler.
        </Text>
      )}
    </KeyboardAvoidingView>
  );
}
