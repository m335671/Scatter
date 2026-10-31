# Graph Report - Keep-Runni-n  (2026-10-31)

## Corpus Check
- Corpus is ~49,897 words - fits in a single context window. You may not need a graph.

## Summary
- 622 nodes · 1535 edges · 28 communities (24 shown, 4 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 26 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27

## God Nodes (most connected - your core abstractions)
1. `useTheme()` - 68 edges
2. `useStore()` - 28 edges
3. `showDialog()` - 27 edges
4. `setState()` - 24 edges
5. `emit()` - 22 edges
6. `react` - 19 edges
7. `react-native` - 18 edges
8. `fmtClock()` - 17 edges
9. `view()` - 17 edges
10. `LobbyScreen()` - 15 edges

## Surprising Connections (you probably didn't know these)
- `README.md (Keep Runni'n)` --semantically_similar_to--> `CLAUDE.md (instructions projet Scatter)`  [INFERRED] [semantically similar]
  README.md → CLAUDE.md
- `Case ios decochee par defaut (IPA payante)` --semantically_similar_to--> `Jamais de tag v* sans feu vert (cout macOS)`  [INFERRED] [semantically similar]
  .github/workflows/mobile-app.yml → CLAUDE.md
- `Methodes de distribution iPhone (Xcode, SideStore, TestFlight)` --semantically_similar_to--> `Distribution iPhone via IPA et Sideloadly`  [INFERRED] [semantically similar]
  docs/IOS.md → CLAUDE.md
- `Taches uniquement locales (build Android, tests telephone)` --semantically_similar_to--> `Build APK Android (prebuild, gradle, CMake)`  [INFERRED] [semantically similar]
  CLAUDE.md → README.md
- `GameRecord` --references--> `Role`  [EXTRACTED]
  apps/mobile/src/stats.ts → packages/shared/src/index.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Chaine de publication mobile** — github_workflows_mobile_app, claude_notag, readme_release, docs_ios [INFERRED 0.85]
- **Chaine de publication serveur** — github_workflows_server_image, docker_compose, claude_deploy [INFERRED 0.85]
- **Regles de visibilite des joueurs** — claude_visibility, claude_pingdelay, claude_zone, claude_view [INFERRED 0.85]

## Communities (28 total, 4 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (114): emit(), leaveGame(), updateMe(), countLabel(), EndBanner(), GameScreen(), GpsWarning(), Hud() (+106 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (37): MapView(), TutorialScreen(), Layer, listeners, load(), mapColors(), mix(), Mode (+29 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (46): loadGame(), saveGame(), Ack, at(), bearer(), body(), broadcastLobby(), broadcastState() (+38 more)

### Community 3 - "Community 3"
Cohesion: 0.10
Nodes (41): base(), connect(), ensureConnected(), http(), register(), sendPosition(), usernameAvailable(), RootLayout() (+33 more)

### Community 4 - "Community 4"
Cohesion: 0.05
Nodes (38): AGENTS.md mobile (consignes Expo), Verifier la doc Expo versionnee, ne pas se fier a la memoire, Expo Router, routes dans src/app, db, q, User, CLAUDE.md (instructions projet Scatter), Comptes sans e-mail, jeton hache (+30 more)

### Community 5 - "Community 5"
Cohesion: 0.05
Nodes (41): devDependencies, eslint, eslint-config-expo, @types/react, typescript, @kr/shared, socket.io-client, main (+33 more)

### Community 6 - "Community 6"
Cohesion: 0.07
Nodes (25): center, jitter(), N, rtt, run, SECS, setup, sockets (+17 more)

### Community 7 - "Community 7"
Cohesion: 0.06
Nodes (31): dependencies, expo, expo-battery, expo-camera, expo-constants, expo-dev-client, expo-file-system, expo-font (+23 more)

### Community 8 - "Community 8"
Cohesion: 0.07
Nodes (28): backgroundColor, foregroundImage, monochromeImage, adaptiveIcon, blockedPermissions, package, permissions, predictiveBackGestureEnabled (+20 more)

### Community 9 - "Community 9"
Cohesion: 0.13
Nodes (23): Game, Player, Sample, SavedGame, UserRef, C2S, DisplayName, EDGE_WARN_M (+15 more)

### Community 10 - "Community 10"
Cohesion: 0.19
Nodes (22): addBots(), botsCatch(), botTalks(), CHAT, human(), lastPos(), moveBots(), NAMES (+14 more)

### Community 11 - "Community 11"
Cohesion: 0.11
Nodes (18): dependencies, @kr/shared, socket.io, devDependencies, socket.io-client, @types/node, @kr/shared, socket.io-client (+10 more)

### Community 12 - "Community 12"
Cohesion: 0.22
Nodes (15): center, games, N, t0, capture(), createGame(), GameError, isReady() (+7 more)

### Community 13 - "Community 13"
Cohesion: 0.24
Nodes (18): checkZone(), current(), end(), huntEnd(), huntStart(), isOutOfZone(), leave(), ping() (+10 more)

### Community 14 - "Community 14"
Cohesion: 0.21
Nodes (15): clearStats(), emit(), exportStats(), file(), GameRecord, listeners, load(), recordGame() (+7 more)

### Community 15 - "Community 15"
Cohesion: 0.20
Nodes (9): dependencies, zod, exports, main, name, private, type, version (+1 more)

### Community 16 - "Community 16"
Cohesion: 0.29
Nodes (6): name, private, scripts, server, test, workspaces

### Community 17 - "Community 17"
Cohesion: 0.40
Nodes (4): { defineConfig }, expoConfig, ref_eslint_config, ref_eslint_config_expo_flat

### Community 18 - "Community 18"
Cohesion: 0.40
Nodes (4): compilerOptions, strict, extends, expo/tsconfig.base

### Community 19 - "Community 19"
Cohesion: 0.67
Nodes (4): Scatter brand mark (mark.svg), Solid circle outline (stroke #E8EEE4, r=8, offset toward top-right), Dotted circle: shrinking zone (stroke #E8EEE4, dashed, r=15), Lime dot: player escaping the zone (fill #D4FF3A, r=3.2)

### Community 20 - "Community 20"
Cohesion: 0.50
Nodes (4): Deroulement: salon, decompte, avance, chasse, fin, PING_DELAY_MS (chasseurs voient 1 min avant), Vues par joueur (view, sid), Visibilite et ping des positions

### Community 21 - "Community 21"
Cohesion: 1.00
Nodes (3): Android adaptive icon foreground (Scatter): dashed pale-green ring around a solid ring with a lime-green dot, on transparent background, Radar/ping motif: concentric dashed outer ring, solid inner ring, lime dot (prey/hunter position), Scatter brand identity (mobile manhunt game): pale slate-green and lime accent palette

### Community 22 - "Community 22"
Cohesion: 0.67
Nodes (3): Scatter app icon (dark background, dashed ring, circle with lime dot), Icon palette: near-black green background, off-white strokes, neon lime accent, Radar/ping motif: dashed outer ring around solid ring with lime dot (hunter and prey tracking)

### Community 23 - "Community 23"
Cohesion: 1.00
Nodes (3): Scatter splash icon (dashed circle, ring, lime dot), Scatter mobile manhunt game branding, Radar/ping motif: dashed outer circle, ring, lime target dot

## Knowledge Gaps
- **199 isolated node(s):** `Tab`, `Here`, `Base`, `TextKind`, `Sample` (+194 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 232 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `CLAUDE.md (instructions projet Scatter)` connect `Community 4` to `Community 0`, `Community 2`, `Community 3`, `Community 9`, `Community 10`?**
  _High betweenness centrality (0.099) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Community 7` to `Community 5`?**
  _High betweenness centrality (0.084) - this node is a cross-community bridge._
- **Why does `socket.io` connect `Community 11` to `Community 2`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **What connects `Tab`, `Here`, `Base` to the rest of the system?**
  _199 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05905511811023622 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.05795918367346939 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.0700354609929078 - nodes in this community are weakly interconnected._