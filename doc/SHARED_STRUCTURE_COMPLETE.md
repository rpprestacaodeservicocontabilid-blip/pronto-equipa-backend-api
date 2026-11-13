# ✅ Estrutura Compartilhada Completa

## 📦 O Que Foi Criado em `src/shared`

### 🏢 Pasta: `/constants`
- **http-status.ts** - Constantes de status HTTP e mensagens padrão

### 🚨 Pasta: `/errors`
- **app.error.ts** - Classes de erro customizadas:
  - `AppError` - Erro base
  - `ValidationError` - Erros de validação (422)
  - `NotFoundError` - Recurso não encontrado (404)
  - `ConflictError` - Conflito (409)
  - `UnauthorizedError` - Não autenticado (401)
  - `ForbiddenError` - Sem permissão (403)
  - `BadRequestError` - Requisição inválida (400)
  - `InternalServerError` - Erro interno (500)
  - `RateLimitError` - Limite de requisições (429)

### 🔌 Pasta: `/middlewares`
- **error.middleware.ts** - Tratamento centralizado de erros
  - Captura `AppError` e erros genéricos
  - Logging automático
  - Respostas estruturadas

- **auth/** 
  - auth.middleware.ts - Autenticação JWT
  - authorize() - Controle de roles
  
- **tenant.middleware.ts** - Contexto de tenant/cidade

### 📝 Pasta: `/types`
- **index.ts** - Tipos e interfaces globais:
  - `ApiResponse<T>` - Resposta padrão
  - `AuthUser` - Usuário autenticado
  - `TenantContext` - Contexto de tenant
  - `PaginationParams` - Parâmetros de paginação
  - `PaginatedResult<T>` - Resultado paginado
  - Enums: `EntityStatus`, `UserRole`, `MatchStatus`, `TournamentStatus`, `PaymentStatus`, `BookingStatus`

### 🛠️ Pasta: `/utils`
- **pagination.ts**
  - `calculateOffset()` - Calcula offset de página
  - `normalizePaginationParams()` - Valida parâmetros
  - `formatPaginatedResult()` - Formata resultado

- **formatters.ts**
  - `formatCurrency()` - Formata como moeda (Kz)
  - `formatDate()` - Formata data
  - `formatDateTime()` - Formata data e hora
  - `calculateAge()` - Calcula idade
  - `normalizeEmail()` - Normaliza email
  - `normalizePhone()` - Normaliza telefone
  - `isValidEmail()` - Valida email
  - `removeSpecialChars()` - Remove caracteres especiais
  - `truncateText()` - Trunca com reticências
  - `capitalize()` - Capitaliza primeira letra
  - `titleCase()` - Caso título

- **index.ts** - Exporta todas funções utilitárias

## 📚 Como Usar

### Importar tipos
```typescript
import { 
  ApiResponse, 
  AuthUser, 
  MatchStatus,
  PaginatedResult 
} from "../shared/types";
```

### Importar erros
```typescript
import { NotFoundError, ValidationError } from "../shared/errors/app.error";

throw new NotFoundError("User");
throw new ValidationError("Email invalid");
```

### Importar constantes
```typescript
import { HTTP_STATUS, HTTP_MESSAGES } from "../shared/constants/http-status";

res.status(HTTP_STATUS.CREATED).json({ message: HTTP_MESSAGES.CREATED });
```

### Importar utilitários
```typescript
import { 
  formatCurrency, 
  formatDate,
  calculateAge,
  formatPaginatedResult 
} from "../shared/utils";
```

## 🎯 Padrão de Resposta de Erro

```typescript
{
  "success": false,
  "error": {
    "message": "User not found",
    "code": "NOT_FOUND",
    "statusCode": 404,
    "timestamp": "2026-03-24T15:47:21.006Z"
  }
}
```

## 🎯 Padrão de Resposta de Sucesso

```typescript
{
  "success": true,
  "data": { ... },
  "message": "Success",
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "totalPages": 10
  }
}
```

## ✅ Checklist de Sistema

- [x] HTTP Status constants
- [x] Custom error classes
- [x] Error middleware
- [x] Common types & enums
- [x] Pagination utilities
- [x] Format utilities
- [x] All module routes integrated

---
*Configuração realizada em: Março 2026*
