# Graph Report - Keep-Runni-n  (2026-10-31)

## Corpus Check
- 46 files · ~49,897 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 14 file(s) not represented in the graph (top: .ttf 8, (none) 6)

## Summary
- 601 nodes · 1496 edges · 27 communities (24 shown, 3 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 16 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `df40a8ff`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- useTheme
- game.ts
- server/src/index.ts
- mobile/package.json
- src/tutorial.tsx
- api.ts
- showDialog
- bots.ts
- dependencies
- expo
- CLAUDE.md (project rules and state)
- load.ts
- server/package.json
- shared/package.json
- package.json
- eslint.config.js
- tsconfig.json
- Scatter brand mark (mark.svg)
- Consignes agents Expo mobile
- Android adaptive icon foreground (Scatter): dashed pale-green ring around a solid ring with a lime-green dot, on transparent background
- Scatter app icon (dark background, dashed ring, circle with lime dot)
- Scatter splash icon (dashed circle, ring, lime dot)
- Android Themed Monochrome Icon (Scatter)
- Scatter web favicon (dashed circle with glowing dot on dark background)
- Continuous Native Generation (ios/android générés)
- shared/src/index.ts
- game.test.ts

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
- `GameRecord` --references--> `Role`  [EXTRACTED]
  apps/mobile/src/stats.ts → packages/shared/src/index.ts
- `trackPosition()` --calls--> `distanceM()`  [EXTRACTED]
  apps/mobile/src/stats.ts → packages/shared/src/index.ts
- `games` --calls--> `defaultRules()`  [EXTRACTED]
  apps/server/src/bench.ts → packages/shared/src/index.ts
- `moveBots()` --calls--> `zoneRadius()`  [EXTRACTED]
  apps/server/src/bots.ts → packages/shared/src/index.ts
- `sendStray()` --calls--> `zoneRadius()`  [EXTRACTED]
  apps/server/src/bots.ts → packages/shared/src/index.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Build and deployment pipeline** — github_workflows_server_image, github_workflows_mobile_app, docker_compose, ghcr_image [INFERRED 0.85]

## Communities (27 total, 3 thin omitted)

### Community 0 - "useTheme"
Cohesion: 0.06
Nodes (101): countLabel(), EndBanner(), GameScreen(), GpsWarning(), Hud(), Legend(), MapView(), PhaseBanner() (+93 more)

### Community 1 - "game.ts"
Cohesion: 0.25
Nodes (21): checkZone(), current(), end(), endNow(), huntEnd(), huntStart(), isOutOfZone(), leave() (+13 more)

### Community 2 - "server/src/index.ts"
Cohesion: 0.08
Nodes (43): loadGame(), SavedGame, saveGame(), Ack, at(), bearer(), body(), broadcastLobby() (+35 more)

### Community 3 - "mobile/package.json"
Cohesion: 0.05
Nodes (44): devDependencies, eslint, eslint-config-expo, @types/react, typescript, @kr/shared, socket.io-client, main (+36 more)

### Community 4 - "src/tutorial.tsx"
Cohesion: 0.07
Nodes (31): TutorialScreen(), Layer, listeners, load(), mapColors(), mix(), Mode, pending (+23 more)

### Community 5 - "api.ts"
Cohesion: 0.10
Nodes (41): base(), connect(), ensureConnected(), http(), register(), sendPosition(), usernameAvailable(), RootLayout() (+33 more)

### Community 6 - "showDialog"
Cohesion: 0.15
Nodes (31): emit(), leaveGame(), updateMe(), MoreSheet(), quit(), clamp(), LobbyScreen(), kick() (+23 more)

### Community 7 - "bots.ts"
Cohesion: 0.22
Nodes (20): addBots(), botsCatch(), botTalks(), CHAT, human(), lastPos(), moveBots(), NAMES (+12 more)

### Community 8 - "dependencies"
Cohesion: 0.06
Nodes (31): dependencies, expo, expo-battery, expo-camera, expo-constants, expo-dev-client, expo-file-system, expo-font (+23 more)

### Community 9 - "expo"
Cohesion: 0.07
Nodes (28): backgroundColor, foregroundImage, monochromeImage, adaptiveIcon, blockedPermissions, package, permissions, predictiveBackGestureEnabled (+20 more)

### Community 10 - "CLAUDE.md (project rules and state)"
Cohesion: 0.12
Nodes (19): OFL.txt (font license), CLAUDE.md (project rules and state), Local Android build (worktree, CMake 3.31.6), Game rules (hunters, fugitives, zone, ping, capture), In-memory games with games.json persistence, iOS distribution via Sideloadly (no TestFlight), Per-player view with short sid, Socket.IO protocol (client/server events) (+11 more)

### Community 11 - "load.ts"
Cohesion: 0.05
Nodes (31): db, q, User, center, jitter(), N, rtt, run (+23 more)

### Community 12 - "server/package.json"
Cohesion: 0.11
Nodes (18): dependencies, @kr/shared, socket.io, devDependencies, socket.io-client, @types/node, @kr/shared, socket.io-client (+10 more)

### Community 13 - "shared/package.json"
Cohesion: 0.20
Nodes (9): dependencies, zod, exports, main, name, private, type, version (+1 more)

### Community 14 - "package.json"
Cohesion: 0.29
Nodes (6): name, private, scripts, server, test, workspaces

### Community 15 - "eslint.config.js"
Cohesion: 0.40
Nodes (4): { defineConfig }, expoConfig, ref_eslint_config, ref_eslint_config_expo_flat

### Community 16 - "tsconfig.json"
Cohesion: 0.40
Nodes (4): compilerOptions, strict, extends, expo/tsconfig.base

### Community 17 - "Scatter brand mark (mark.svg)"
Cohesion: 0.67
Nodes (4): Scatter brand mark (mark.svg), Solid circle outline (stroke #E8EEE4, r=8, offset toward top-right), Dotted circle: shrinking zone (stroke #E8EEE4, dashed, r=15), Lime dot: player escaping the zone (fill #D4FF3A, r=3.2)

### Community 18 - "Consignes agents Expo mobile"
Cohesion: 0.67
Nodes (3): EAS Build, Expo Router (src/app), Consignes agents Expo mobile

### Community 19 - "Android adaptive icon foreground (Scatter): dashed pale-green ring around a solid ring with a lime-green dot, on transparent background"
Cohesion: 1.00
Nodes (3): Android adaptive icon foreground (Scatter): dashed pale-green ring around a solid ring with a lime-green dot, on transparent background, Radar/ping motif: concentric dashed outer ring, solid inner ring, lime dot (prey/hunter position), Scatter brand identity (mobile manhunt game): pale slate-green and lime accent palette

### Community 20 - "Scatter app icon (dark background, dashed ring, circle with lime dot)"
Cohesion: 0.67
Nodes (3): Scatter app icon (dark background, dashed ring, circle with lime dot), Icon palette: near-black green background, off-white strokes, neon lime accent, Radar/ping motif: dashed outer ring around solid ring with lime dot (hunter and prey tracking)

### Community 21 - "Scatter splash icon (dashed circle, ring, lime dot)"
Cohesion: 1.00
Nodes (3): Scatter splash icon (dashed circle, ring, lime dot), Scatter mobile manhunt game branding, Radar/ping motif: dashed outer circle, ring, lime target dot

### Community 25 - "shared/src/index.ts"
Cohesion: 0.11
Nodes (20): Game, Player, C2S, DisplayName, EDGE_WARN_M, FINAL_ZONE_BEFORE_END_MS, LobbyPlayer, MIN (+12 more)

### Community 26 - "game.test.ts"
Cohesion: 0.22
Nodes (14): center, games, N, t0, capture(), createGame(), GameError, isReady() (+6 more)

## Knowledge Gaps
- **193 isolated node(s):** `name`, `slug`, `scheme`, `version`, `orientation` (+188 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 229 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `dependencies` to `mobile/package.json`?**
  _High betweenness centrality (0.083) - this node is a cross-community bridge._
- **Why does `socket.io` connect `server/package.json` to `server/src/index.ts`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **Why does `useTheme()` connect `useTheme` to `src/tutorial.tsx`, `api.ts`, `showDialog`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **What connects `name`, `slug`, `scheme` to the rest of the system?**
  _193 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `useTheme` be split into smaller, more focused modules?**
  _Cohesion score 0.06130268199233716 - nodes in this community are weakly interconnected._
- **Should `server/src/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07676767676767676 - nodes in this community are weakly interconnected._
- **Should `mobile/package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.04830917874396135 - nodes in this community are weakly interconnected._