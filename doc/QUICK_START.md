# 🚀 Quick Start Guide - Recomendações Implementadas

## 1️⃣ Validação de Input (30 segundos)

```typescript
import { validateBody } from "../shared/middlewares/validation.middleware";
import { z } from "zod";

// 1. Criar schema
const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8)
});

// 2. Usar em rota
router.post("/", validateBody(schema), controller.create);

// Pronto! Validação automática com erros padronizados.
```

---

## 2️⃣ Autenticação (30 segundos)

```typescript
import { authenticate, authorize, isResourceOwner } from "../shared/middlewares/auth/auth.middleware";

// Rota protegida por JWT
router.get("/", authenticate, controller.findAll);

// Rota com autorização por papel
router.delete("/:id", authenticate, authorize(["admin"]), controller.delete);

// Rota onde só o proprietário pode acessar
router.put("/me/:id", authenticate, isResourceOwner, controller.update);
```

---

## 3️⃣ Rate Limiting (30 segundos)

```typescript
import { authLimiter, createLimiter, publicLimiter } from "../shared/middlewares/rate-limit.middleware";

// Login com limite restritivo (5 tentativas/15min)
router.post("/login", authLimiter, controller.login);

// GET público (100/15min)
router.get("/", publicLimiter, controller.findAll);

// Criar recurso (30/15min)
router.post("/", createLimiter, authenticate, controller.create);
```

---

## 4️⃣ Variáveis de Ambiente (2 minutos)

```bash
# 1. Copiar exemplo
cp .env.example .env

# 2. Gerar JWT_SECRET seguro
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 3. Colocar no .env:
JWT_SECRET=<valor-gerado>
FRONTEND_URL=http://localhost:3333
DATABASE_URL=postgresql://user:pass@localhost:5432/peladeiro

# 4. Setup completo!
```

---

## 5️⃣ Health Check (Automático)

```bash
curl http://localhost:3333/health

# Resposta:
{
  "status": "ok",
  "timestamp": "2026-04-05T10:30:00Z",
  "version": "1.0.0"
}
```

---

## 6️⃣ Swagger Documentation (Automático)

```bash
# Documentação em desenvolvimento:
http://localhost:3333/api-docs

# JSON spec:
http://localhost:3333/api-spec.json
```

**Documentar um endpoint:**
```typescript
/**
 * @swagger
 * /users:
 *   post:
 *     summary: Criar novo usuário
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateUserRequest'
 *     responses:
 *       201:
 *         description: Usuário criado
 */
router.post("/", validateBody(schema), authenticate, controller.create);
```

---

## 7️⃣ Logging Estruturado

```typescript
import { logger } from "../config/logger";

// INFO
logger.info("Usuário criado", { userId: user.id });

// WARNING
logger.warn("Tentativa de acesso não autorizado", { userId, action });

// ERROR
logger.error("Erro ao conectar banco", error);

// DEBUG
logger.debug("Valores internos", { data });
```

---

## 8️⃣ Segurança em Checklist

```bash
# ✅ Verificação automática na startup:
npm run dev

# Você verá:
# 🔒 VERIFICAÇÃO DE SEGURANÇA:
# (Avisos sobre configurações de produção)
```

---

## 🔧 Troubleshooting

### Build falha
```bash
# Verificar erros TypeScript
npx tsc -p tsconfig.json --noEmit
```

### JWT_SECRET não definido
```bash
# Verificar .env
grep JWT_SECRET .env

# Gerar novo se necessário
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Rate limiting muito restritivo
```bash
# Modificar em .env
RATE_LIMIT_WINDOW_MS=600000  # 10 minutos
RATE_LIMIT_MAX_REQUESTS=200  # 200 requisições
```

---

## 📊 Estrutura de Resposta

### Sucesso (200/201)
```json
{
  "data": { "id": 1, "name": "João" },
  "message": "Operação realizada"
}
```

### Erro de Validação (400)
```json
{
  "message": "Validation error",
  "errors": [
    {
      "path": "email",
      "message": "Email inválido"
    }
  ]
}
```

### Erro de Autenticação (401)
```json
{
  "message": "Unauthorized",
  "code": "TOKEN_EXPIRED"
}
```

### Erro de Autorização (403)
```json
{
  "message": "Forbidden - insufficient permissions",
  "code": "FORBIDDEN"
}
```

---

## 🎓 Exemplos Completos

### Criar Endpoint com Tudo

```typescript
// src/modules/users/routes/user.routes.ts

import { Router } from "express";
import { UserController } from "../controller/user.controller";
import { authenticate, authorize } from "../../../shared/middlewares/auth/auth.middleware";
import { validateBody } from "../../../shared/middlewares/validation.middleware";
import { createLimiter } from "../../../shared/middlewares/rate-limit.middleware";
import { createUserSchema } from "../validation/user.validation";

const router = Router();
const controller = new UserController();

/**
 * @swagger
 * /users:
 *   post:
 *     summary: Criar novo usuário
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateUserRequest'
 *     responses:
 *       201:
 *         description: Usuário criado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post(
  "/",
  createLimiter,                    // Rate limit
  validateBody(createUserSchema),  // Validar input
  authenticate,                     // Verificar JWT
  authorize(["admin"]),             // Verificar permissão
  controller.create                 // Controller
);

export default router;
```

---

## 📚 Referências

- [Validação e Escalabilidad](./VALIDATION_AND_SCALABILITY.md)
- [Deployment Produção](./DEPLOYMENT_PRODUCTION.md)
- [Documentação Swagger](./SWAGGER_DOCUMENTATION.md)
- [Resumo de Implementação](./IMPLEMENTATION_SUMMARY.md)

---

## ⏱️ Tempos Estimados

| Tarefa | Tempo |
|--------|-------|
| Copiar `.env.example` → `.env` | 1 min |
| Adicionar validação a 1 endpoint | 5 min |
| Documentar 1 endpoint em Swagger | 3 min |
| Revisar e testar build | 5 min |
| Deploy em produção | 15-30 min |

---

**Última atualização:** 5 de Abril de 2026

