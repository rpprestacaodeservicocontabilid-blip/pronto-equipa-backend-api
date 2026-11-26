# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM dependencies AS development
ENV NODE_ENV=development
COPY --chown=node:node . .
USER node
EXPOSE 3333
CMD ["npm", "run", "dev"]

FROM dependencies AS build
COPY --chown=node:node . .
RUN npm run build

# Isolated one-shot image for schema migrations and operational tasks.
FROM dependencies AS migrations
COPY --chown=node:node . .
USER node
CMD ["./node_modules/.bin/sequelize-cli", "db:migrate", "--config", "src/config/sequelize-production.cjs", "--migrations-path", "src/infra/database/migrations", "--env", "production"]

FROM dependencies AS production-dependencies
RUN npm prune --omit=dev && npm cache clean --force

FROM ${NODE_IMAGE} AS production
ENV NODE_ENV=production \
    PORT=3333 \
    HOST=0.0.0.0
WORKDIR /app
RUN apt-get update \
    && apt-get install --no-install-recommends -y dumb-init \
    && rm -rf /var/lib/apt/lists/*
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --chown=node:node scripts/docker-entrypoint.cjs ./scripts/docker-entrypoint.cjs
RUN install -d -o node -g node /app/storage
USER node
EXPOSE 3333
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "require('http').get({host:'127.0.0.1',port:process.env.PORT||3333,path:'/health/ready'},r=>{r.resume();if(r.statusCode!==200)process.exitCode=1}).on('error',()=>process.exitCode=1)"
ENTRYPOINT ["/usr/bin/dumb-init", "--", "node", "/app/scripts/docker-entrypoint.cjs"]
CMD ["node", "dist/main/server.js"]
