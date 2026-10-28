FROM node:22-alpine
WORKDIR /app
RUN mkdir /data && chown node /data
COPY package.json ./
COPY packages/shared ./packages/shared
COPY apps/server ./apps/server
RUN npm install --omit=dev -w @kr/server && npm cache clean --force
ENV NODE_ENV=production DATA_DIR=/data PORT=3000
EXPOSE 3000
USER node
CMD ["node", "--experimental-strip-types", "--no-warnings", "apps/server/src/index.ts"]
