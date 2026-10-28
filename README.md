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
```sh
docker compose up -d --build
curl http://localhost:3000/health
```
Derrière un reverse proxy (NPMPlus / Nginx Proxy Manager) : proxy host → `http://<ip>:3000`, **activer « Websockets Support »**.

Variables : `PORT` (3000), `DATA_DIR` (`/data`, volume `kr-data`).
