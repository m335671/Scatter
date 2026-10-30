# Keep Runni'n

Jeu de manhunt mobile open source : des chasseurs, des fugitifs, une vraie carte, une zone qui rétrécit et des pings de position (décalés d'1 min pour les chasseurs). Capture par QR code.

## Structure
- `apps/server` — Node 22 + Socket.IO + SQLite (`node:sqlite`). Les parties vivent en mémoire.
- `apps/mobile` — Expo (React Native).
- `packages/shared` — règles, schémas zod, types partagés.

## Serveur
```sh
npm install
npm run server   # dev, port 3000
npm test         # tests du moteur de jeu
```

### Déploiement (Docker)
Chaque push sur `main` qui touche le serveur publie l'image `ghcr.io/m335671/keep-runni-n` (amd64) via GitHub Actions, après avoir lancé les tests dans l'image. Un tag `v1.2.3` publie aussi `:1.2.3`.

Sur le serveur, seul `docker-compose.yml` est nécessaire :
```sh
docker login ghcr.io -u m335671   # le dépôt est privé : jeton GitHub avec le droit read:packages
docker compose pull && docker compose up -d
curl http://localhost:3022/health
```
Mise à jour : `docker compose pull && docker compose up -d`.

Derrière NPMPlus (ou Nginx Proxy Manager) : proxy host vers `http://<ip>:3022`, **activer « Websockets Support »**.

Variables : `KR_PORT` (port publié, 3022), `TZ`. Les comptes sont dans le volume `keeprunnin-data`.

Construire l'image en local : `docker build -t keeprunnin -f apps/server/Dockerfile .`

## App Android (APK)
```sh
cd apps/mobile
EXPO_PUBLIC_SERVER_URL=https://ton-serveur.example npx expo prebuild --platform android --clean
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
# → android/app/build/outputs/apk/release/app-release.apk
```
Sous Windows :
- compiler depuis un chemin **sans apostrophe** (le `'` de `KeepRunni'n` casse CMake) : `git worktree add C:/dev/keeprunnin`.
- chemins de plus de 260 caractères : installer CMake 3.31.6 via le SDK Manager et ajouter `cmake.dir=<sdk>/cmake/3.31.6` dans `android/local.properties` (à refaire après chaque `prebuild --clean`).

L'APK release est signé avec la clé de debug : suffisant pour l'installer à la main, une vraie clé sera nécessaire pour le Play Store.

## Publier une version (APK + IPA)
```sh
git tag v0.2.0 && git push origin v0.2.0
```
Le workflow « App mobile » compile l'APK (Linux) et l'IPA non signée (macOS), met la version du tag dans l'app et publie les deux fichiers dans une **Release GitHub** (`keep-runnin-0.2.0.apk` / `.ipa`). Un build manuel (onglet Actions → Run workflow) ne crée pas de release : les fichiers sont dans « Artifacts ».

- Android : installer l'APK directement (sources inconnues autorisées).
- iPhone : installer l'IPA avec Sideloadly (Apple ID gratuit, 7 jours, iOS 16.4+, mode développeur).

Coût : environ 100 minutes macOS décomptées par release (quota gratuit : 2 000 min/mois sur un dépôt privé, illimité en public).
