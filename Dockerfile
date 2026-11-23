# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app

# 1. Copiar ficheiros de dependências (PRECISA do package-lock.json no teu PC)
COPY package*.json ./

# 2. Instalar TUDO (incluindo devDeps para o build do TS)
RUN npm ci

COPY . .
RUN npm run build

FROM builder AS migrations
CMD ["node", "node_modules/sequelize-cli/lib/sequelize", "db:migrate", "--config", "src/config/sequelize-production.cjs", "--migrations-path", "src/infra/database/migrations", "--env", "production"]

# Migration tools stay in their own image; the API gets production dependencies only.
FROM builder AS production-dependencies
RUN npm prune --omit=dev

# Stage 2: Runtime
FROM node:22-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache dumb-init

# Criar utilizador
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# 4. Copiar apenas o estritamente necessário
COPY --from=production-dependencies --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./
COPY --from=builder --chown=nodejs:nodejs /app/.sequelizerc ./
COPY --from=builder --chown=nodejs:nodejs /app/src/infra/database/helpers ./src/infra/database/helpers
COPY --from=builder --chown=nodejs:nodejs /app/scripts/audit-partitions.cjs ./scripts/audit-partitions.cjs

USER nodejs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get({host:'127.0.0.1',port:process.env.APP_PORT||3001,path:'/health/ready'},(r)=>{if(r.statusCode!==200)process.exitCode=1}).on('error',()=>{process.exitCode=1})"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main/server.js"]
