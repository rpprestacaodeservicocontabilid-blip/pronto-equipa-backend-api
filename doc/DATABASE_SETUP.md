# Guia: Configurando Múltiplos Bancos de Dados com Sequelize

Este projeto está configurado para suportar **PostgreSQL**, **MySQL** e **Oracle** usando Sequelize ORM.

## 📋 Status Atual

- ✅ Sequelize configurado dinamicamente
- ✅ Drivers para PostgreSQL (pg), MySQL (mysql2) e Oracle (oracledb)
- ✅ Migrações TypeScript compatíveis com todos os dialects
- ✅ Arquivo de configuração centralizado (.sequelizerc)
- ✅ Variáveis de ambiente bem documentadas (.env.example)

## 🚀 Configuração por Banco de Dados

### PostgreSQL (Padrão)

**Opção 1: Com DATABASE_URL (recomendado para produção)**

```bash
# .env
DB_DIALECT=postgres
DATABASE_URL=postgresql://usuario:senha@localhost:5432/peladeiro
```

**Opção 2: Configuração individual**

```bash
# .env
DB_DIALECT=postgres
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=sua_senha
DB_NAME=peladeiro
```

**Instalação do PostgreSQL (macOS com Homebrew)**

```bash
brew install postgresql
brew services start postgresql
createdb peladeiro
```

### MySQL

**Configuração**

```bash
# .env
DB_DIALECT=mysql
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=sua_senha
DB_NAME=peladeiro
```

**Instalação do MySQL (macOS com Homebrew)**

```bash
brew install mysql
brew services start mysql
mysql_secure_installation
mysql -u root -p -e "CREATE DATABASE peladeiro;"
```

**Ou usando Docker**

```bash
docker run --name peladeiro-mysql \
  -e MYSQL_ROOT_PASSWORD=root \
  -e MYSQL_DATABASE=peladeiro \
  -p 3306:3306 \
  -d mysql:8.0
```

### Oracle

**Configuração**

```bash
# .env
DB_DIALECT=oracle
DB_HOST=localhost
DB_PORT=1521
DB_USER=system
DB_PASSWORD=sua_senha
DB_NAME=XE
```

**Instalação do Oracle (Docker recomendado)**

```bash
# Usar imagem Oracle XE do Docker Hub
docker run --name peladeiro-oracle \
  -e ORACLE_PWD=oracle \
  -p 1521:1521 \
  -p 5500:5500 \
  -d gvenzl/oracle-xe

# Aguardar ~1 minuto para inicializar
# Conectar com: system/oracle
```

**Requisitos Nativos (Linux/macOS)**

Para usar Oracle natively sem Docker, é necessário instalar o Oracle Instant Client:

- Download: https://www.oracle.com/database/technologies/instant-client/
- Instruções: Follow Oracle's setup guide for your OS

## 🔧 Instalação de Dependências

Todos os drivers já estão no `package.json`:

```bash
npm install
# ou
yarn install
```

## 📦 Pool de Conexões

Configurável via variáveis de ambiente:

```bash
# Padrões
DB_POOL_MAX=5          # Máximo de conexões
DB_POOL_MIN=0          # Mínimo de conexões
DB_POOL_ACQUIRE=30000  # Timeout para adquirir (ms)
DB_POOL_IDLE=10000     # Timeout de inatividade (ms)
```

## 🗄️ Executar Migrações

As migrações são compatíveis com todos os dialects.

```bash
# Executar migrações pendentes
npm run sequelize db:migrate

# Desfazer última migração
npm run sequelize db:migrate:undo

# Desfazer todas as migrações
npm run sequelize db:migrate:undo:all

# Ver status das migrações
npm run sequelize db:migrate:status
```

## 🌱 Seeders (Dados Iniciais)

Criar seeder:

```bash
npm run sequelize seed:generate --name demo-users
```

Executar seeders:

```bash
npm run sequelize db:seed:all
```

## 🔍 Verificar Conexão

O servidor fará log da conexão ao iniciar:

```bash
npm run dev

# Output esperado:
# 📦 Connecting to MYSQL database at localhost
# ✅ Connected to MYSQL database successfully
```

## 📊 Características por Banco

| Feature | PostgreSQL | MySQL | Oracle |
|---------|------------|-------|--------|
| JSON Support | ✅ Nativo | ✅ Nativo | ✅ Com XMLType |
| Full-text Search | ✅ | ✅ | ✅ |
| Transactions | ✅ | ✅ | ✅ |
| Sequences | ✅ | ❌ (usar auto_increment) | ✅ |
| UUID | ✅ Nativo | ❌ (string) | ❌ (string) |
| Character Set | ✅ UTF-8 | ✅ UTF-8MB4 | ✅ AL32UTF8 |

## 🚨 Troubleshooting

### Erro: "connect ECONNREFUSED"

```
Solução: Verificar se o banco de dados está rodando
- PostgreSQL: brew services start postgresql
- MySQL: brew services start mysql  
- Oracle: docker start peladeiro-oracle
```

### Erro: "ER_NOT_SUPPORTED_AUTH_PLUGIN"

```bash
# MySQL: Update plugin de autenticação
mysql -u root -p -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'password';"
FLUSH PRIVILEGES;
```

### Erro: "ORA-12514: TNS:listener does not currently know of service requested"

```
Solução (Oracle): Verificar SID ou usar nome de serviço correto
DB_NAME=orcl (ao invés de XE)
```

### Erro: "Module not found: oracledb"

```bash
# Oracle requer compilação nativa
npm install oracledb --build-from-source
```

## 🔐 Segurança

### Variáveis de Ambiente

⚠️ **NUNCA** commit `.env` no git

```bash
# Adicionar ao .gitignore
echo ".env" >> .gitignore
echo ".env.local" >> .gitignore
```

Use variáveis de ambiente em produção:

```bash
# Exportar diretamente
export DB_DIALECT=mysql
export DB_HOST=prod-db.example.com
npm run start
```

Ou em arquivo `.env.production`:

```bash
NODE_ENV=production
DB_DIALECT=mysql
DB_HOST=prod-db.example.com
DB_USER=peladeiro_app
DB_PASSWORD=strong_password_here
```

## 📈 Performance

### Connection Pooling

O project utiliza pool de conexões para otimizar:

```typescript
// Em src/config/database.ts
pool: {
  max: 5,      // Máx 5 conexões simultâneas
  min: 0,      // Mínimo 0 (dinâmico)
  acquire: 30000,  // Timeout 30s
  idle: 10000  // Fechar após 10s inativo
}
```

### Índices Importantesantes

Recomendado criar índices em:

```sql
-- PostgreSQL
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_city_id ON users(city_id);
CREATE INDEX idx_matches_scheduled_at ON matches(scheduled_at);

-- MySQL (Same syntax)
-- Oracle (Same syntax)
```

## 🧪 Testing

```bash
# Usar banco de dados de testes
DB_NAME=peladeiro_test npm run test
```

## 📚 Referências

- [Sequelize Docs](https://sequelize.org/)
- [PostgreSQL Docs](https://www.postgresql.org/docs/)
- [MySQL Docs](https://dev.mysql.com/doc/)
- [Oracle Docs](https://docs.oracle.com/en/database/)

## ✅ Checklist de Configuração

- [ ] Instalar banco de dados escolhido
- [ ] Configurar variáveis em `.env`
- [ ] Executar `npm install`
- [ ] Executar migrações: `npm run sequelize db:migrate`
- [ ] Executar seeders (opcional): `npm run sequelize db:seed:all`
- [ ] Iniciar servidor: `npm run dev`
- [ ] Verificar logs de conexão
- [ ] Testar endpoints da API

## 🤝 Suporte

Para problemas específicos de banco de dados:

1. Verificar logs: `NODE_ENV=development npm run dev`
2. Ativar SQL logging: `DB_LOGGING=true npm run dev`
3. Testar conexão diretamente com o banco
4. Verificar firewall e permissões

---

**Última atualização:** Março 2026  
**Versão Sequelize:** 6.37.7
