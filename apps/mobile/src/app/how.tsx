import { View } from 'react-native';
import { BackHeader, Screen, T } from '../ui';
import { useTheme, radius } from '../theme';

const RULES: [string, string][] = [
  ['Deux équipes', "Les chasseurs traquent les fugitifs dans une zone autour de l'hôte. Chacun voit ses coéquipiers en direct."],
  ["L'avance", "Au départ, les fugitifs ont quelques minutes pour se cacher. Les chasseurs attendent."],
  ['Les pings', "À intervalle régulier, chaque équipe voit l'autre sur la carte. Les chasseurs voient où étaient les fugitifs une minute plus tôt."],
  ['La zone', "Elle rétrécit au fil de la partie. Un fugitif qui en sort est révélé sans délai au ping suivant."],
  ['La capture', "Attrape un fugitif, puis scanne le QR code affiché sur son téléphone. Il passe spectateur."],
  ['La fin', "Les chasseurs gagnent s'ils attrapent tout le monde. Sinon, les fugitifs encore libres l'emportent à la fin du temps."],
];

export default function How() {
  const t = useTheme();
  return (
    <Screen scroll>
      <BackHeader />
      <T kind="title" style={{ marginTop: 8, marginBottom: 8 }}>Comment ça marche</T>
      {RULES.map(([title, body]) => (
        <View key={title} style={{ backgroundColor: t.surface, borderRadius: radius.block, padding: 18, gap: 6 }}>
          <T kind="h2">{title}</T>
          <T kind="dim">{body}</T>
        </View>
      ))}
    </Screen>
  );
}
