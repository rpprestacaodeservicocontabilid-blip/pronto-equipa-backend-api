# ✅ Configuração Sequelize Multi-Banco Concluída

## 🎯 O Que Foi Configurado

Seu projeto agora está **totalmente preparado** para trabalhar com **PostgreSQL**, **MySQL** e **Oracle** usando Sequelize ORM!

### 📦 Dependências Instaladas

```json
"mysql2": "^3.6.5"      // Driver para MySQL
"oracledb": "^6.3.0"    // Driver para Oracle
"@types/oracledb": "^6.2.8"  // Tipos TypeScript para Oracle
```

Já existentes:
- sequelize: ^6.37.7
- sequelize-cli: ^6.6.5
- pg: ^8.18.0 (PostgreSQL)

### 🔧 Arquivos Criados/Atualizados

| Arquivo | Descrição |
|---------|-----------|
| `.env.example` | ✨ **NOVO** - Documenta todas as variáveis de ambiente |
| `.sequelizerc` | ✨ **NOVO** - Configuração do CLI Sequelize |
| `src/database/config.js` | ✨ **NOVO** - Configuração centralizada por dialect |
| `src/config/env.ts` | 🔄 **ATUALIZADO** - Suporta dinâmico por dialect |
| `src/config/database.ts` | 🔄 **ATUALIZADO** - Inicialização flexível |
| `DATABASE_SETUP.md` | ✨ **NOVO** - Guia completo de configuração |
| `src/scripts/test-database.ts` | ✨ **NOVO** - Script para testar conexão |

## 🚀 Como Usar

### 1. Copiar .env.example para .env

```bash
cp .env.example .env
```

### 2. Configurar a Variável DB_DIALECT

Escolha um dos três:

#### Option A: PostgreSQL (Padrão)
```bash
# .env
DB_DIALECT=postgres
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=peladeiro
```

#### Option B: MySQL
```bash
# .env
DB_DIALECT=mysql
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=sua_senha
DB_NAME=peladeiro
```

#### Option C: Oracle
```bash
# .env
DB_DIALECT=oracle
DB_HOST=localhost
DB_PORT=1521
DB_USER=system
DB_PASSWORD=oracle
DB_NAME=XE
```

### 3. Instalar Dependências

```bash
npm install
# ou
yarn install
```

### 4. Criar Banco de Dados (se necessário)

**PostgreSQL:**
```bash
createdb peladeiro
```

**MySQL:**
```bash
mysql -u root -p -e "CREATE DATABASE peladeiro;"
```

**Oracle:** (já incluído na imagem Docker)

### 5. Testar Conexão

```bash
npx ts-node src/scripts/test-database.ts
```

Saída esperada:
```
🔍 Iniciando teste de conexão com banco de dados...

📋 Configuração do Banco de Dados:
   Dialect: MYSQL
   Host: localhost
   Port: 3306
   Database: peladeiro
   User: root

🔗 Testando conexão...
✅ Conexão autenticada com sucesso!

📊 Informações do Banco de Dados:
   Versão: 8.0.36-0ubuntu0.22.04.1

✅ Teste de conexão concluído com sucesso!
🚀 Seu banco de dados MYSQL está pronto para usar!
```

### 6. Executar Migrações

```bash
npm run sequelize db:migrate
```

### 7. Executar Seeders (opcional)

```bash
npm run sequelize db:seed:all
```

### 8. Iniciar o Servidor

```bash
npm run dev
```

Você deve ver no log:
```
📦 Connecting to MYSQL database at localhost
✅ Connected to MYSQL database successfully
🚀 Server running on port 3000
```

## 📊 Quick Reference

### Comuns do Sequelize CLI

```bash
# Migrações
npm run sequelize db:migrate         # Executar
npm run sequelize db:migrate:undo    # Desfazer última
npm run sequelize db:migrate:undo:all # Desfazer todas
npm run sequelize db:migrate:status  # Ver status

# Seeders
npm run sequelize seed:generate --name seu-seeder
npm run sequelize db:seed:all
npm run sequelize db:seed:undo:all

# Modelos
npm run sequelize model:generate --name User --attributes name:string,email:string
```

### Variáveis Importantes

```bash
DB_DIALECT=postgres|mysql|oracle    # Qual banco usar
DB_HOST                              # Endereço do servidor
DB_PORT                              # Porta (auto-detectada)
DB_USER                              # Usuário
DB_PASSWORD                          # Senha
DB_NAME                              # Nome do banco
DB_LOGGING=true                      # Log SQL (desenvolvimento)
```

## 🔐 Segurança

⚠️ **IMPORTANTE:**

1. **Nunca** commit o arquivo `.env` no Git:
   ```bash
   echo ".env" >> .gitignore
   ```

2. Use `.env.local` para config local:
   ```bash
   cp .env .env.local
   # Configurar .env.local
   ```

3. Em produção, use variáveis de ambiente do sistema:
   ```bash
   export DB_DIALECT=mysql
   export DB_HOST=prod-db.example.com
   export DB_PASSWORD=strong_password
   npm run start
   ```

## 🐳 Docker (Recomendado para Testes)

### PostgreSQL
```bash
docker run --name peladeiro-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=peladeiro \
  -p 5432:5432 \
  -d postgres:15
```

### MySQL
```bash
docker run --name peladeiro-mysql \
  -e MYSQL_ROOT_PASSWORD=root \
  -e MYSQL_DATABASE=peladeiro \
  -p 3306:3306 \
  -d mysql:8.0
```

### Oracle
```bash
docker run --name peladeiro-oracle \
  -e ORACLE_PWD=oracle \
  -p 1521:1521 \
  -d gvenzl/oracle-xe
```

## 📈 Performance Tuning

### Connection Pool
```bash
# Aumente para aplicações com muitas requisições
DB_POOL_MAX=20
DB_POOL_MIN=5
```

### Query Logging (apenas desenvolvimento)
```bash
DB_LOGGING=true npm run dev
```

## 🆘 Troubleshooting

### Erro: "connect ECONNREFUSED"
✓ Banco de dados não está rodando  
✓ Verificar host/port em .env  
✓ Iniciar serviço do banco

### Erro: "Module not found"
```bash
rm -rf node_modules
npm install
```

### Erro de driver específico

**Oracle Native:**
```bash
npm install oracledb --build-from-source
```

## ✅ Verificação Final

Execute para confirmar tudo está funcionando:

```bash
# 1. Teste de conexão
npx ts-node src/scripts/test-database.ts

# 2. Inicie o servidor
npm run dev

# 3. Teste um endpoint
curl http://localhost:3333/api/v1/users
```

## 📚 Próximos Passos

1. ✅ Banco configurado
2. ✅ Migrações prontas
3. Implementar seeders com dados iniciais
4. Criar scripts de backup
5. Configurar replicação/clustering (opcional)

## 🎉 Tudo Pronto!

Seu projeto agora suporta **3 bancos de dados diferentes** e pode ser facilmente alternado mudando apenas uma variável de ambiente!

**Dúvidas?** Veja [DATABASE_SETUP.md](DATABASE_SETUP.md) para documentação completa.

---
*Configuração realizada em: Março 2026*  
*Versão Sequelize: 6.37.7*  
*Dialects: PostgreSQL, MySQL, Oracle*
