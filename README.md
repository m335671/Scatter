# Scatter

Jeu de chasse à l'homme sur mobile, à jouer dehors entre amis. Des chasseurs traquent des fugitifs sur une vraie carte, dans une zone qui rétrécit. On capture en scannant le QR code du fugitif.

Gratuit, open source, sans pub ni achats. Pas d'e-mail pour jouer : un pseudo suffit.

## Le jeu

- **Salon** : l'hôte crée une partie et partage un code de 6 caractères (ou son QR). Chacun se met « prêt », l'hôte lance.
- **Rôles** : chasseur, fugitif ou au hasard. L'hôte peut aussi fixer le nombre de chasseurs.
- **Modes** :
  - **Classique** : un fugitif attrapé devient spectateur ;
  - **Zombie** : un fugitif attrapé devient chasseur ;
  - **Dispersion**, avec l'un ou l'autre : tout le monde part sans rôle, et les rôles sont tirés au sort à la fin de la course.
- **Pings** : chacun voit son équipe en direct. L'équipe adverse n'apparaît qu'aux pings. Les chasseurs voient où étaient les fugitifs une minute plus tôt.
- **Zone** : elle rétrécit par paliers. Un fugitif qui en sort est visible en direct, puis éliminé s'il ne revient pas.
- **Radio** : messages rapides par équipe ou à tous, et annonces de la partie.
- **Entraînement** : une partie solo contre des bots, avec accélération du temps.
- **Stats** : gardées uniquement sur le téléphone, avec export.

## Installer

- **Android** : télécharger `scatter-vX.Y.Z.apk` dans les [Releases](../../releases) et l'installer (autoriser les sources inconnues).
- **iPhone** : pas encore distribué. Voir [docs/IOS.md](docs/IOS.md) pour compiler et installer soi-même.

Au premier lancement, l'app demande l'adresse du serveur et vérifie qu'elle répond. Pour jouer entre amis, il suffit qu'un membre du groupe héberge le serveur (voir plus bas). L'adresse se change ensuite dans Profil → Serveur.

## Structure

| Dossier | Contenu |
|---|---|
| `packages/shared` | Règles, schémas zod des messages, types et géo partagés. |
| `apps/server` | Node 22 + Socket.IO. Les parties vivent en mémoire, les comptes sont dans SQLite (`node:sqlite`). |
| `apps/mobile` | Expo (React Native), carte MapLibre avec les tuiles OpenFreeMap. |

## Serveur

```sh
npm ci
npm run server   # port 3000
npm test         # moteur de jeu + bout en bout avec un vrai serveur
```

### Héberger avec Docker

Chaque push sur `main` publie l'image `ghcr.io/m335671/scatter:latest`, après les tests. Sur le serveur, seul `docker-compose.yml` est nécessaire :

```sh
docker compose pull && docker compose up -d
curl http://localhost:3022/health
```

- **Mise à jour** : relancer la même commande.
- **Derrière un reverse proxy** (Nginx Proxy Manager, NPMPlus…) : proxy vers `http://<ip>:3022`, avec les **WebSockets activés**.
- **Variables** :
  - `KR_PORT` : port publié, 3022 par défaut ;
  - `TZ` : fuseau horaire.
- **Données** : les comptes et la sauvegarde des parties sont dans le volume `/data`.
- **Image locale** : `docker build -t scatter -f apps/server/Dockerfile .`

## Compiler l'app Android

```sh
cd apps/mobile
npx expo prebuild --platform android --clean
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
# → android/app/build/outputs/apk/release/app-release.apk
```

Sous Windows :
- **Apostrophe dans le chemin** : compiler depuis un chemin sans apostrophe, car le `'` casse CMake (`git worktree add C:/dev/scatter`).
- **Chemins de plus de 260 caractères** : installer CMake 3.31.6 avec le SDK Manager, puis ajouter `cmake.dir=<sdk>/cmake/3.31.6` dans `android/local.properties`. C'est à refaire après chaque `prebuild --clean`.

L'APK est signé avec la clé de debug : ça suffit pour l'installer à la main. Facultatif : `EXPO_PUBLIC_SERVER_URL=https://…` au moment du `prebuild` pré-remplit l'écran du serveur.

## Publier une version

```sh
git tag v1.2.0 && git push origin v1.2.0
```

Le workflow « App mobile » compile l'APK et le publie dans une Release (`scatter-v1.2.0.apk`). L'IPA (non signée, compilée sur macOS) ne se construit qu'en lançant le workflow à la main, en cochant `ios`.

## Licence

[GNU AGPL v3](LICENSE). Tu peux utiliser, modifier et redistribuer le code, y compris pour faire tourner ton propre serveur. En échange, toute version modifiée doit rester sous la même licence. Ça vaut aussi pour un serveur mis à disposition sur le réseau : son code doit être publié.
