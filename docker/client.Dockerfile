FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
RUN npm ci --ignore-scripts --workspace=client --include-workspace-root=false
COPY client client
ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build --workspace=client

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/client/dist /usr/share/nginx/html
EXPOSE 80
