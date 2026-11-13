# 📚 Guia de Documentação de API com Swagger

## Como Documentar Endpoints

Toda rota deve ter documentação Swagger. Use os comentários JSDoc acima das rotas.

### Exemplo Básico: GET (Sem Autenticação)

```typescript
// src/modules/cities/routes/cities.routes.ts

import { Router } from "express";

const router = Router();

/**
 * @swagger
 * /cities:
 *   get:
 *     summary: Listar todas as cidades
 *     description: Retorna uma lista paginada de todas as cidades
 *     tags: [Cities]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Número da página
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Itens por página
 *     responses:
 *       200:
 *         description: Lista de cidades
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/City'
 *                 total:
 *                   type: integer
 */
router.get("/", controller.findAll);

export default router;
```

### Exemplo Intermediário: POST (Com Autenticação)

```typescript
/**
 * @swagger
 * /teams:
 *   post:
 *     summary: Criar novo time
 *     description: Cria um novo time de futebol
 *     tags: [Teams]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateTeamRequest'
 *     responses:
 *       201:
 *         description: Time criado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Team'
 *       400:
 *         description: Erro de validação
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 errors:
 *                   type: array
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post("/", authenticate, controller.create);
```

### Exemplo Avançado: PUT Com Parâmetros

```typescript
/**
 * @swagger
 * /fields/{id}:
 *   put:
 *     summary: Atualizar campo
 *     description: Atualiza informações de um campo de futebol
 *     tags: [Fields]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do campo
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateFieldRequest'
 *     responses:
 *       200:
 *         description: Campo atualizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Field'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         description: Campo não encontrado
 */
router.put("/:id", authenticate, isResourceOwner, controller.update);
```

## Schemas Reutilizáveis

Defina schemas em um arquivo central para reutilizar:

```typescript
// src/modules/users/schemas/user.schema.ts

/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         name:
 *           type: string
 *           example: João Silva
 *         email:
 *           type: string
 *           format: email
 *           example: joao@example.com
 *         role:
 *           type: string
 *           enum: [user, admin]
 *           example: user
 *         createdAt:
 *           type: string
 *           format: date-time
 *       required:
 *         - id
 *         - name
 *         - email
 *
 *     CreateUserRequest:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *           minLength: 2
 *           example: João Silva
 *         email:
 *           type: string
 *           format: email
 *           example: joao@example.com
 *         password:
 *           type: string
 *           minLength: 8
 *           example: senha123456
 *       required:
 *         - name
 *         - email
 *         - password
 *
 *     UpdateUserRequest:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *           minLength: 2
 *         email:
 *           type: string
 *           format: email
 *       required:
 *         - name
 *
 *     AuthResponse:
 *       type: object
 *       properties:
 *         token:
 *           type: string
 *           example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *         user:
 *           $ref: '#/components/schemas/User'
 *       required:
 *         - token
 *         - user
 */
```

## Endpoints por Módulo

### Auth
- `POST /auth/register` - Registar novo usuário
- `POST /auth/login` - Fazer login

### Users
- `GET /users` - Listar usuários
- `GET /users/:id` - Obter usuário específico
- `POST /users` - Criar novo usuário
- `PUT /users/:id` - Atualizar usuário
- `DELETE /users/:id` - Deletar usuário

### Teams
- `GET /teams` - Listar times
- `POST /teams` - Criar time
- `GET /teams/:id` - Obter time
- `PUT /teams/:id` - Atualizar time
- `DELETE /teams/:id` - Deletar time
- `GET /teams/:id/players` - Listar jogadores de um time

### Matches
- `GET /matches` - Listar partidas
- `POST /matches` - Criar partida
- `POST /matches/auto/match` - Criar partida automática
- `GET /matches/:id` - Obter detalhes
- `PATCH /matches/:id/score` - Atualizar placar
- `PUT /matches/:id` - Atualizar partida
- `DELETE /matches/:id` - Deletar partida

### Fields
- `GET /fields` - Listar campos
- `POST /fields` - Criar campo
- `GET /fields/:id` - Obter campo
- `PUT /fields/:id` - Atualizar campo
- `DELETE /fields/:id` - Deletar campo
- `GET /fields/:id/bookings` - Listar reservas do campo

### Bookings
- `GET /bookings` - Listar reservas
- `POST /bookings` - Criar reserva
- `GET /bookings/:id` - Obter reserva
- `PUT /bookings/:id` - Atualizar reserva
- `DELETE /bookings/:id` - Cancelar reserva

### Tournaments
- `GET /tournaments` - Listar torneios
- `POST /tournaments` - Criar torneio
- `PATCH /tournaments/:id/open` - Abrir inscrições
- `POST /tournaments/:id/register` - Registar time
- `GET /tournaments/city/:cityId` - Listar por cidade

### Rankings
- `GET /rankings` - Obter rankings globais
- `GET /rankings/tournament/:tournamentId` - Rankings de torneio

### Payments
- `POST /payments` - Criar pagamento
- `PATCH /payments/:id/confirm` - Confirmar pagamento
- `GET /payments/:id` - Obter pagamento
- `GET /payments/city/:cityId` - Listar por cidade

## Padrões de Resposta

### Sucesso (200/201)
```json
{
  "data": { ... },
  "message": "Operação realizada com sucesso"
}
```

### Erro (400)
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

### Erro Autenticação (401)
```json
{
  "message": "Unauthorized",
  "code": "NO_TOKEN"
}
```

### Erro Autorização (403)
```json
{
  "message": "Forbidden - insufficient permissions",
  "code": "FORBIDDEN"
}
```

## Checklist de Documentação

- [ ] Todas as rotas têm `@swagger` comments
- [ ] Descrições em português
- [ ] Exemplos de valores (`example:`)
- [ ] Tipos de dados corretos
- [ ] Security tags quando necessário
- [ ] Respostas de erro documentadas
- [ ] Schemas reutilizáveis
- [ ] Query params descritos
- [ ] Path params descritos
- [ ] Request/response bodies com schema

## Geração de Cliente Automático

A partir da documentação Swagger, pode-se gerar clientes automaticamente:

```bash
# Gerar cliente TypeScript
npx @openapitools/openapi-generator-cli generate \
  -i http://localhost:3333/api-spec.json \
  -g typescript-fetch \
  -o ./generated-client

# Gerar cliente Postman
npx openapi-to-postman \
  -s http://localhost:3333/api-spec.json \
  -o peladeiro-api.postman_collection.json
```

