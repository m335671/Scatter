# Graph Report - KeepRunni'n  (2026-10-31)

## Corpus Check
- 55 files · ~48,139 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 578 nodes · 1455 edges · 25 communities (22 shown, 3 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 17 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Écran de partie (carte, HUD, flash)
- Moteur de jeu et bots
- Comptes et sauvegarde
- Outillage app mobile
- Style de carte recoloré
- Connexion et inscription
- Salon et actions de partie
- Stats et carte partagée
- Modules Expo
- Configuration app (app.json)
- Règles et doc du projet
- Test de charge réseau
- Paquet serveur
- Paquet partagé
- Monorepo racine
- Config ESLint
- Config TypeScript
- Logo Scatter (SVG)
- Consignes Expo
- Icône adaptative Android
- Icône de l app
- Icône de démarrage
- Icône monochrome
- Favicon
- Génération native

## God Nodes (most connected - your core abstractions)
1. `useTheme()` - 68 edges
2. `useStore()` - 28 edges
3. `showDialog()` - 26 edges
4. `setState()` - 24 edges
5. `emit()` - 20 edges
6. `react` - 19 edges
7. `react-native` - 18 edges
8. `fmtClock()` - 17 edges
9. `view()` - 17 edges
10. `connect()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `GameRecord` --references--> `Role`  [EXTRACTED]
  apps/mobile/src/stats.ts → packages/shared/src/index.ts
- `trackPosition()` --calls--> `distanceM()`  [EXTRACTED]
  apps/mobile/src/stats.ts → packages/shared/src/index.ts
- `games` --calls--> `defaultRules()`  [EXTRACTED]
  apps/server/src/bench.ts → packages/shared/src/index.ts
- `setup()` --calls--> `defaultRules()`  [EXTRACTED]
  apps/server/src/game.test.ts → packages/shared/src/index.ts
- `Player` --references--> `LatLng`  [EXTRACTED]
  apps/server/src/game.ts → packages/shared/src/index.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Build and deployment pipeline** — github_workflows_server_image, github_workflows_mobile_app, docker_compose, ghcr_image [INFERRED 0.85]

## Communities (25 total, 3 thin omitted)

### Community 0 - "Écran de partie (carte, HUD, flash)"
Cohesion: 0.08
Nodes (72): updateMe(), countLabel(), GameScreen(), GpsWarning(), Legend(), PhaseBanner(), PingFlash(), QrSheet() (+64 more)

### Community 1 - "Moteur de jeu et bots"
Cohesion: 0.07
Nodes (76): center, games, N, t0, addBots(), botsCatch(), botTalks(), CHAT (+68 more)

### Community 2 - "Comptes et sauvegarde"
Cohesion: 0.06
Nodes (45): db, q, User, loadGame(), lobbyView(), SavedGame, saveGame(), Ack (+37 more)

### Community 3 - "Outillage app mobile"
Cohesion: 0.05
Nodes (44): devDependencies, eslint, eslint-config-expo, @types/react, typescript, main, name, private (+36 more)

### Community 4 - "Style de carte recoloré"
Cohesion: 0.07
Nodes (31): Layer, listeners, load(), mapColors(), mix(), Mode, pending, preloadMapStyles() (+23 more)

### Community 5 - "Connexion et inscription"
Cohesion: 0.12
Nodes (35): base(), connect(), ensureConnected(), http(), register(), sendPosition(), usernameAvailable(), RootLayout() (+27 more)

### Community 6 - "Salon et actions de partie"
Cohesion: 0.13
Nodes (34): emit(), leaveGame(), EndBanner(), MapView(), MoreSheet(), quit(), toFeatures(), LobbyScreen() (+26 more)

### Community 7 - "Stats et carte partagée"
Cohesion: 0.14
Nodes (28): Hud(), Mark(), project(), ShareCard, clearStats(), emit(), exportStats(), file() (+20 more)

### Community 8 - "Modules Expo"
Cohesion: 0.06
Nodes (31): dependencies, expo, expo-battery, expo-camera, expo-constants, expo-dev-client, expo-file-system, expo-font (+23 more)

### Community 9 - "Configuration app (app.json)"
Cohesion: 0.07
Nodes (28): backgroundColor, foregroundImage, monochromeImage, adaptiveIcon, blockedPermissions, package, permissions, predictiveBackGestureEnabled (+20 more)

### Community 10 - "Règles et doc du projet"
Cohesion: 0.12
Nodes (19): OFL.txt (font license), CLAUDE.md (project rules and state), Local Android build (worktree, CMake 3.31.6), Game rules (hunters, fugitives, zone, ping, capture), In-memory games with games.json persistence, iOS distribution via Sideloadly (no TestFlight), Per-player view with short sid, Socket.IO protocol (client/server events) (+11 more)

### Community 11 - "Test de charge réseau"
Cohesion: 0.12
Nodes (13): center, jitter(), N, rtt, run, SECS, setup, sockets (+5 more)

### Community 12 - "Paquet serveur"
Cohesion: 0.12
Nodes (16): @kr/shared, dependencies, @kr/shared, socket.io, devDependencies, @types/node, name, private (+8 more)

### Community 13 - "Paquet partagé"
Cohesion: 0.20
Nodes (9): dependencies, zod, exports, main, name, private, type, version (+1 more)

### Community 14 - "Monorepo racine"
Cohesion: 0.29
Nodes (6): name, private, scripts, server, test, workspaces

### Community 15 - "Config ESLint"
Cohesion: 0.40
Nodes (4): { defineConfig }, expoConfig, ref_eslint_config, ref_eslint_config_expo_flat

### Community 16 - "Config TypeScript"
Cohesion: 0.40
Nodes (4): compilerOptions, strict, extends, expo/tsconfig.base

### Community 17 - "Logo Scatter (SVG)"
Cohesion: 0.67
Nodes (4): Scatter brand mark (mark.svg), Solid circle outline (stroke #E8EEE4, r=8, offset toward top-right), Dotted circle: shrinking zone (stroke #E8EEE4, dashed, r=15), Lime dot: player escaping the zone (fill #D4FF3A, r=3.2)

### Community 18 - "Consignes Expo"
Cohesion: 0.67
Nodes (3): EAS Build, Expo Router (src/app), Consignes agents Expo mobile

### Community 19 - "Icône adaptative Android"
Cohesion: 1.00
Nodes (3): Android adaptive icon foreground (Scatter): dashed pale-green ring around a solid ring with a lime-green dot, on transparent background, Radar/ping motif: concentric dashed outer ring, solid inner ring, lime dot (prey/hunter position), Scatter brand identity (mobile manhunt game): pale slate-green and lime accent palette

### Community 20 - "Icône de l app"
Cohesion: 0.67
Nodes (3): Scatter app icon (dark background, dashed ring, circle with lime dot), Icon palette: near-black green background, off-white strokes, neon lime accent, Radar/ping motif: dashed outer ring around solid ring with lime dot (hunter and prey tracking)

### Community 21 - "Icône de démarrage"
Cohesion: 1.00
Nodes (3): Scatter splash icon (dashed circle, ring, lime dot), Scatter mobile manhunt game branding, Radar/ping motif: dashed outer circle, ring, lime target dot

## Knowledge Gaps
- **184 isolated node(s):** `QUICK`, `zod`, `exports`, `main`, `name` (+179 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 217 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `Modules Expo` to `Outillage app mobile`?**
  _High betweenness centrality (0.086) - this node is a cross-community bridge._
- **Why does `useTheme()` connect `Écran de partie (carte, HUD, flash)` to `Style de carte recoloré`, `Connexion et inscription`, `Salon et actions de partie`, `Stats et carte partagée`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Why does `react` connect `Écran de partie (carte, HUD, flash)` to `Outillage app mobile`, `Style de carte recoloré`, `Connexion et inscription`, `Salon et actions de partie`, `Stats et carte partagée`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **What connects `QUICK`, `zod`, `exports` to the rest of the system?**
  _184 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Écran de partie (carte, HUD, flash)` be split into smaller, more focused modules?**
  _Cohesion score 0.07904789891272407 - nodes in this community are weakly interconnected._
- **Should `Moteur de jeu et bots` be split into smaller, more focused modules?**
  _Cohesion score 0.07136404697380307 - nodes in this community are weakly interconnected._
- **Should `Comptes et sauvegarde` be split into smaller, more focused modules?**
  _Cohesion score 0.05870020964360587 - nodes in this community are weakly interconnected._