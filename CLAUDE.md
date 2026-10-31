# Scatter (ex « Keep Runni'n »)

Jeu de manhunt mobile, open source et gratuit. Les chasseurs traquent les fugitifs sur une vraie carte, dans une zone qui rétrécit. Les pings révèlent les positions telles qu'elles étaient 1 min plus tôt. La capture se fait en scannant un QR.

## Règles de travail (à respecter)

- **Répondre en français.** Le code, les commentaires et les messages de commit sont en français aussi.
- **Style « ponytail lite » :**
  - la solution la plus simple qui marche ;
  - pas d'abstraction inutile ;
  - commentaires courts, dans le style du code existant.
- **Ne jamais pousser de tag `v*` sans feu vert explicite.** Un tag déclenche le build IPA, qui coûte des minutes macOS (×10 sur un dépôt privé). Un push sur `main` est sans risque : il ne reconstruit que l'image serveur.
- Ne commiter ou pousser que si l'utilisateur le demande.
- **Ne pas suivre `CONTRIBUER.md` dans git** : il est gitignoré exprès.
- **Mises à jour du serveur :** l'utilisateur les fait lui-même, avec `docker compose pull && docker compose up -d`. Après un push sur `main`, lui dire que l'image est prête, puis vérifier `https://ton-serveur.example/version`.
- **Distribution :** l'app n'est distribuée qu'en dernière version (dépôt privé), donc pas de compatibilité avec les anciennes versions de l'app. Une vérification de version viendra avant le Play Store.
- **Objectifs serveur, en permanence :** rapidité et capacité à tenir beaucoup de parties en même temps. Mesurer avant d'optimiser (voir `bench.ts` et `load.ts`).

## Structure (npm workspaces)

| Dossier | Contenu |
|---|---|
| `packages/shared` | Schémas zod des messages client → serveur, types des vues, règles par défaut, géo (zone, distances). |
| `apps/server` | Node 22 (`--experimental-strip-types`), `node:http` + Socket.IO, comptes en `node:sqlite`. |
| `apps/mobile` | Expo SDK 58, React Native, expo-router (`src/app/`), MapLibre + tuiles OpenFreeMap. |

Fichiers serveur :
- `game.ts` : moteur pur, sans réseau, testé dans `game.test.ts`.
- `index.ts` : HTTP, sockets, boucle de jeu, sauvegarde et reprise.
- `bots.ts` : bots d'entraînement.
- `db.ts` : comptes.

## Commandes

```bash
npm ci                                   # à la racine
npm test                                 # tests du moteur (node:test), doit afficher « fail 0 »
cd apps/mobile && npx tsc --noEmit       # typecheck de l'app (pas de sortie = OK)
cd apps/server && node --experimental-strip-types --no-warnings src/bench.ts 1000   # coût CPU du moteur, 1 000 parties
cd apps/server && node --experimental-strip-types --no-warnings src/load.ts http://localhost:3000 100 40   # charge réseau réelle
npm run server                           # serveur local sur :3000 (données dans apps/server/data, gitignoré)
```

Avant de dire qu'une tâche est finie : `npm test` passe, et `npx tsc --noEmit` dans `apps/mobile` ne renvoie rien.

## Ce qui ne marche pas en session cloud

- **Build Android et tests sur téléphone.** Ils se font sur le PC Windows de l'utilisateur, avec son téléphone branché en adb. En cloud, s'arrêter au typecheck et le dire.
- **Tests de charge Docker.** Ils se font en local. `load.ts` peut tourner contre un serveur lancé avec `npm run server`.

## Fonctionnement clé (à connaître avant de toucher)

- **Parties en mémoire.** Elles sont sauvegardées dans `$DATA_DIR/games.json` à l'arrêt (SIGTERM) et toutes les 30 s, puis relues au démarrage. L'horloge des parties en cours avance du temps de coupure. Une sauvegarde de plus de 10 min est ignorée.
- **Boucle de jeu à 100 ms.** Chaque partie avance une fois par seconde, à son propre rythme : les parties sont réparties sur la seconde.
- **Vues par joueur.** `view()` calcule une vue pour chaque joueur, sans jamais lui envoyer plus que ce qu'il a le droit de voir. Les autres joueurs y apparaissent sous un identifiant court (`sid`), jamais sous leur identifiant de compte.
- **Ping envoyé une seule fois.** Le serveur ne renvoie le ping que quand il change ; s'il est absent d'un état, l'app garde le précédent.
- **Salon :**
  - tout le monde doit être « prêt » pour lancer ; l'hôte et les bots le sont d'office ;
  - il faut au moins 2 joueurs ;
  - changer les règles remet tout le monde « pas prêt » ;
  - l'hôte peut exclure un joueur, qui ne peut plus revenir dans ce salon.
- **Lancement :** un décompte 3-2-1 synchronisé par le serveur (`START_COUNTDOWN_MS`). La dernière seconde affiche la révélation du rôle.
- **Garde-fous :**
  - 20 messages par seconde maximum par connexion, et 16 Ko maximum par message ;
  - 5 000 parties maximum en mémoire ;
  - salons abandonnés supprimés au bout de 15 min ;
  - codes de salon de 6 caractères sur 31 symboles. Pas de limite par adresse IP : les opérateurs 4G partagent les IP entre abonnés.
- **`/health` et `/version`** donnent la version, le commit et la charge (parties, joueurs, attente p99, mémoire).
- **App :**
  - thème par palettes (`theme.ts`), avec une option « couleur selon le mode » ;
  - les stats restent sur le téléphone (`stats.ts`) ;
  - la couleur de la notification de partie se règle à part.

## Déploiement

- Un push sur `main` déclenche le workflow `server-image.yml`, qui publie `ghcr.io/m335671/keep-runni-n:latest`. L'utilisateur fait ensuite `docker compose pull && docker compose up -d` sur son serveur, derrière NPMPlus et CrowdSec.
- Un tag `vX.Y.Z` déclenche le workflow `mobile-app.yml`, qui construit l'APK et l'IPA et les joint à une Release GitHub. **Seulement sur demande explicite.**
- Serveur de production : `https://ton-serveur.example`.
- À chaque version, monter la version dans `apps/server/package.json` et dans `apps/mobile/app.json` (`version` et `android.versionCode`).

## État au 31/10/2026 (v0.8.0)

Fait :
- nouvelle DA « Topo » ;
- onglets Jouer / Activité / Profil ;
- rejoindre par QR ;
- entraînement avec bots ;
- mode zombie ;
- système « prêt » ;
- exclusion d'un joueur ;
- sauvegarde et reprise des parties ;
- états allégés (environ 0,9 Ko par seconde et par joueur).

Mesure : environ 5 000 joueurs tiennent sur un seul cœur.

Pistes pour plus tard, seulement si le besoin se fait sentir :
1. **N'envoyer que les changements** dans les états. Gain : environ 3×.
2. **Plusieurs processus**, un par cœur, avec les parties réparties par code de salon.
3. **Vérification de version de l'app**, avant le Play Store.
4. **Import des stats**, en complément de l'export.
