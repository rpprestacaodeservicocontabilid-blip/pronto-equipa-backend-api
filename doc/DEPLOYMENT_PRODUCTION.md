# 🚀 Guia de Deployment e Escalabilidade

## 1. Checklist Pré-Produção

### Segurança
- [ ] `JWT_SECRET` definido com chave forte (mínimo 32 caracteres)
- [ ] `DATABASE_URL` definido com credenciais seguras
- [ ] `FRONTEND_URL` configurado corretamente
- [ ] Senhas do banco não estão em repositório (apenas em `.env`)
- [ ] SSL/TLS habilitado em produção
- [ ] CORS restrito apenas ao frontend autorizado
- [ ] Rate limiting habilitado

### Banco de Dados
- [ ] Migrations executadas: `npm run sequelize migrate:latest`
- [ ] Seeders executados (se necessário): `npm run sequelize db:seed:all`
- [ ] Backups configurados
- [ ] Pool de conexões otimizado: `DB_POOL_MAX=10`
- [ ] Índices criados em colunas de busca frequente

### Aplicação
- [ ] Variáveis de ambiente revisadas
- [ ] Build testado: `npm run build`
- [ ] Dist gerado e testado: `npm start`
- [ ] Logs configurados e monitorados
- [ ] Health check testado: `GET /health`
- [ ] Swagger documentado: `GET /api-docs`

### Performance
- [ ] Compressão gzip habilitada
- [ ] Caching de respostas configurado
- [ ] Timeouts configurados
- [ ] Monitoramento de performance

---

## 2. Ambiente de Produção

### Variáveis de Ambiente Essenciais

```bash
# Servidor
PORT=3000
NODE_ENV=production

# Banco de Dados (usar DATABASE_URL)
DATABASE_URL="postgresql://user:strong-password@db-host:5432/peladeiro-db"
DB_POOL_MAX=20
DB_POOL_MIN=5

# Autenticação (MUDE ESTES VALORES)
JWT_SECRET="use-uma-chave-aleatoria-de-32-caracteres-aqui"
JWT_EXPIRES_IN="7d"

# CORS e Frontend
FRONTEND_URL="https://seu-dominio.com"

# Logging
LOG_LEVEL=info
DB_LOGGING=false

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### Geração de JWT_SECRET Seguro

```bash
# No terminal, gere uma chave aleatória:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Exemplo de saída:
# a7f3b2c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0
```

---

## 3. Escalabilidade Horizontal

### Arquitetura com Load Balancer

```
┌─────────────────────────────────────┐
│        Nginx / HAProxy              │
│      Load Balancer (SSL/TLS)       │
└──────────────────┬──────────────────┘
                   │
        ┌──────────┼──────────┐
        │          │          │
    ┌───▼──┐  ┌───▼──┐  ┌───▼──┐
    │ API1 │  │ API2 │  │ API3 │
    │:3000 │  │:3001 │  │:3002 │
    └───┬──┘  └───┬──┘  └───┬──┘
        │         │         │
        └────────┬┴─────────┘
                 │
        ┌────────▼────────┐
        │  PostgreSQL     │
        │  Centralizado   │
        └─────────────────┘
```

### Configuração de Load Balancer (Nginx)

```nginx
upstream peladeiro_api {
    least_conn;
    server api1.local:3000 weight=1;
    server api2.local:3001 weight=1;
    server api3.local:3002 weight=1;
    keepalive 32;
}

server {
    listen 443 ssl http2;
    server_name api.seu-dominio.com;

    ssl_certificate /etc/ssl/certs/seu-cert.crt;
    ssl_certificate_key /etc/ssl/private/seu-key.key;
    ssl_protocols TLSv1.2 TLSv1.3;

    client_max_body_size 10M;
    
    location / {
        proxy_pass http://peladeiro_api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    location /health {
        access_log off;
        proxy_pass http://peladeiro_api;
    }
}

# Redirecionar HTTP para HTTPS
server {
    listen 80;
    server_name api.seu-dominio.com;
    return 301 https://$server_name$request_uri;
}
```

### Docker para Containerização

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist ./dist
COPY src ./src

EXPOSE 3000

CMD ["node", "dist/main/server.js"]
```

```yaml
# docker-compose.yml para produção
version: '3.8'

services:
  api:
    build: .
    restart: always
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - JWT_SECRET=${JWT_SECRET}
      - FRONTEND_URL=${FRONTEND_URL}
    depends_on:
      - db
    networks:
      - peladeiro-net

  db:
    image: postgres:15-alpine
    restart: always
    environment:
      - POSTGRES_USER=${DB_USER}
      - POSTGRES_PASSWORD=${DB_PASSWORD}
      - POSTGRES_DB=${DB_NAME}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - peladeiro-net

volumes:
  postgres_data:

networks:
  peladeiro-net:
```

---

## 4. Monitoramento e Observabilidade

### Logs Centralizados

```typescript
// Integração com ELK Stack, DataDog, ou CloudWatch
import { logger } from "./config/logger";

logger.info("Evento importante", {
  userId: user.id,
  action: "login",
  timestamp: new Date()
});
```

### Health Check

```bash
# Verificar saúde da API
curl http://api.seu-dominio.com/health

# Resposta esperada:
{
  "status": "ok",
  "timestamp": "2026-04-05T10:30:00Z",
  "version": "1.0.0"
}
```

### Métricas

```typescript
// Exemplo com Prometheus
import prometheus from 'prom-client';

const httpRequestDuration = new prometheus.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code']
});

// Usar em middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestDuration
      .labels(req.method, req.route.path, res.statusCode)
      .observe(duration);
  });
  next();
});
```

---

## 5. CI/CD Pipeline

### GitHub Actions (Exemplo)

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  test-and-deploy:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run linter
        run: npm run lint
      
      - name: Run tests
        run: npm run test
      
      - name: Build
        run: npm run build
      
      - name: Deploy to production
        run: |
          # Deploy script (rsync, docker push, etc)
          docker build -t api:latest .
          docker push your-registry/api:latest
          # Trigger deployment via webhook
```

---

## 6. Performance Tuning

### Otimizações Recomendadas

1. **Compressão Gzip**
   ```typescript
   import compression from 'compression';
   app.use(compression());
   ```

2. **HTTP/2 Push**
   - Configure no nginx/load balancer

3. **Caching**
   - Implementar Redis para cache de requisições
   - Cache de queries frequentes

4. **Database Indexes**
   ```sql
   -- Criar índices
   CREATE INDEX idx_user_email ON users(email);
   CREATE INDEX idx_booking_field_date ON bookings(field_id, date);
   ```

5. **Connection Pooling**
   ```env
   DB_POOL_MAX=20
   DB_POOL_MIN=5
   ```

---

## 7. Procedimento de Deploy

### 1. Preparação
```bash
# Pull latest code
git pull origin main

# Install dependencies
npm ci

# Run tests
npm test

# Build
npm run build
```

### 2. Migração de Database
```bash
# Em staging primeiro
npm run sequelize migrate:latest -- --env staging

# Depois em produção
npm run sequelize migrate:latest -- --env production
```

### 3. Deploy da Aplicação
```bash
# Build docker image
docker build -t peladeiro-api:v1.0.0 .

# Push to registry
docker push registry.com/peladeiro-api:v1.0.0

# Update deployment
kubectl set image deployment/api api=registry.com/peladeiro-api:v1.0.0

# Verify rollout
kubectl rollout status deployment/api
```

### 4. Verificação Pós-Deploy
```bash
# Health check
curl https://api.seu-dominio.com/health

# Teste de autenticação
curl -X POST https://api.seu-dominio.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"password"}'

# Verificar logs
kubectl logs -f deployment/api
```

---

## 8. Rollback Plan

### Em caso de problema:
```bash
# Reverter para versão anterior
docker pull registry.com/peladeiro-api:v1.0.0-stable
kubectl set image deployment/api api=registry.com/peladeiro-api:v1.0.0-stable

# Reverter migração de banco (se necessário)
npm run sequelize migration:previous -- --env production

# Verificar status
kubectl rollout history deployment/api
```

---

## Próximos Passos

1. ✅ Configurar Swagger completo
2. ⏳ Implementar autenticação OAuth2 (Google/GitHub)
3. ⏳ Configurar logging centralizado (ELK/DataDog)
4. ⏳ Implementar monitoramento e alertas
5. ⏳ Testes de carga com k6/JMeter
6. ⏳ Documentar runbooks de operação

