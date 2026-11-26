# Docker: desenvolvimento e produção

## Desenvolvimento

1. Copie `.env.example` para `.env`.
2. Inicie MySQL, Redis e a API:

   ```powershell
   docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
   ```

   A API fica em `http://localhost:3333`. MySQL e Redis só publicam portas no loopback; RabbitMQ é opcional com `--profile messaging`.

## Preparar segredos de produção

1. Copie `.env.production.example` para `.env.production` e configure `FRONTEND_URL` ou `CORS_ORIGIN` com as origens autorizadas.
2. Crie ficheiros de segredo fora do Git. Os comandos abaixo geram valores hexadecimais aleatórios; a chave PII terá os 64 caracteres hexadecimais exigidos pela aplicação:

   ```powershell
   New-Item -ItemType Directory -Force .\secrets | Out-Null
   $names = @('mysql_root_password', 'db_password', 'db_migration_password', 'db_acl_password', 'jwt_secret', 'redis_password', 'payments_pii_encryption_key')
   foreach ($name in $names) {
     $bytes = [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
     [System.IO.File]::WriteAllText((Join-Path .\secrets $name), [Convert]::ToHexString($bytes))
   }
   ```

3. Provisione uma chave privada Ed25519 em PEM no caminho de `AUDIT_SIGNING_PRIVATE_KEY_FILE`. Defina `AUDIT_ALERT_RECIPIENTS_JSON` com os destinatários autorizados conforme o [guia de auditoria](audit-deployment.md). Aponte `AUDIT_ANCHOR_HOST_PATH` para um directório existente num armazenamento independente do MySQL, com escrita para o utilizador da API (UID 1000 na imagem). Garanta que os ficheiros de segredos são legíveis pelos utilizadores dos respectivos contêineres e protegidos no host. Mantenha-os fora do Git e das imagens.
4. Inicie a stack com o ficheiro de produção:

   ```powershell
   docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
   ```

O Compose de produção mantém MySQL e Redis apenas na rede interna, expõe a API em `127.0.0.1:3333` para um proxy TLS externo, monta segredos como ficheiros, executa os processos sem root, limita capacidades e usa filesystem de leitura apenas na API. O volume `/app/storage` mantém documentos locais; para produção multi-nó configure o storage S3 compatível.

O MySQL tem credenciais separadas: `DB_MIGRATION_USER` aplica DDL; `DB_ACL_USER` só pode conceder privilégios DML e é usado pelo serviço one-shot `grant-runtime`; `DB_USER` é a conta da API. A API recebe DML por tabela, sem DDL, `TRIGGER`, `GRANT` nem acesso de escrita às identidades de auditoria. O grantor recebe SELECT/INSERT/UPDATE/DELETE no schema e o seu segredo deve ficar restrito ao host de deploy. Não reutilize essas credenciais fora da stack.

O MySQL mantém o log binário e permite que a conta de migração instale triggers com `log_bin_trust_function_creators=ON`. O arranque da API verifica a presença dos triggers através da vista `audit_trigger_inventory`, que expõe os seus nomes sem conceder o privilégio `TRIGGER` à aplicação.

## Estado das migrações MySQL

O histórico completo foi aplicado numa base MySQL 8.4 vazia. Os triggers de captura, reserva de identidade e imutabilidade foram instalados e exercitados. `npm run db:migrate:production` é executado pelo serviço `migrations`; `grant-runtime` prepara os privilégios da API antes de iniciar `api`.

MySQL não oferece RLS equivalente. A aplicação filtra leituras pelo escopo da empresa e as migrações adicionam FKs compostas onde existem relações entre tenants; isso não impede por si só um SELECT sem filtro executado por uma query nova ou defeituosa. Os triggers garantem captura e integridade de escrita/auditoria; isolamento de leitura continua sendo responsabilidade dos repositórios e serviços da aplicação.

Para verificar o histórico e os triggers numa base descartável, execute `docker compose -f docker-compose.mysql-test.yml up -d --wait` e depois `docker compose -f docker-compose.mysql-test.yml --profile migrate-test run --build --rm migrations-test`. O serviço de teste usa tmpfs e não deve receber dados de produção.
