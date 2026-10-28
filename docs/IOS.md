# Passage à l'iPhone

L'app est écrite pour iOS et Android, mais iOS n'a jamais été compilé ni testé. Ce document liste ce qu'il faut pour le premier build et les problèmes attendus.

## Prérequis

| Élément | Minimum | Pourquoi |
|---|---|---|
| iPhone | iOS **16.4** | Minimum d'Expo SDK 58. Un iPhone 8 monte jusqu'à iOS 16.7 : ça passe, après mise à jour. |
| Mac | macOS capable de faire tourner **Xcode 26.4** (macOS 15 Sequoia ou plus récent) | Exigé par Expo SDK 58. Un MacBook Pro Intel trop ancien ne pourra pas l'installer : voir « Plan B ». |
| Compte | Apple ID gratuit (installation 7 jours) ou Apple Developer 99 €/an (TestFlight) | Voir « Distribution ». |
| Outils | Node 22, CocoaPods (`sudo gem install cocoapods` ou Homebrew), Xcode + ses outils en ligne de commande | |

## Premier build (Apple ID gratuit, iPhone branché en USB)

```sh
git clone https://github.com/m335671/Keep-Runni-n.git && cd Keep-Runni-n
npm install
cd apps/mobile
EXPO_PUBLIC_SERVER_URL=https://nuc.exemple.eu npx expo prebuild --platform ios --clean
open ios/KeepRunnin.xcworkspace
```
Dans Xcode :
1. **Signing & Capabilities** → Team : ton Apple ID (« Personal Team »).
2. Le bundle id `com.m335671.keeprunnin` doit être unique : s'il est refusé, ajoute un suffixe (ex. `.m335`) dans `app.json` → `ios.bundleIdentifier`, puis refais le prebuild.
3. Choisis l'iPhone comme cible, schéma **Release**, puis ▶︎.
4. Sur l'iPhone : **Réglages → Général → VPN et gestion de l'appareil** → faire confiance au développeur. Activer aussi le **Mode développeur** (Réglages → Confidentialité et sécurité).

## Problèmes attendus et ce qui est déjà prévu

| Sujet | Risque | État |
|---|---|---|
| Position en arrière-plan | iOS demande d'abord « Pendant l'utilisation », puis propose « Toujours » plus tard. | `isIosBackgroundLocationEnabled` (mode `location` en arrière-plan), textes des demandes, `pausesUpdatesAutomatically: false`, profil « Fitness ». L'écran Permissions propose de passer à « Toujours ». **À vérifier : position envoyée écran verrouillé.** |
| Indicateur bleu de localisation | iOS affiche une pastille bleue pendant le suivi. | Voulu (`showsBackgroundLocationIndicator`), c'est la règle d'Apple. |
| Textes des permissions | Sans texte, iOS fait planter l'app à la demande. | Position, caméra et micro ont leur texte (plugins `expo-location` et `expo-camera`). |
| Permission refusée | iOS ne redemande jamais une permission refusée. | L'écran Permissions bascule sur « Réglages » (`Linking.openSettings`). |
| Clavier de la radio | Comportement différent d'Android. | Écoute de `keyboardWillShow` sur iOS. À vérifier. |
| En-têtes et encoches | iOS 26 change le rendu des en-têtes. | L'app n'utilise pas les en-têtes natifs, et les zones sûres sont gérées. |
| Polices Archivo | Les noms PostScript diffèrent parfois sur iOS. | Chargées par `expo-font` avec des noms explicites. À vérifier : titres en largeur étendue ou condensée. |
| MapLibre | Le plugin ajoute une étape à `Podfile`. | Plugin déclaré dans `app.json`, rien à faire. |
| HTTP en clair | iOS bloque `http://` (ATS). | Le serveur est en `https://` via NPMPlus. Seul le dev local en `http://localhost` serait concerné. |
| Chiffrement | Questionnaire d'export à chaque envoi TestFlight. | `ITSAppUsesNonExemptEncryption: false`. |
| Apple ID gratuit | L'app expire au bout de 7 jours, 3 apps maximum. | Relancer le build depuis Xcode, ou utiliser SideStore. |

## Plan B si le Mac est trop ancien

Le compte Apple Developer (99 €/an) est alors nécessaire de toute façon. **EAS Build** compile dans le cloud (`npx eas-cli build -p ios`) et envoie sur TestFlight (`eas submit`), sans aucun Mac.

## Distribution sur iPhone

| Méthode | Coût | Ordinateur côté joueur | Limites |
|---|---|---|---|
| Xcode + Apple ID gratuit | 0 € | Oui, à chaque installation | 7 jours, 3 apps, appareil branché |
| SideStore (+ Apple ID gratuit) | 0 € | Une fois, pour l'installer | Renouvellement tous les 7 jours depuis le téléphone |
| **TestFlight** (Apple Developer) | 99 €/an | Non : un lien d'invitation | Chaque build valable 90 jours, jusqu'à 10 000 testeurs |
