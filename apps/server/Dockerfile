FROM node:22-alpine
LABEL org.opencontainers.image.source="https://github.com/m335671/Scatter" \
      org.opencontainers.image.description="Scatter game server" \
      org.opencontainers.image.licenses="MIT"
WORKDIR /app
RUN mkdir /data && chown node /data
COPY package.json package-lock.json ./
COPY packages/shared ./packages/shared
COPY apps/server/package.json ./apps/server/
# npm ci : exactement les versions du package-lock, jamais une mise à jour non relue.
RUN npm ci --omit=dev -w @kr/server && npm cache clean --force
COPY apps/server/src ./apps/server/src
# Renseignés par le workflow GitHub : visibles dans /version.
ARG COMMIT=dev
ARG BUILT_AT=
ENV NODE_ENV=production DATA_DIR=/data PORT=3000 COMMIT=$COMMIT BUILT_AT=$BUILT_AT
EXPOSE 3000
VOLUME /data
USER node
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "--experimental-strip-types", "--no-warnings", "apps/server/src/index.ts"]
