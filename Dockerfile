# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app

# 1. Copiar ficheiros de dependências (PRECISA do package-lock.json no teu PC)
COPY package*.json ./

# 2. Instalar TUDO (incluindo devDeps para o build do TS)
RUN npm ci

COPY . .
RUN npm run build

# 3. Limpar devDependencies para deixar apenas o que é produção
RUN npm prune --production

# Stage 2: Runtime
FROM node:22-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache dumb-init

# Criar utilizador
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# 4. Copiar apenas o estritamente necessário
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./
COPY --from=builder --chown=nodejs:nodejs /app/.sequelizerc ./
COPY --from=builder --chown=nodejs:nodejs /app/src/database ./src/database

USER nodejs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3333/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main/server.js"]
