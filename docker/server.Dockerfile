FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm ci --ignore-scripts --workspace=server --include-workspace-root=false
COPY server server
RUN npm run build --workspace=server
RUN npm prune --workspace=server --omit=dev

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/server/package.json ./server/package.json
COPY --from=build --chown=node:node /app/server/dist ./server/dist
COPY --from=build --chown=node:node /app/server/knexfile.cjs ./server/dist/knexfile.cjs
RUN mkdir -p /app/uploads && chown node:node /app/uploads
USER node
EXPOSE 5000
CMD ["node", "server/dist/server.js"]
