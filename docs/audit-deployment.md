# Audit — implementação e instalação

## Estado da entrega

O módulo tem domínio, casos de uso, portas, adaptadores de persistência, API, workers e migrações. Usa **Sequelize**, que é o ORM já adoptado nesta aplicação; as portas não dependem do ORM. A especificação de referência é o documento do módulo Audit, versão 1, fornecido para o PRONTOEQUIPAS.

**A homologação final está pendente.** Não foram aplicadas migrações numa base operacional. Os testes PostgreSQL, Redis, armazenamento independente, carga e recuperação de backups necessitam do ambiente de destino.

Nesta sessão, os nove testes de compatibilidade em `src/tests/integration/audit.test.ts` passaram. A última execução de `audit-engine.test.ts` teve nove cenários aprovados e uma asserção de código HTTP incorrecta; a asserção foi corrigida, assim como a expectativa do download de outro utilizador. Houve alterações posteriores que precisam de nova execução completa. A verificação final de TypeScript foi bloqueada pela revisão automática porque o processo tentou contactar `dc.services.visualstudio.com`, com conteúdo de transmissão desconhecido. Não foi contornado o bloqueio.

## Organização e dependências

| Camada                   | Responsabilidades                                                                                           |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `domain/`                | Registo imutável, invariantes de âmbito, investigação, segregação de aprovação, normalização e mascaramento |
| `application/ports/`     | Repositório, transacção opaca, assinatura, evidências, fonte de eventos, relógio e notificações             |
| `application/use-cases/` | Ingestão, consultas, integridade, investigações, evidências, exportações, retenção e monitorização          |
| `infrastructure/`        | Sequelize, triggers, Ed25519/SHA-256, ficheiros privados, BullMQ e composição                               |
| `presentation/`          | Autorização contextual, validação Zod, HTTP e correlação de pedidos                                         |
| `audit.module.ts`        | Contratos públicos e fábricas utilizadas pela composição da aplicação                                       |

O domínio não importa Express, Sequelize, Redis ou serviços externos. A aplicação depende das portas. Os adaptadores recebem e devolvem objectos de domínio, sem expor transacções Sequelize aos casos de uso.

## Garantias e limites deliberados

- Identidade idempotente por âmbito, fonte e identificador do evento. Reutilização com conteúdo normalizado diferente devolve conflito.
- Sequência e hash anterior por empresa ou plataforma. PostgreSQL usa bloqueio consultivo transaccional e actualização condicional do cabeçalho.
- Registo crítico e alteração de negócio podem usar a mesma `RecordStoreContext`: falhas propagam e revertem a transacção.
- Triggers inserem uma captura durável na própria transacção dos dados críticos. A captura contém uma projecção limitada e mascara valores financeiros antes de persistir.
- O consumidor marca individualmente as capturas confirmadas; não usa apenas um timestamp global. Assim, uma transacção antiga que termine depois de outra continua elegível para ingestão.
- Falhas normalizadas ficam em `RETRY` ou `DEAD`, com contador, atraso exponencial e reprocessamento. Dados inválidos não são armazenados em bruto.
- Segredos, tokens, credenciais, dados bancários e campos pessoais/financeiros conhecidos são mascarados. Conteúdo livre exige minimização por parte do produtor.
- Políticas versionadas podem elevar a severidade e exigir acesso sensível; não reduzem a severidade original de um evento crítico.
- Não existe API pública para inserir, editar ou eliminar registos. SQL bloqueia `UPDATE`, `DELETE` e, em PostgreSQL, `TRUNCATE`.
- Pacotes de evidências são JSON canónico com SHA-256 e assinatura Ed25519. Não são PDFs: este formato preserva dados e verificação automática.
- A cadeia sem checkpoints é identificada como `HASH_CHAIN_ONLY`. Os checkpoints assinados são lidos também de armazenamento independente, permitindo detectar rollback do cabeçalho ou adulteração de intervalos já selados.
- Uma cadeia de hashes, isoladamente, não prova autenticidade contra um administrador que consiga reescrever o intervalo ainda não selado. A frequência dos checkpoints define essa janela. O administrador da base não deve controlar a chave nem o armazenamento de âncoras.
- Retenção implementa **arquivamento conservador** em pacotes assinados, com originais preservados. Não executa expurgo físico nem reduz automaticamente a base activa. Bloqueios legais e investigações abertas impedem que os respectivos registos sejam seleccionados para uma execução de arquivo.
- Uma evidência aceita até 1000 identificadores, com selecção limitada a 16 MiB. Exportações indicam `hasMore` e `nextCursor`; a selecção não é apresentada como uma exportação ilimitada.
- O adaptador de ficheiros cria arquivos exclusivamente, com permissões restritas. Não equivale, por si só, a armazenamento WORM, ACL de produção ou homologação de um serviço cloud.

## Persistência e migrações

Aplicar, pelo procedimento normal de migrações da aplicação:

1. `20261116000010-create-audit-engine.js` — registos, cabeçalhos, capturas, catálogo de âmbitos, mapa de papéis, workflows, índices, triggers e RLS.
2. `20261116000011-seed-audit-permissions.js` — permissões granulares e modelo de notificação `AUDIT_ALERT`.
3. `20261117000000-create-audit-projections.js` - vistas relacionais de actores, recursos, alterações, contextos, integridade, preservação, investigações e exportações.

```sh
npm run db:migrate:production
```

O destino de produção é **PostgreSQL**. SQLite serve para desenvolvimento e testes. A migração recusa outros dialectos antes de criar tabelas. A configuração geral passou a aceitar PostgreSQL; a compatibilidade do histórico completo de migrações e de todos os módulos deve ser validada na homologação da aplicação.

`audit_records` usa partições mensais por `receivedAt` em PostgreSQL. A chave física é `(scopeKey,id,receivedAt)`. O registo imutável `audit_record_identities` garante unicidade global de ID e unicidade por âmbito de evento e sequência, incluindo entre meses. RLS é activada e forçada no pai, nas partições e nos workflows. Doze vistas relacionais expõem os objectos do payload e dos workflows sem duplicar os dados; usam `security_invoker` e exigem PostgreSQL 15 ou posterior. O perfil de testes usa PostgreSQL 16.

Executar `npm run audit:partitions` regularmente com `AUDIT_PARTITION_DATABASE_URL` e uma role de migração para preparar o mês actual e os dois seguintes. A partição default evita perder ingestão fora dos períodos preparados; monitorizar a sua ocupação. A movimentação de dados já presentes nessa partição exige um procedimento administrativo revisto. Se uma versão anterior desta migração já tiver sido aplicada, preparar uma migração incremental antes de actualizar; não apagar o histórico de migrações nem reaplicar a inicial sobre dados existentes.

O comando de produção usa `src/config/sequelize-production.cjs`, com credenciais apenas em variáveis de ambiente. O alvo Docker `migrations` inclui o CLI; a imagem final inclui apenas dependências de execução. A aplicação e as migrações suportam `DB_SSL` e `DB_SSL_REJECT_UNAUTHORIZED`.

Os workflows têm tabelas separadas para investigações, evidências, exportações, políticas, retenção, execuções, bloqueios legais, alertas, checkpoints, verificações, falhas, reconciliações, cursores e outbox. `audit_scope_catalog` contém apenas identificadores para descoberta interna pelos workers. `audit_role_scopes` preserva o âmbito de papéis eliminados. Nenhuma rota expõe estes dois catálogos.

As migrações não disponibilizam rollback destrutivo automático. Não eliminar história para voltar a uma versão anterior; preparar uma migração de arquivo específica e rever a recuperação.

### Cobertura de captura

A lista `captures` na migração é a fonte exacta de cobertura. Abrange identidade, vínculos e permissões, colaboradores, contratos, estrutura salarial, processamento salarial, pagamentos, regras legais, documentos, recibos de vencimento, subscrições, cobrança da plataforma, simulações, relatórios, onboarding e suporte, quando as respectivas tabelas existem.

O arranque de produção verifica os triggers essenciais de empresas, vínculos, papéis, permissões, contratos, salários, payroll, pagamentos e cobrança. Ao acrescentar uma tabela ou renomear uma tabela existente, criar uma nova migração de captura. Não presumir que uma tabela nova está coberta só porque pertence a um módulo já existente.

Os eventos sem actor HTTP identificado são atribuídos ao actor técnico `database-capture` e assinalados com `actorIdentified=false`. As operações emitidas pelos módulos conservam o actor semântico. Os eventos de identidade deixaram de depender de `console.info` e usam o mesmo ledger. Os registos antigos em `audit_logs` continuam consultáveis pela rota de compatibilidade, com mascaramento reforçado; não foram retroactivamente assinados nem convertidos em capturas transaccionais.

## Configuração

| Variável                          | Utilização                                                                                    |
| --------------------------------- | --------------------------------------------------------------------------------------------- |
| `DB_DIALECT=postgres`             | PostgreSQL em produção                                                                        |
| `AUDIT_WORKER_ENABLED=true`       | Activar processamento; obrigatório em produção                                                |
| `AUDIT_QUEUE_ENABLED=true`        | Usar as oito filas BullMQ; obrigatório em produção                                            |
| `AUDIT_POLL_INTERVAL_MS=10000`    | Descoberta de trabalho; mínimo 1000 ms                                                        |
| `AUDIT_SIGNING_PRIVATE_KEY`       | Chave privada PEM Ed25519, fornecida pelo gestor de segredos                                  |
| `AUDIT_SIGNING_KEY_ID`            | Identificador estável da chave actual                                                         |
| `AUDIT_TRUSTED_PUBLIC_KEYS`       | Objecto JSON com chaves públicas PEM indexadas por identificador                              |
| `AUDIT_EVIDENCE_ROOT`             | Directório privado de evidências; omissão `storage/private/audit`                             |
| `AUDIT_ANCHOR_ROOT`               | Montagem independente para checkpoints, fora da raiz de evidências                            |
| `AUDIT_ALERT_RECIPIENTS_JSON`     | Mapa de âmbito para IDs de destinatários, por exemplo `{"tenant:123":[456],"platform":[789]}` |
| `AUDIT_HTTP_CAPTURE_ENABLED=true` | Activar captura HTTP também nos testes; fora dos testes está activa                           |

Não colocar uma chave real no repositório. `AUDIT_SIGNING_PRIVATE_KEY` aceita PEM com quebras de linha reais ou `\n` escapado. Conservar as chaves públicas antigas após rotação, enquanto existir evidência assinada por elas. O adaptador actual assina localmente; uma integração KMS/HSM exige outro adaptador para a porta de criptografia.

O processo de execução não pode usar uma role PostgreSQL `SUPERUSER` ou `BYPASSRLS`. Usar uma role distinta da role de migrações, sem DDL ou permissão para desactivar triggers. Conceder apenas os acessos de leitura, inserção e workflows necessários. Não conceder acesso directo às partições. A protecção de ficheiros e de âncoras deve usar contas, ACL, montagem e backups independentes da conta que administra a base.

A role da aplicação também não pode ser proprietária do ledger nem inserir directamente em `audit_capture_events`. Os triggers usam funções `SECURITY DEFINER` da role de migrações. Conceder à aplicação `SELECT` sobre capturas e `UPDATE` **apenas da coluna `processedAt`**; não conceder escrita sobre payloads, datas ou identificadores da fonte. O arranque verifica a ausência de privilégio directo de inserção e de pertença à role proprietária do ledger. O ledger precisa de `SELECT,INSERT`; cabeçalhos, catálogo de âmbitos e workflows precisam dos acessos usados pelos repositórios, sem expurgo. Estas concessões devem ser feitas pelo administrador com os nomes reais das roles de implantação.

### Alertas

Os destinatários são configurados expressamente e as permissões são verificadas antes de cada envio. O adaptador usa Notifications com chave idempotente `audit-alert:<id>` e canal `IN_APP`. A mensagem inclui apenas referência, severidade e âmbito. Sem destinatários autorizados, o alerta continua aberto e o trabalho pode ser repetido. O conteúdo da evidência não segue na notificação.

## API e permissões

Base da empresa: `/api/v1/audit`, com JWT e contexto de empresa resolvido. Base da plataforma: `/api/v1/admin/audit`, com JWT e permissões de plataforma. O `companyId` do corpo ou dos filtros não altera o âmbito.

O portal individual usa `/api/v1/audit/personal/records` e `/api/v1/audit/personal/records/:id`, com a permissão de plataforma restrita `platform:audit:records:read-own`. Só devolve os eventos seguros da própria conta, sessão e acessos HTTP próprios; todas as rotas administrativas ficam recusadas nesse portal. Esta permissão não é atribuída automaticamente.

Todas as operações exigem uma finalidade em `X-Audit-Purpose`, `purpose` na query ou `purpose` no corpo. Leituras e alterações administrativas geram os seus próprios eventos de auditoria.

| Rotas                                                                                                                                                       | Finalidade                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `GET /records`, `/records/:id`                                                                                                                              | Pesquisa e consulta individual                         |
| `GET /resources/:type/:resourceId/history`                                                                                                                  | Histórico de recurso                                   |
| `GET /actors/:actorId/activity`, `/correlations/:correlationId`                                                                                             | Actividade e correlação                                |
| `GET /dashboard`, `/reports`, `/reports/security`, `/reports/payroll`, `/reports/financial`, `/reports/access`, `/reports/permissions`, `/reports/activity` | Indicadores e relatórios                               |
| `POST /reports/:categoria/exports`                                                                                                                          | Pedido de exportação de relatório, sujeito a aprovação |
| `GET/POST /investigations`, `GET /investigations/:id`                                                                                                       | Investigações                                          |
| `POST /investigations/:id/evidence`, `/investigations/:id/close`                                                                                            | Associar registos e encerrar                           |
| `POST /evidence-packages`, `GET /evidence-packages/:id`                                                                                                     | Criar e consultar pacote                               |
| `POST /evidence-packages/:id/verify`, `GET /evidence-packages/:id/download`                                                                                 | Verificar e descarregar                                |
| `GET/POST /exports`, `GET /exports/:id`                                                                                                                     | Pedidos de exportação                                  |
| `POST /exports/:id/approve`, `/exports/:id/reject`, `GET /exports/:id/download`                                                                             | Decisão independente e download pelo requerente        |
| `GET/POST /admin/policies`                                                                                                                                  | Políticas versionadas                                  |
| `GET /admin/integrity`, `POST /admin/integrity/verify`, `/admin/integrity/checkpoints`                                                                      | Integridade                                            |
| `GET /admin/ingestion-failures`, `POST /admin/ingestion-failures/:id/retry`                                                                                 | Recuperação de ingestão                                |
| `GET/POST /admin/reconciliation`, `GET /admin/metrics`                                                                                                      | Reconciliação e atraso/pendências                      |
| `GET/POST /admin/retention`, `GET /admin/retention/executions`, `POST /admin/retention/:id/execute`                                                         | Arquivo segundo política explícita                     |
| `GET/POST /admin/legal-holds`, `POST /admin/legal-holds/:id/release`                                                                                        | Preservação legal                                      |
| `GET /admin/alerts`, `GET/POST /admin/alert-rules`, `POST /admin/alerts/:id/acknowledge`                                                                    | Alertas                                                |

Filtros de registos: tipo de evento, categoria, severidade, resultado, actor, recurso, correlação e intervalo de datas. A paginação devolve `nextCursor` e `throughSequence`: reutilizar ambos na página seguinte para conservar o mesmo limite de snapshot. Limite máximo de 1000 registos por página. Listas administrativas usam `offset` e `limit`, até 200.

As permissões exactas estão em `20261116000011-seed-audit-permissions.js`. Não são atribuídas automaticamente ao papel ADMIN. `audit:records:read-sensitive` é independente de leitura de empresa, exportação e aprovação. `read-own` só permite histórico seguro da própria conta/sessão; não dá acesso a todos os colaboradores afectados por operações do utilizador.

Para a plataforma, usar `audit:records:read-platform` e os códigos `platform:audit:...` para as restantes operações. A leitura global não concede acesso aos registos salariais de empresas. Os relatórios exportados exigem tanto a permissão de exportar relatórios como a de criar pedidos de exportação. O worker volta a verificar os direitos do requerente e do aprovador antes de produzir o ficheiro.

### Exemplo de retenção

```json
{
  "category": "SECURITY",
  "days": 180,
  "legalReference": "Política interna aprovada, referência e versão",
  "reason": "Arquivo autorizado pela organização",
  "automatic": false,
  "purpose": "Configuração da política aprovada"
}
```

O valor é apenas um exemplo de configuração, não um prazo legal recomendado. `automatic=true` autoriza agendamento diário do arquivo dessa política. Sem política explícita não há execução automática. Não existe expurgo físico nesta implementação.

## Workers e recuperação

Filas: `audit.ingestion`, `audit.integrity`, `audit.retention`, `audit.archive`, `audit.exports`, `audit.reconciliation`, `audit.alerts`, `audit.evidence`.

Cada worker processa um trabalho de cada vez por processo; o isolamento e os bloqueios na base preservam a sequência entre processos. BullMQ usa oito tentativas com atraso exponencial; trabalhos falhados são conservados até ao limite de 1000 por fila. Exportações e arquivo usam leases e tokens de posse. Registos de ingestão mantêm a sua própria fila durável de repetição/dead letters na base.

Redis é inicializado antes de Audit. A paragem aguarda os trabalhos activos. Fora de produção pode usar-se polling directo; em produção a falta de Redis/BullMQ ou das protecções essenciais impede o arranque.

A outbox SQL publica eventos de domínio em Redis Streams, com lease, repetição exponencial, estado `PUBLISHED` e dead letters após oito falhas. O adaptador é activo em produção; em desenvolvimento activar `AUDIT_EVENTS_ENABLED=true`. `AUDIT_EVENT_PREFIX` define o prefixo do stream, por omissão `prontoequipas:{audit-events}:stream`. A publicação e a deduplicação são atómicas em Redis; consumidores devem também deduplicar pelo ID. Não existe remoção automática do stream ou das chaves de deduplicação: definir retenção operacional após confirmar consumo e possibilidade de replay. A outbox SQL continua a ser a fonte autoritativa. Consultar `/admin/outbox` e repetir por `/admin/outbox/:id/retry`, com permissão e finalidade.

A entrega de alertas tem marcador `notifiedAt` e chave idempotente. Capturas de Notifications registam apenas metadados de mensagens e entregas, excluindo conteúdo e os próprios alertas Audit para evitar ciclos. Reconciliação visita a fonte em páginas e continua a partir do cursor persistido. Checkpoints são agendados de hora a hora, reconciliação completa diariamente e verificação de evidências periodicamente. Uma verificação de integridade com falha impede o worker de selar a cadeia como válida.

## Validação e homologação

O ensaio independente `npm run test:audit:sql` passou em SQLite isolado: captura durável, rollback, mascaramento, vistas relacionais, idempotência e bloqueios de alteração. O ficheiro `docker-compose.audit-test.yml` prepara PostgreSQL e Redis descartáveis em portas locais 55442 e 56389. Estes testes não demonstram ainda isolamento PostgreSQL, publicação Redis, recuperação de backups ou desempenho em produção. A compilação e os testes TypeScript finais continuam pendentes devido ao bloqueio automático indicado no estado da entrega.

Comandos preparados para executar após resolver o bloqueio da validação:

```sh
npm run type-check
npm exec eslint -- src/modules/audit --ext .ts
npm run architecture:check
npm test -- --runInBand src/tests/integration/audit.test.ts src/tests/integration/audit-engine.test.ts src/tests/integration/audit-postgres.test.ts
npm test -- --runInBand
```

O teste PostgreSQL é opt-in com `AUDIT_TEST_POSTGRES_URL`. Requer uma base **vazia e descartável**, cujo nome termine em `_audit_test`, e uma conta de testes com privilégios de DDL e criação de roles. Recusa bases com tabelas preexistentes. Testa RLS no pai e nas partições, imutabilidade SQL, captura e rollback. Não fornecer a conta da aplicação ou uma base operacional.

O script `scripts/audit-load.cjs` prepara carga HTTP de leitura contra localhost. Exige `AUDIT_LOAD_CONFIRMED=YES`, token, empresa, número de pedidos e concorrência. Regista p50/p95/p99, throughput, estados e falhas, sem imprimir o token. Executar numa cópia isolada, com capturas e dados de volume representativos; a própria consulta gera auditoria. O ensaio não substitui uma prova de ingestão PostgreSQL concorrente ou homologação Redis com reinício de workers.

`/admin/metrics` inclui contagem e bytes dos payloads da empresa, ficheiros e bytes de evidências/âncoras, atraso de ingestão e pendências. Os bytes dos payloads não incluem todo o custo físico de índices, cabeçalhos, TOAST e partições; o administrador deve também monitorizar o volume total de PostgreSQL e o espaço livre dos volumes privados.

Antes de produção: validar a cadeia de migrações em PostgreSQL, executar os testes finais, medir carga de ingestão e consultas, parar/reiniciar workers durante trabalho, testar permissões reais, rotação de chaves, indisponibilidade do armazenamento e recuperação de backups.

### Recuperação de backups

1. Criar backup consistente da base e do armazenamento privado; manter as âncoras e as chaves públicas numa cópia independente.
2. Restaurar numa base isolada sem tráfego de negócio nem workers de escrita.
3. Disponibilizar as âncoras externas preservadas. Não gerar novos checkpoints para esconder divergências.
4. Executar a verificação de integridade e dos pacotes; comparar sequência, hash final e checkpoints posteriores ao ponto restaurado.
5. Reconciliar a fonte durável, rever dead letters e só reactivar processamento após resolução das diferenças.

Uma restauração de snapshot antigo é detectável quando as âncoras independentes preservam um checkpoint posterior. Se a base e as âncoras forem ambas recuadas, essa prova perde-se; separar as respectivas permissões e retenção é uma condição operacional essencial.

## Rastreabilidade funcional

| Requisitos       | Implementação                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| RF-AUD-001 a 010 | `AuditRecord`, normalização, contexto HTTP, actor/recurso/tenant/correlação e cabeçalho por âmbito                 |
| RF-AUD-011 a 020 | Capturas transaccionais, projecções antes/depois, lista de alterações e mascaramento                               |
| RF-AUD-021 a 030 | Adaptador de identidade, produtores dos módulos, triggers de negócio, captura de recusas/acessos e replay durável  |
| RF-AUD-031 a 040 | Capturas de salários, simulações, payroll, aprovações, pagamentos, recibos, regras legais e cobrança               |
| RF-AUD-041 a 050 | Pesquisa por módulo/operação, histórico, actividade, correlação, snapshots, permissões contextuais e investigações |
| RF-AUD-051 a 060 | Cadeia SHA-256, sequências, checkpoints Ed25519 externos e relatórios de integridade                               |
| RF-AUD-061 a 070 | Políticas versionadas, arquivo, legal holds, métricas de armazenamento, dead letters e reconciliação               |
| RF-AUD-071 a 080 | Relatórios por categoria, regras de alertas, Notifications, pedidos de exportação e indicadores                    |

Esta matriz identifica código e contratos; não substitui os resultados de homologação dos requisitos não funcionais. A captura das integrações reais, a configuração de acesso e a operação de armazenamento devem ser comprovadas no ambiente de implantação.
