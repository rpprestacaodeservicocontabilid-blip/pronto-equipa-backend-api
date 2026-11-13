# Validação de Input e Recomendações de Escalabilidade

## 1. Validação de Input com Zod

### Middleware de Validação

Imported from `src/shared/middlewares/validation.middleware.ts`:
- `validateBody(schema)` - Valida body da requisição
- `validateQuery(schema)` - Valida query parameters
- `validateParams(schema)` - Valida parâmetros de rota

### Exemplo de Uso em Rotas

```typescript
import { Router } from "express";
import { validateBody, validateParams } from "../shared/middlewares/validation.middleware";
import { z } from "zod";
import { authenticate } from "../shared/middlewares/auth/auth.middleware";

const router = Router();

// Schema de validação
const createUserSchema = z.object({
  name: z.string().min(2).max(255),
  email: z.string().email(),
  password: z.string().min(8)
});

const userIdSchema = z.object({
  id: z.string().transform(Number)
});

// Rota com validação
router.post(
  "/",
  validateBody(createUserSchema),
  async (req, res) => {
    // req.body já foi validado
    const userData = req.body; // dados garantidamente válidos
    // ... processar
  }
);

router.get(
  "/:id",
  validateParams(userIdSchema),
  async (req, res) => {
    const { id } = req.params;
    // ... processar
  }
);
```

## 2. Autenticação e Autorização

### Middleware de Autenticação Evolução

Imports from `src/shared/middlewares/auth/auth.middleware.ts`:
- `authenticate` - Valida JWT obrigatório
- `authorize(roles)` - Verifica papéis do usuário
- `authenticateOptional` - JWT opcional
- `isResourceOwner` - Verifica propriedade do recurso

### Exemplos

```typescript
// Rota protegida
router.get(
  "/",
  authenticate,
  async (req, res) => {
    const user = (req as any).user; // Dados do usuário autenticado
    // ...
  }
);

// Rota com autorização por papel
router.delete(
  "/:id",
  authenticate,
  authorize(["admin"]),
  async (req, res) => {
    // Apenas admins podem deletar
  }
);

// Rota que verifica proprietário
router.put(
  "/me/:id",
  authenticate,
  isResourceOwner,
  async (req, res) => {
    // Usuário só pode modificar seu próprio recurso
  }
);
```

## 3. Rate Limiting para Segurança

Imports from `src/shared/middlewares/rate-limit.middleware.ts`:
- `publicLimiter` - 100/15min por IP
- `authLimiter` - 5 falhas/15min por IP (login)
- `createLimiter` - 30/15min por IP (criar recursos)
- `createUserRateLimiter(windowMs, max)` - Customizado

### Exemplos

```typescript
import { authLimiter, publicLimiter, createLimiter } from "../shared/middlewares/rate-limit.middleware";

// Auth com rate limit
router.post("/login", authLimiter, async (req, res) => {
  // ...
});

// GET público com rate limit
router.get("/", publicLimiter, async (req, res) => {
  // ...
});

// Criar recurso com rate limit
router.post("/", createLimiter, async (req, res) => {
  // ...
});
```

## 4. Escalabilidade Horizontal

### Configuração para Múltiplas Instâncias

#### A. Pool de Conexões de Banco

```env
# .env
DB_POOL_MAX=10      # Aumentar em produção com múltiplas instâncias
DB_POOL_MIN=2       # Manter conexões ativas
DB_POOL_ACQUIRE=30000
DB_POOL_IDLE=10000
```

#### B. Sessão e Autenticação (Stateless)

- Usar **JWT** ao invés de sessões
- JWT permite várias instâncias sem compartilhamento de estado
- Token deve conter todos dados necessários para autorização

#### C. Variáveis de Ambiente

```env
# Recomendado para produção
DATABASE_URL=postgresql://user:pass@host:port/db
JWT_SECRET=<chave-segura-e-longa>
FRONTEND_URL=https://seu-frontend.com

# Redis (opcional, para cache compartilhado)
REDIS_URL=redis://host:port
```

#### D. Deploy com Load Balancer

```
┌─────────────────────────────────────────┐
│          Load Balancer (nginx/HAProxy)   │
└────────────────┬────────────────────────┘
                 │
         ┌───────┴───────┐
         │               │
     ┌───▼────┐     ┌──▼────┐
     │ API #1 │     │ API #2 │  ... API #N
     │:3000   │     │:3001   │
     └───┬────┘     └──┬────┘
         │               │
         └───────┬───────┘
                 │
           ┌─────▼──────┐
           │  PostgreSQL│
           │  Central   │
           └────────────┘
```

### Checklist de Escalabilidade

- [x] API stateless (sem sessão em memória)
- [x] JWT para autenticação distribuída
- [x] Pool de conexões configurável
- [x] Rate limiting por IP/usuário
- [x] DATABASE_URL para produção
- [ ] Redis para cache compartilhado (opcional)
- [ ] Monitoramento e logging centralizado
- [ ] CORS configurado seguramente

## 5. Padrão de Erro Padronizado

### Response de Erro

```typescript
// Erro de validação
{
  "message": "Validation error",
  "errors": [...]
}

// Erro de autenticação
{
  "message": "Unauthorized",
  "code": "NO_TOKEN"
}

// Erro de autorização
{
  "message": "Forbidden - insufficient permissions",
  "code": "FORBIDDEN"
}
```

### Definição de Erro Customizado

```typescript
// src/shared/errors/AppError.ts
export class AppError extends Error {
  constructor(
    public message: string,
    public code: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = "AppError";
  }
}

// Uso
throw new AppError("Email já existe", "EMAIL_EXISTS", 409);
```

## 6. Logging Estruturado

```typescript
import { logger } from "../config/logger";

// Info
logger.info("[Auth] User logged in", { userId: user.id });

// Error com contexto
logger.error("[Database] Connection failed", error);

// Warning
logger.warn("[RateLimit] Threshold reached for IP", { ip: req.ip });
```

## Ordem de Implementação Recomendada

1. ✅ Validação de input (Zod + middleware)
2. ✅ Autenticação robusta (JWT + tipos)
3. ✅ Rate limiting (segurança)
4. ⏳ Aplicar em rotas existentes
5. ⏳ Testes de carga
6. ⏳ Documentação Swagger completa
7. ⏳ Setup de monitoring (logs centralizados)

