# Scatter (ex « Keep Runni'n »)

Jeu de manhunt mobile en conditions réelles, entre amis. Open source, gratuit, sans achats. Dépôt privé `m335671/Keep-Runni-n`, branche `main`.

## Règles de travail (à respecter)

- **Français partout** : réponses, interface, commits, commentaires.
- **Style « ponytail lite »** :
  - la solution la plus simple qui marche ;
  - pas d'abstraction inutile ;
  - commentaires courts, dans le style du code existant.
- **Commits** : un commit par changement cohérent, message en français. Les pousser sur `main` seulement quand l'utilisateur le demande.
- **Versions** : quand l'utilisateur demande un push sur `main`, publier aussi une nouvelle version (tag `vX.Y.Z`, mineure par défaut). Un tag ne construit que l'APK. Un push sur `main` reconstruit l'image serveur.
- **Jamais d'IPA jusqu'à nouvel ordre** : ni case `ios` cochée, ni autre moyen (environ 100 min macOS décomptées, ×10 sur un dépôt privé, quota gratuit de 2 000 min/mois).
- **`CONTRIBUER.md`** : ne pas le suivre dans git (il est gitignoré). Il est en partie périmé ; la référence, c'est ce fichier-ci.
- **Mises à jour du serveur** : l'utilisateur les fait lui-même, avec `docker compose pull && docker compose up -d`. Après un push, lui dire que l'image est prête, puis vérifier `https://ton-serveur.example/version`.
- **Distribution** : l'app n'est distribuée qu'en dernière version, donc pas de compatibilité avec les anciennes versions de l'app. Une vérification de version viendra avant le Play Store.
- **Objectifs serveur, en permanence** : rapidité et capacité à tenir beaucoup de parties en même temps. Mesurer avant d'optimiser (`bench.ts`, `load.ts`).
- **Pas de limitation par adresse IP** : les opérateurs 4G partagent une IP entre beaucoup d'abonnés.
- **Données personnelles** : ne jamais utiliser l'adresse e-mail de l'utilisateur. Les comptes de jeu n'ont pas d'e-mail.
- **Avant de dire qu'une tâche est finie** : `npm test` passe, et `npx tsc --noEmit` dans `apps/mobile` ne renvoie rien. Si c'est visible à l'écran, il faut aussi un test sur le téléphone : à faire en local uniquement, sinon le signaler.
- **APK de test** : quand une tâche est finie (tests et typecheck OK), commiter, pousser sur la branche de travail perso de Claude, puis lancer `mobile-app.yml` en manuel sur cette branche avec `ios=false`. L'APK est l'artefact `scatter-android` du run. Donner le lien du run et la liste précise de ce qu'il faut tester.
- **APK à volonté, IPA sous contrôle** : les builds Android sont libres. L'IPA coûte des crédits macOS : seulement en cochant `ios` à la main (décoché par défaut), et pas avant le feu vert de l'utilisateur.
- **Ne jamais dégrader l'expérience de jeu**, même pour corriger un bug : vérifier chaque changement du point de vue du joueur, et prendre des marges.

## Le jeu

- **Rôles** : chasseurs et fugitifs, choisis dans le salon (Chasseur, Fugitif ou Au hasard). « Au hasard » complète l'équipe qui en a besoin, avec environ un chasseur pour trois joueurs. Si l'hôte fixe le nombre de chasseurs (`hunters` > 0), ou en Dispersion, les rôles sont tirés au sort et les choix ignorés (le salon affiche « Au sort »).
- **Salon** :
  - l'hôte crée une partie et reçoit un code de 6 caractères, lettres et chiffres mélangés, sans 0/O/1/I/L ;
  - les autres rejoignent avec le code ou en scannant le QR du salon, qui contient juste le code ;
  - chacun se dit « prêt » ; il faut au moins 2 joueurs, tous prêts, pour lancer ;
  - l'hôte règle les règles (ce qui remet tout le monde « pas prêt »), lance la partie et peut exclure un joueur, qui ne peut plus revenir ;
  - « Chacun choisit son rôle » (`freeRoles`, activé par défaut) : coupé, seul l'hôte choisit, en touchant la pastille de rôle d'un joueur.
- **Règles réglables par l'hôte** :
  - mode Classique, Zombie ou Dispersion (dans les règles : `mode` + `dispersion`, la Dispersion se joue en Classique) ;
  - nombre de chasseurs (0 = automatique ; en Zombie, chasseurs au départ) ;
  - « les fugitifs voient les chasseurs » : à chaque ping, un ping sur N, ou jamais (`huntersShownEvery`) ;
  - durée (5 à 180 min) ;
  - intervalle des pings ;
  - avance des fugitifs ;
  - « les chasseurs peuvent parler » ;
  - délai de la vue spectateur (0 à 2 min) ;
  - zone : activée ou non, centre, taille de départ, taille finale, rétrécissement.
- **Déroulement** :
  1. salon ;
  2. décompte 3-2-1 synchronisé (la dernière seconde affiche la révélation du rôle) ;
  3. avance (les fugitifs se cachent) ; en **Dispersion**, tout le monde part sans rôle (même équipe côté serveur, `GameView.hidden`), et les rôles sont tirés à la fin de l'avance ;
  4. chasse ;
  5. fin.
- **Visibilité** :
  - chacun voit son équipe en direct (GPS toutes les 2 s) ;
  - l'équipe adverse n'apparaît qu'au **ping** : les chasseurs voient où étaient les fugitifs **1 min avant** (`PING_DELAY_MS`), et les fugitifs voient les chasseurs en direct (ou un ping sur N, avec la dernière position vue entre-temps) ;
  - un fugitif **hors zone** est visible en direct par les chasseurs, et il est éliminé s'il reste dehors plus d'1 min.
- **Zone** : elle rétrécit par paliers dès la fin de l'avance et atteint sa taille finale 5 min avant la fin.
- **Capture** :
  - le fugitif affiche un QR (`KR1:<code>:<sid>:<secret>`, identifiant court, jamais celui du compte), le chasseur le scanne, et le serveur vérifie le secret ;
  - en Classique, le fugitif attrapé devient spectateur ;
  - en Zombie, il devient chasseur.
- **Fin** : la partie s'arrête quand tous les fugitifs sont pris (victoire des chasseurs) ou quand le temps est écoulé (victoire des fugitifs libres). Un joueur qui part en cours de partie est annoncé à la radio.
- **Radio** :
  - canaux « Équipe » et « Tous » ;
  - messages rapides et annonces système ;
  - pas de vocal, pas de signalement ni de blocage (retirés volontairement).
- **Entraînement** :
  - partie solo contre des bots côté serveur, avec nombre de bots, bots « malins » et bots bavards ;
  - contrôles de démo : ping, avancer d'une minute, vitesse ×1/×5/×20, fin, capture simulée, bot hors zone ;
  - la partie est supprimée si le joueur la quitte.
- **Stats** :
  - **uniquement sur le téléphone** : totaux, liste des parties, carte partageable en image, export JSON ;
  - l'app prévient qu'il faut les exporter avant de désinstaller.

## Structure (npm workspaces, TypeScript partout)

| Dossier | Contenu |
|---|---|
| `packages/shared` | Schémas zod des messages client → serveur (frontière de confiance), types des vues, règles par défaut, géo (zone, distances), constantes. |
| `apps/server` | Node 22 (`--experimental-strip-types`, pas de build), `node:http` + Socket.IO, comptes en `node:sqlite`. |
| `apps/mobile` | Expo SDK 58 (React Native 0.88), expo-router (écrans dans `src/app/`), MapLibre RN v11 + tuiles OpenFreeMap (gratuites, sans clé). |

Carte du code : `graphify-out/GRAPH_REPORT.md` (communautés, nœuds centraux) et `graph.html` (graphe interactif). Pour une question sur l'architecture, commencer par là. Les mettre à jour avec `/graphify . --update` après de gros changements.

Fichiers serveur (`apps/server/src/`) :
- `game.ts` : moteur pur, sans réseau, testé dans `game.test.ts`.
- `index.ts` : HTTP (`/health`, `/version`, `/username/:u`, `/auth/register`, `/me`), Socket.IO, boucle de jeu, sauvegarde et reprise, logs.
- `bots.ts` : bots d'entraînement.
- `db.ts` : comptes uniquement. On ne stocke que le hash du jeton, pas d'e-mail.
- `server.test.ts` : lance le vrai serveur sur un port libre et simule des téléphones (arrivée refusée, recalage de zone, radio, plafond d'inscriptions).
- `bench.ts` et `load.ts` : outils de mesure.

Fichiers app (`apps/mobile/src/`) :
- `app/` : écrans (`index` à onglets Jouer/Activité/Profil, `lobby`, `game`, `scan`, `onboarding`, `tutorial`, `permissions`).
- `tabs/` : contenu des onglets.
- `api.ts` : HTTP et Socket.IO.
- `store.ts` : état global et réglages, persistés en SecureStore.
- `location.ts` : GPS en arrière-plan.
- `theme.ts` : palettes et polices.
- `ui.tsx` : composants.
- `stats.ts`, `share-card.tsx`, `tutorial.tsx`, `notify.ts`, `map-style.ts` (carte recolorée selon la palette).

## Protocole Socket.IO

- **Client → serveur**, avec accusé `{ ok } | { error }` :
  - `create`, `join`, `leave`, `rules`, `role` (`id` : joueur visé par l'hôte quand les rôles ne sont pas libres), `ready`, `kick`, `start` ;
  - `capture`, `chat` (`channel: team | all`) ;
  - `training` (`ping | advance | speed | end | catch | caught | stray`) ;
  - `pos` : envoyé en `volatile` par l'app, sans accusé.
- **Serveur → client** :
  - `lobby` ;
  - `state` : un `GameView` propre au joueur, chaque seconde ;
  - `chat`, `chat:history` ;
  - `nogame` : plus de partie à la reconnexion ;
  - `kicked`.
- L'app ignore un `state` dont le code ne correspond pas au salon courant.

## Fonctionnement clé (à connaître avant de toucher)

- **Parties en mémoire** :
  - sauvegardées dans `$DATA_DIR/games.json` à l'arrêt (SIGTERM, d'un bloc) et toutes les 30 s (partie par partie, en rendant la main : pas de gel du serveur), puis relues au démarrage ;
  - l'horloge des parties en cours avance du temps de coupure ;
  - une sauvegarde de plus de 10 min est ignorée.
- **Boucle de jeu à 100 ms** : chaque partie avance une fois par seconde, à son rythme, donc les parties sont réparties sur la seconde. En entraînement, l'horloge de jeu (`clock`) peut accélérer.
- **Vues par joueur** :
  - `view()` n'envoie jamais plus que ce que le joueur a le droit de voir ;
  - les autres joueurs y apparaissent sous un identifiant court (`sid`), jamais sous leur identifiant de compte (radio comprise) ;
  - le ping n'est renvoyé que quand il change ; s'il est absent d'un état, l'app garde le précédent.
- **Garde-fous** :
  - 20 messages par seconde maximum par connexion, et 16 Ko maximum par message ;
  - 5 000 parties maximum en mémoire ;
  - salons et parties abandonnés supprimés au bout de 15 min ;
  - inscriptions : plafond global (réserve de 100, puis 30/min), réponse 429 « réessaie dans une minute » ;
  - radio : un message toutes les 0,5 s au plus par connexion ;
  - positions acceptées seulement pendant la manche, historique plafonné à 400 échantillons ;
  - une partie finie n'est plus diffusée après 15 s (à la reconnexion, état complet quand même) ;
  - un compte n'est que dans une partie à la fois : l'onglet Jouer bloque créer / rejoindre / s'entraîner tant qu'on est dans une vraie partie (seulement « y retourner » ou « quitter », avec confirmation), et le serveur valide une arrivée avant de faire quitter l'ancienne partie ;
  - pseudos : emojis acceptés, caractères invisibles et de contrôle refusés.
- **`/health`** donne la version, le commit et la charge : parties, joueurs, attente p99 (doit rester sous ~50 ms), mémoire. Le même bilan est logué toutes les 10 min.
- **Zone** : placée à la création sur la dernière position connue de l'hôte (instantané), recalée sur une position fraîche quand l'hôte lance (`start { center }`, 5 s max, ignorée si imprécise).
- **Adresse du serveur** : celle compilée dans l'app (`EXPO_PUBLIC_SERVER_URL`), pas de réglage dans le Profil.
- **Comptes** : un jeton aléatoire est stocké sur le téléphone. Si le serveur répond `unauthorized`, l'app repasse à l'inscription.

## Interface (conventions)

- **DA « Topo »** : fond sombre `#0F1712`, accent lime `#D4FF3A` (palette Forêt). Il y a un mode clair, et 6 palettes au choix dans `theme.ts` (Forêt, Braise, Océan, Ambre, Lavande, Ardoise), plus une option « En partie : Fixe / Mode / Rôle » (palette selon Classique-Zombie, ou selon chasseur-fugitif une fois le rôle tiré). Toujours passer par `useTheme()`, jamais de couleur en dur.
- **Polices** : Bricolage Grotesque (titres et texte) et JetBrains Mono (chiffres, codes, étiquettes).
- **Formes** : arrondis 18 (blocs), 12 (éléments internes), boutons en pilule.
- **Haptique** : `haptic` dans `ui.tsx` (select, tap, success, error). Les composants partagés (Button, Row, Segmented, Choices, Toggle) vibrent déjà.
- **Retour Android** : bloqué sur l'écran de partie (on sort avec « Quitter la partie »).
- **Lampe** : module natif local `modules/torch` (Kotlin + Swift), lié automatiquement. Ses dossiers `android/` et `ios/` sont du code source (exception dans `.gitignore`).
- **Icône de l'app** (Android) : appliquée quand l'app passe en arrière-plan, jamais en partie : le changement ferme l'app sur Samsung.
- **Icônes** : Phosphor, toujours importées depuis `src/icons.ts` (une ligne par icône, jamais depuis `phosphor-react-native` directement : tout le paquet serait embarqué, +6 Mo).
- **Boîtes de dialogue** : jamais `Alert.alert`, toujours `showDialog`.
- **Textes de l'interface** :
  - pas de tiret cadratin ;
  - textes courts, compréhensibles même sans les lire (tutoriel surtout) ;
  - ne pas supposer le genre d'un joueur.
- **Salon** : il ne doit pas défiler tant que « Tous les réglages » est replié.
- **Réglages chiffrés** : `Choices` (valeurs prêtes à toucher), pas de − / +.
- **Notifications** : effacées dès que l'app revient au premier plan (sauf celle du suivi GPS, imposée par Android).
- **Icône de l'app** : une par palette (`expo-alternate-app-icons`, images dans `assets/icons/`, Forêt = icône d'origine). Réglage dans le Profil, bloqué pendant une manche. Images générées depuis la géométrie de `assets/brand/mark.svg` (fond, traits et point = `bg`, `text`, `accent` sombres de la palette).
- **Expo change souvent** : vérifier l'API dans la doc versionnée (`docs.expo.dev/versions/v58.0.0/`) ou dans les `.d.ts` de `node_modules`. Installer les paquets avec `npx expo install`.

## Commandes

```bash
npm ci                                   # à la racine
npm test                                 # moteur (game.test.ts) + bout en bout avec vrai serveur et sockets (server.test.ts), ~6 s, « fail 0 »
cd apps/mobile && npx tsc --noEmit       # typecheck de l'app (pas de sortie = OK)
npm run server                           # serveur local sur :3000 (données dans apps/server/data, gitignoré)
cd apps/server && node --experimental-strip-types --no-warnings src/bench.ts 1000   # coût CPU du moteur, 1 000 parties
cd apps/server && node --experimental-strip-types --no-warnings src/load.ts http://localhost:3000 100 40   # charge réseau réelle
```

## Ce qui ne se fait qu'en local (PC Windows de l'utilisateur)

- **Build Android** : depuis le worktree `C:\dev\keeprunnin`, parce que l'apostrophe de `KeepRunni'n` casse CMake. Il faut aussi CMake 3.31.6 dans `local.properties` après chaque `prebuild --clean`, et `./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a`.
- **Tests sur téléphone** : son Android est branché en adb. Ne pas lancer l'émulateur sans demander.
- **Tests de charge Docker** : clients lancés dans un conteneur, sur le même réseau Docker.

**En session cloud** : s'arrêter au typecheck et aux tests, et dire clairement ce qui reste à tester sur le téléphone.

## Production et déploiement

- **Serveur** :
  - un push sur `main` déclenche `server-image.yml`, qui lance les tests puis publie `ghcr.io/m335671/keep-runni-n:latest` ;
  - serveur maison Debian, derrière NPMPlus (WebSockets activés) et CrowdSec, domaine `https://ton-serveur.example` ;
  - changer de domaine oblige à recompiler l'app (`EXPO_PUBLIC_SERVER_URL`) ;
  - `docker-compose.yml` : port 3022, volume `/data` (comptes et sauvegarde des parties).
- **Releases** :
  - un tag `vX.Y.Z` lance `mobile-app.yml`, qui construit l'APK (Linux) et le publie (`scatter-vX.Y.Z.apk`) dans une Release ; l'IPA non signée (macOS) ne se construit qu'en manuel ;
  - en manuel (« Run workflow »), APK seul par défaut, l'IPA est à cocher ;
  - pour un changement Android seul : APK compilé en local, puis `gh release upload <tag> <apk> --clobber`.
- **Taille de l'APK** : bibliothèques natives compressées (`expo-build-properties`, `useLegacyPackaging`) : environ −26 Mo, au prix d'environ 40 Mo de plus une fois installée sur le téléphone.
- **Versions** : à chaque version, monter `apps/server/package.json` et `apps/mobile/app.json` (`version` et `android.versionCode`).
- **iPhone** :
  - IPA compilée par GitHub Actions, parce que le Mac Intel de l'utilisateur ne peut pas compiler le SDK 58 ;
  - installation avec Sideloadly et un Apple ID gratuit (iOS 16.4 minimum) ;
  - pas de TestFlight : l'utilisateur refuse de payer Apple ;
  - voir `docs/IOS.md`.

## État au 31/10/2026 (v0.9.0)

**Fait :**
- DA « Topo » et palettes ;
- onglets ;
- rejoindre par QR ;
- entraînement avec bots ;
- mode zombie ;
- système « prêt » ;
- exclusion d'un joueur ;
- sauvegarde et reprise des parties ;
- états allégés (environ 0,9 Ko par seconde et par joueur) ;
- couleur de la notification de partie ;
- v0.9.0 : audit (partie protégée, zone recalée au lancement, sauvegarde sans gel, garde-fous, tests de bout en bout),
  APK allégé (58 → ~22 Mo), copier le code du salon, rôles choisis par l'hôte, réglages en un appui,
  notifications effacées à l'ouverture, couleur de l'icône de l'app.

**Capacité mesurée :** environ 5 000 joueurs sur un seul cœur.

**À vérifier en conditions réelles :**
- partie à plusieurs en extérieur : écran éteint, batterie, réseau mobile instable ;
- carte de partie avec un vrai trajet ;
- ligne « Batterie sans restriction » sur Android.

**Pistes, seulement si le besoin se fait sentir :**
1. **N'envoyer que les changements** dans les états. Gain : environ 3×.
2. **Plusieurs processus**, un par cœur, avec les parties réparties par code de salon.
3. **Vérification de version de l'app**, avant le Play Store.
4. **Import des stats**, en complément de l'export.
5. **Image GHCR publique**, si le dépôt devient public : le serveur n'aurait plus besoin de `docker login`.
