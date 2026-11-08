FROM node:22-alpine AS build
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/tsconfig.json ./
COPY server/src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY server/package.json ./
COPY data/文言文字词数据.json /data/wenyan.json
ENV DATA_FILE=/data/wenyan.json PORT=3000
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
