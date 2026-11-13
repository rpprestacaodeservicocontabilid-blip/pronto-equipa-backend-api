# Catálogo de rotas HTTP

## Visão geral

- Prefixo da API: `/api/v1`
- Health check: `GET /health`
- Parâmetros no caminho usam a sintaxe Express (`:id`, `:userId` etc.).
- Cada entrada abaixo foi extraída de um `Router` em `src/modules`.

> **Status de integração:** `src/main/routes.ts` é a composição que a aplicação usa. Somente os routers listados em “Registradas na composição atual” recebem um prefixo nesse arquivo. Os demais endpoints existem no código, mas são **relativos ao seu router** até que sejam adicionados com `router.use(...)`. Além disso, alguns imports desse arquivo apontam para diretórios que não existem nesta cópia (por exemplo, `modules/users` e `modules/tournaments`); por isso, “registrada” descreve a intenção da composição, não uma garantia de que o build atual a exponha.

## Registradas na composição atual

### Loans

Prefixo: `/api/v1/loans` (autenticação + contexto empresarial + RBAC `loans.*`).  
Arquivo: `src/modules/loans/presentation/routes/loans.routes.ts`

| Método | Caminho | Operação |
| --- | --- | --- |
| GET / POST | `/applications` | Consultar ou criar pedidos |
| PATCH | `/applications/:id` | Atualizar pedido em rascunho |
| POST | `/applications/:id/submit` | Submeter pedido |
| POST | `/applications/:id/decision` | Aprovar ou rejeitar pedido |
| GET | `/` e `/:id` | Consultar empréstimos |
| POST / GET | `/:id/disbursements` | Solicitar ou consultar desembolsos |
| POST / GET | `/:id/repayments` | Registar ou consultar amortizações |
| POST | `/:id/repayments/:repaymentId/reverse` | Reverter pagamento confirmado |
| POST | `/:id/deductions` | Pedir desconto salarial |
| POST | `/deductions/:deductionId/confirm` | Confirmar desconto executado |
| POST | `/:id/renegotiations` | Solicitar renegociação |
| GET / POST | `/policies` | Consultar ou configurar políticas |
| GET | `/reports/*` | Consultar resumos e relatórios |

As restantes rotas do módulo incluem simulação, consulta de planos e prestações, confirmação de desembolso, decisão de renegociação, suspensão/retoma e liquidação. Ver [documentação do módulo de empréstimos](./LOANS.md).

### Salary Structure

Prefixo: `/api/v1/salary-structure` (autenticação + contexto empresarial + RBAC `salary-structure:*`).  
Arquivo: `src/modules/salary-structure/presentation/routes/salary-structure.routes.ts`

| Método | Caminho | Operação |
| --- | --- | --- |
| GET / POST | `/components` | Listar ou criar componentes remuneratórios |
| GET / PATCH | `/components/:id` | Consultar ou editar um componente |
| POST | `/components/:id/versions` | Criar uma versão de componente |
| POST | `/components/:id/versions/:versionId/publish` | Publicar uma versão |
| GET / POST | `/tables` | Listar ou criar tabelas salariais |
| GET | `/tables/:id` | Consultar versões, grades e escalões |
| POST | `/tables/:id/versions`, `/tables/:id/versions/:versionId/publish` | Criar ou publicar versão |
| POST | `/tables/:id/grades`, `/grades/:gradeId/steps` | Criar grade ou escalão |
| GET / POST | `/structures` | Listar ou criar estruturas remuneratórias |
| POST | `/structures/:id/submit`, `/decision`, `/publish`, `/versions` | Aprovar e versionar estruturas |
| GET / POST | `/assignments` | Consultar ou atribuir remuneração a trabalhadores |
| GET | `/employees/:employeeId/current`, `/history`, `/snapshot` | Consultar remuneração actual, histórico ou snapshot |
| GET / POST | `/revisions` | Consultar ou propor revisões individuais |
| POST | `/revisions/:id/submit`, `/decision`, `/apply` | Submeter, decidir ou aplicar revisões |
| GET / POST | `/revision-batches` | Consultar ou criar lotes de revisão |
| POST | `/revision-batches/:id/validate`, `/approve`, `/apply` | Validar, aprovar ou aplicar lote |
| GET / POST | `/policies` | Consultar ou versionar políticas salariais |
| POST | `/simulations` | Simular componentes sem persistir atribuição |
| GET / POST | `/reports/:report`, `/exports` | Consultar relatórios ou pedir exportação |

Ver [documentação da estrutura salarial](./SALARY-STRUCTURE.md) para permissões e regras de negócio.

### Auth

Prefixo: `/api/v1/auth`  
Arquivo: `src/modules/auth/infrastructure/http/routes/auth.routes.ts`

| Método | Caminho | Operação |
| --- | --- | --- |
| POST | `/register` | Registar conta |
| POST | `/login` | Autenticar utilizador |
| POST | `/refresh` | Renovar token |
| POST | `/logout` | Terminar sessão |
| POST | `/verify-email` | Confirmar e-mail |
| POST | `/resend-verification` | Reenviar confirmação de e-mail |
| POST | `/forgot-password` | Iniciar recuperação de senha |
| POST | `/reset-password` | Redefinir senha |
| POST | `/change-password` | Alterar senha |

O router aplica middleware de segurança; login, registo e recuperação possuem rate limit. Logout, reenvio e alteração de senha requerem autenticação.

### Users

Prefixo: `/api/v1/users`  
Arquivo: `src/modules/user/infrastructure/http/routes/user.routes.ts`

| Método | Caminho | Operação |
| --- | --- | --- |
| POST | `/` | Criar utilizador |
| GET | `/` | Consultar utilizador por e-mail (query string) |
| GET | `/recent` | Listar utilizadores recentes; aceita filtro por tipo |
| GET | `/:id` | Obter utilizador por ID |
| PATCH | `/:id` | Atualizar utilizador |
| DELETE | `/:id` | Remover utilizador |
| PATCH | `/:id/activate` | Ativar utilizador |
| PATCH | `/:id/deactivate` | Desativar utilizador |

### Teams

Prefixo: `/api/v1/teams`  
Arquivo: `src/modules/teams/infrastructure/routes/team.routes.ts`

| Método | Caminho | Operação |
| --- | --- | --- |
| POST | `/` | Criar equipa |
| GET | `/` | Listar equipas |
| GET | `/:id` | Obter equipa |
| GET | `/city/:cityId` | Listar equipas da cidade |
| PUT | `/:id` | Atualizar equipa |
| DELETE | `/:id` | Remover equipa |

### Fields

Prefixo: `/api/v1/fields`  
Arquivo: `src/modules/fields/infrastructure/routes/fields.routes.ts`

| Método | Caminho | Operação |
| --- | --- | --- |
| POST | `/` | Criar campo |
| GET | `/` | Listar campos |
| GET | `/:id` | Obter campo |
| PUT | `/:id` | Atualizar campo |
| DELETE | `/:id` | Remover campo |

### Cities

Prefixo: `/api/v1/cities`  
Arquivo: `src/modules/cities/infrastructure/routes/city.routes.ts`

| Método | Caminho | Operação |
| --- | --- | --- |
| POST | `/` | Criar cidade |
| GET | `/` | Listar cidades |
| GET | `/search` | Pesquisar cidades |
| GET | `/country/:country` | Listar por país |
| GET | `/state/:state` | Listar por estado/província |
| GET | `/:id` | Obter cidade |
| PUT | `/:id` | Atualizar cidade |
| DELETE | `/:id` | Remover cidade |

### Bookings

Prefixo: `/api/v1/bookings`  
Arquivo: `src/modules/bookings/infrastructure/routes/bookings.routes.ts`

| Método | Caminho | Operação |
| --- | --- | --- |
| POST | `/` | Criar reserva |
| GET | `/` | Listar reservas |
| GET | `/:id` | Obter reserva |
| GET | `/user/:userId` | Reservas do utilizador |
| GET | `/field/:fieldId` | Reservas do campo |
| PATCH | `/:id/confirm` | Confirmar reserva |
| PATCH | `/:id/cancel` | Cancelar reserva |
| PATCH | `/:id/complete` | Concluir reserva |

### Matches

Prefixo: `/api/v1/matches`  
Arquivo: `src/modules/matches/infrastructure/routes/matches.routes.ts`

| Método | Caminho | Operação |
| --- | --- | --- |
| POST | `/` | Criar partida |
| POST | `/schedule` | Agendar partida |
| GET | `/` | Listar partidas |
| GET | `/live` | Listar partidas ao vivo |
| GET | `/upcoming` | Listar próximas partidas |
| GET | `/statistics` | Obter estatísticas de partidas |
| GET | `/:id` | Obter partida |
| GET | `/team/:teamId` | Partidas da equipa |
| GET | `/field/:fieldId` | Partidas do campo |
| GET | `/city/:cityId` | Partidas da cidade |
| GET | `/tournament/:tournamentId` | Partidas do torneio |
| PATCH | `/:id/start` | Iniciar partida |
| PATCH | `/:id/finish` | Finalizar partida |
| PATCH | `/:id/cancel` | Cancelar partida |
| PATCH | `/:id/reschedule` | Reagendar partida |
| PATCH | `/:id/score` | Atualizar placar |
| PATCH | `/operations/:matchId/validate-result` | Validar resultado final (ADMIN) |
| GET | `/operations/disputes` | Listar contestações de resultados (ADMIN) |
| POST | `/:matchId/disputes` | Contestar resultado como responsável de equipa |
| PATCH | `/operations/disputes/:id` | Decidir contestação (ADMIN) |

#### Regras de resultados e disputas

- Apenas o responsável de uma das equipas participantes pode abrir uma disputa.
- Uma disputa de resultado só pode ser aberta para uma partida finalizada e enquanto não existir outra disputa de resultado aberta.
- O motivo é obrigatório (10–2000 caracteres); a URL da prova é opcional. Não existe prazo limite configurado para a submissão.
- Um administrador deve justificar a decisão (10–2000 caracteres). Para resultados, pode manter ou corrigir o placar; para denúncias de conduta, pode confirmar ou arquivar.
- Ao decidir uma disputa de resultado, o placar final fica validado; uma correção exige valores inteiros não negativos para ambas as equipas.

### Rankings

Prefixo: `/api/v1/rankings`  
Arquivo: `src/modules/rankings/infrastructure/routes/rankings.routes.ts`

| Método | Caminho | Operação |
| --- | --- | --- |
| GET | `/tournament/:tournamentId` | Tabela do torneio |
| GET | `/tournament/:tournamentId/team/:teamId` | Posição da equipa no torneio |

### Payments (legado)

Prefixo: `/api/v1/payments`  
Arquivo: `src/modules/payments/infrastructure/routes/payments.routes.ts`

| Método | Caminho | Operação |
| --- | --- | --- |
| POST | `/` | Criar pagamento |
| GET | `/` | Listar pagamentos |
| GET | `/:id` | Obter pagamento |
| POST | `/:id/refund` | Reembolsar pagamento |
| POST | `/webhook/:provider` | Receber webhook do provedor |

### Players

Prefixo: `/api/v1/players`  
Arquivo: `src/modules/player/infrastructure/http/routes/player.routes.ts`

| Método | Caminho | Operação |
| --- | --- | --- |
| POST | `/` | Criar jogador |
| GET | `/` | Listar jogadores |
| GET | `/captains` | Listar capitães |
| GET | `/search` | Pesquisar jogadores |
| GET | `/city/:cityId` | Jogadores da cidade |
| GET | `/team/:teamId` | Jogadores da equipa |
| GET | `/:id` | Obter jogador |
| PUT | `/:id` | Atualizar jogador |
| DELETE | `/:id` | Remover jogador |
| POST | `/:id/promote-captain` | Promover a capitão |
| POST | `/:id/remove-captain` | Remover capitania |

### Player injuries

Prefixo: `/api/v1/player-injuries`  
Arquivo: `src/modules/player-injury/infrastructure/http/routes/player-injury.routes.ts`

| Método | Caminho | Operação |
| --- | --- | --- |
| POST | `/` | Registar lesão |
| GET | `/` | Listar lesões |
| GET | `/player/:playerId/active` | Lesões ativas do jogador |
| GET | `/player/:playerId/recovered` | Lesões recuperadas do jogador |
| GET | `/player/:playerId/high-severity` | Lesões graves do jogador |
| GET | `/player/:playerId/history` | Histórico de lesões |
| GET | `/:id` | Obter lesão |
| PUT | `/:id/recover` | Marcar lesão como recuperada |
| DELETE | `/:id` | Remover lesão |

### Player ratings

Prefixo: `/api/v1/player-ratings`  
Arquivo: `src/modules/player-rating/infrastructure/http/routes/player-rating.routes.ts`

| Método | Caminho | Operação |
| --- | --- | --- |
| POST | `/` | Criar avaliação |
| GET | `/` | Listar avaliações |
| GET | `/player/:playerId/average` | Média geral do jogador |
| GET | `/player/:playerId/average/:attribute` | Média por atributo |
| GET | `/player/:playerId/latest` | Avaliações recentes |
| GET | `/player/:playerId/verified` | Avaliações verificadas |
| GET | `/rater/:raterId` | Avaliações feitas pelo avaliador |
| GET | `/:id` | Obter avaliação |
| PUT | `/:id/verify` | Verificar avaliação |
| DELETE | `/:id` | Remover avaliação |

### Player statistics

Prefixo: `/api/v1/player-statistics`  
Arquivo: `src/modules/player-statistics/infrastructure/http/routes/player-statistics.routes.ts`

| Método | Caminho | Operação |
| --- | --- | --- |
| POST | `/` | Criar estatística |
| GET | `/` | Listar estatísticas |
| GET | `/match/:matchId` | Estatísticas da partida |
| GET | `/player/:playerId/recent` | Estatísticas recentes do jogador |
| GET | `/player/:playerId/metric/:metric` | Estatísticas por métrica |
| GET | `/player/:playerId/totals` | Totais do jogador |
| GET | `/player/:playerId/season/:year/averages` | Médias da época |
| GET | `/:id` | Obter estatística |
| PUT | `/:id/verify` | Verificar estatística |
| DELETE | `/:id` | Remover estatística |

### Player suspensions

Prefixo: `/api/v1/player-suspensions`  
Arquivo: `src/modules/player-suspension/infrastructure/http/routes/player-suspension.routes.ts`

| Método | Caminho | Operação |
| --- | --- | --- |
| POST | `/` | Criar suspensão |
| GET | `/` | Listar suspensões |
| GET | `/player/:playerId/active` | Suspensões ativas |
| GET | `/player/:playerId/expired` | Suspensões expiradas |
| GET | `/player/:playerId/history` | Histórico de suspensões |
| GET | `/player/:playerId/check-active` | Verificar suspensão ativa |
| GET | `/:id` | Obter suspensão |
| PUT | `/:id/lift` | Levantar suspensão |
| PUT | `/:id/serve` | Cumprir suspensão |
| DELETE | `/:id` | Remover suspensão |

## Declaradas nos módulos, aguardando montagem

Os caminhos desta secção são **relativos**. Defina um prefixo no `router.use` antes de os tratar como URLs públicas.

### Auth: OAuth, sessões e autorização

| Router / arquivo | Método | Caminho | Operação |
| --- | --- | --- | --- |
| OAuth | POST | `/google` | Login com Google |
| OAuth | POST | `/google/link` | Vincular Google à conta |
| OAuth | DELETE | `/google/unlink` | Desvincular Google |
| Sessões | GET | `/` | Listar sessões |
| Sessões | DELETE | `/:sessionId` | Revogar sessão |
| Sessões | DELETE | `/all` | Revogar todas as sessões |
| Autorização | POST | `/roles` | Atribuir papel |
| Autorização | DELETE | `/roles` | Remover papel |
| Autorização | POST | `/permissions` | Atribuir permissão |
| Autorização | DELETE | `/permissions` | Remover permissão |
| Autorização | GET | `/users/:userId/permissions/:permission` | Verificar permissão |

Arquivos: `oauth.routes.ts`, `session.routes.ts`, `authorization.routes.ts`. Sessões e autorização usam middleware de autenticação; as operações Google de vínculo também.

### User: perfil, papéis e permissões

| Router | Método | Caminho | Operação |
| --- | --- | --- | --- |
| Perfil | GET | `/:userId` | Obter perfil |
| Perfil | PATCH | `/:userId` | Atualizar perfil |
| Papéis | GET | `/users/:userId` | Listar papéis do utilizador |
| Papéis | POST | `/users/:userId` | Atribuir papel |
| Papéis | DELETE | `/users/:userId` | Remover papel |
| Permissões | POST | `/users/:userId` | Atribuir permissão |
| Permissões | DELETE | `/users/:userId` | Remover permissão |
| Permissões | GET | `/users/:userId/:permissionId/check` | Verificar permissão |

Arquivos: `profile.routes.ts`, `role.routes.ts`, `permission.routes.ts`.

### Fields quality

Arquivo: `src/modules/fields/quality/infrastructure/routes/field-quality.routes.ts`

| Método | Caminho | Operação |
| --- | --- | --- |
| POST | `/rate` | Avaliar qualidade do campo |
| GET | `/:fieldId` | Obter qualidade do campo |

### Finance

Arquivo: `src/modules/finance/infrastructure/routes/finance.routes.ts`

| Método | Caminho | Operação |
| --- | --- | --- |
| POST | `/payments` | Criar pagamento |
| POST | `/payments/:id/confirm` | Confirmar pagamento |
| POST | `/payments/:id/cancel` | Cancelar pagamento |
| POST | `/payments/:id/refund` | Reembolsar pagamento |
| POST | `/wallets` | Criar carteira |
| GET | `/wallets/:id/balance` | Consultar saldo |
| POST | `/wallets/:id/credit` | Creditar carteira |
| POST | `/wallets/:id/debit` | Debitar carteira |
| POST | `/settlements/:matchPaymentId` | Executar liquidação |
| POST | `/settlements/:id/distribute` | Distribuir liquidação |
| POST | `/settlements/:id/finalize` | Finalizar liquidação |

### Matchmaking

Arquivo: `src/modules/matchmaking/infrastructure/routes/matchmaking.routes.ts`

| Método | Caminho | Operação |
| --- | --- | --- |
| POST | `/find` | Procurar partida |
| GET | `/recommendations` | Obter recomendações |
| POST | `/:id/accept` | Aceitar sugestão |
| POST | `/:id/reject` | Rejeitar sugestão |
| GET | `/operations` | Monitorizar pesquisas, fila BullMQ, tentativas sem adversário e convites pendentes (ADMIN) |

As pesquisas entram na fila BullMQ `matchmaking`; o endpoint de procura mantém a resposta síncrona ao aguardar pelo job. Se Redis/BullMQ estiver indisponível no arranque, a procura usa o fluxo síncrono existente e a monitorização indica explicitamente que a fila está indisponível.

### Notifications

| Router | Método | Caminho | Operação |
| --- | --- | --- | --- |
| Notificações | POST | `/` | Criar notificação |
| Notificações | POST | `/bulk` | Enviar em lote |
| Notificações | POST | `/:id/send` | Enviar notificação |
| Notificações | POST | `/:id/schedule` | Agendar notificação |
| Notificações | POST | `/:id/cancel` | Cancelar agendamento |
| Notificações | GET | `/:id` | Obter notificação |
| Notificações | GET | `/user/:userId` | Notificações do utilizador |
| Notificações | GET | `/user/:userId/unread` | Não lidas do utilizador |
| Notificações | PATCH | `/:id/read` | Marcar como lida |
| Notificações | PATCH | `/user/:userId/read-all` | Marcar todas como lidas |
| Notificações | DELETE | `/:id` | Remover notificação |
| Preferências | GET | `/:userId` | Obter preferências |
| Preferências | PUT | `/:userId` | Atualizar preferências |
| Preferências | POST | `/:userId/channel/enable` | Ativar canal |
| Preferências | POST | `/:userId/channel/disable` | Desativar canal |
| Templates | POST | `/` | Criar template |
| Templates | GET | `/:id` | Obter template |
| Templates | PUT | `/:id` | Atualizar template |
| Templates | DELETE | `/:id` | Remover template |
| Dispositivos | POST | `/` | Registar dispositivo |
| Dispositivos | GET | `/` | Listar dispositivos autenticados |
| Dispositivos | PATCH | `/:deviceId/deactivate` | Desativar dispositivo |
| Dispositivos | DELETE | `/:deviceId` | Remover dispositivo |

Arquivos: `notification.routes.ts`, `notification-preference.routes.ts`, `notification-template.routes.ts`, `notification-device.routes.ts`.

### Player history e transfer

| Módulo | Método | Caminho | Operação |
| --- | --- | --- | --- |
| Histórico | POST | `/` | Criar registo de histórico |
| Histórico | GET | `/` | Listar histórico |
| Histórico | GET | `/:id` | Obter registo |
| Histórico | PUT | `/:id/verify` | Verificar registo |
| Histórico | DELETE | `/:id` | Remover registo |
| Histórico | GET | `/type/:type` | Filtrar por tipo |
| Histórico | GET | `/recent/:playerId` | Histórico recente do jogador |
| Histórico | GET | `/range` | Filtrar por intervalo de datas |
| Transfer | POST | `/request` | Solicitar transferência |

Arquivos: `player-history.routes.ts`, `player-transfer.routes.ts`.

### Tournament

| Módulo | Método | Caminho | Operação |
| --- | --- | --- | --- |
| Base | POST | `/` | Criar torneio |
| Base | GET | `/` | Listar torneios |
| Base | GET | `/:id` | Obter torneio |
| Base | PUT | `/:id` | Atualizar torneio |
| Base | PATCH | `/:id/status` | Aprovar/publicar, suspender, concluir ou cancelar |
| Base | DELETE | `/:id` | Eliminar torneio sem dependências |
| Award | POST | `/tournaments/:tournamentId/awards/calculate` | Calcular prémios |
| Award | POST | `/awards/:awardId/assign` | Atribuir prémio |
| Award | GET | `/awards` | Listar prémios do proprietário |
| Award | GET | `/tournaments/:tournamentId/awards` | Listar prémios do torneio |
| Discipline | POST | `/cards` | Registar cartão |
| Discipline | POST | `/suspensions` | Suspender jogador |
| Discipline | PATCH | `/suspensions/lift` | Levantar suspensão |
| Discipline | POST | `/penalties` | Aplicar penalidade |
| Discipline | GET | `/report` | Obter relatório disciplinar |
| Fixture | POST | `/generate` | Gerar fixtures |
| Fixture | POST | `/regenerate` | Regenerar fixtures |
| Fixture | GET | `/tournament/:tournamentId` | Listar fixtures do torneio |
| Fixture | GET | `/tournament/:tournamentId/result-history` | Histórico auditável de resultados (admin) |
| Fixture | GET | `/:id` | Obter fixture |
| Fixture | PUT | `/:id` | Atualizar agenda ou resultado (admin; justificação obrigatória para resultados) |
| Fixture | DELETE | `/:id` | Remover fixture (admin) |
| Incident | GET | `/` | Listar incidentes; filtra por `tournamentId` |
| Incident | POST | `/` | Registar desistência, conflito ou contestação (admin) |
| Incident | PATCH | `/:id` | Encaminhar para análise ou resolver com nota (admin) |
| History | POST | `/tournaments/:tournamentId/history` | Registar histórico |
| History | GET | `/tournaments/:tournamentId/history` | Histórico do torneio |
| History | GET | `/teams/:teamId/history` | Histórico da equipa |
| History | GET | `/history/champions` | Listar campeões |
| Registration | POST | `/register` | Registar no torneio |
| Registration | POST | `/:id/approve` | Aprovar registo |
| Registration | POST | `/:id/reject` | Rejeitar registo |
| Registration | POST | `/:id/remove` | Remover registo |
| Registration | GET | `/tournament/:tournamentId` | Registos do torneio |
| Stage | POST | `/` | Criar fase |
| Stage | GET | `/tournament/:tournamentId` | Fases do torneio |
| Stage | GET | `/:stageId` | Estado da fase |
| Stage | POST | `/:stageId/advance` | Avançar fase |
| Standing | GET | `/:tournamentId` | Tabela classificativa |
| Standing | POST | `/:tournamentId/calculate` | Calcular classificação |
| Standing | POST | `/:tournamentId/reset` | Reiniciar classificação |
| Statistics | GET | `/:tournamentId/top-scorers` | Melhores marcadores |
| Statistics | GET | `/:tournamentId/top-assists` | Melhores assistências |
| Statistics | GET | `/:tournamentId/team/:teamId` | Estatísticas da equipa |
| Statistics | GET | `/:tournamentId/player/:playerId` | Estatísticas do jogador |

As rotas de gestão de torneios, publicação, agenda, resultados e incidentes exigem autenticação; as mutações administrativas exigem o papel `ADMIN` ou `SUPER_ADMIN`. Alterações de resultado guardam autor, valores anteriores/novos e justificação na tabela `tournament_fixture_result_history`.

Arquivos: `tournament.routes.ts`, `award.routes.ts`, `discipline.routes.ts`, `fixture.routes.ts`, `tournament-incident.routes.ts`, `history.routes.ts`, `tournament-registration.routes.ts`, `stage.routes.ts`, `standing.routes.ts`, `statistics.routes.ts`.

### Store — devoluções e reembolsos

Prefixo: `/api/v1/store`
Arquivo: `src/modules/store/infrastructure/routes/store.routes.ts`

| Método | Caminho | Operação |
| --- | --- | --- |
| GET | `/returns/policy` | Consultar política |
| PUT | `/returns/policy` | Atualizar e auditar política (admin) |
| GET | `/returns` | Listar devoluções (admin; filtros `status` e `limit`) |
| GET | `/orders/:orderId/returns` | Consultar devoluções da encomenda própria ou administrada |
| POST | `/orders/:orderId/returns` | Submeter pedido (cliente ou admin) |
| PATCH | `/returns/:id/review` | Aprovar/rejeitar (admin) |
| PATCH | `/returns/:id/tracking` | Registar transportadora e rastreio |
| PATCH | `/returns/:id/receive` | Registar artigos recebidos (admin) |
| PATCH | `/returns/:id/inspect` | Inspecionar e calcular valor elegível (admin) |
| PATCH | `/returns/:id/refund` | Registar referência de reembolso processado externamente (admin) |
| PATCH | `/returns/:id/close` | Encerrar sem reembolso (admin) |

O fluxo exige encomenda concluída e entrega confirmada dentro do prazo configurado. O reembolso é apenas registado após processamento financeiro externo; método, referência e nota ficam no histórico. A inspeção atualiza stock apenas para artigos aceites e repostos. As rotas exigem autenticação; as operações administrativas exigem `ADMIN` ou `SUPER_ADMIN`.

## Módulos sem endpoints Express detetados

Não há chamadas a `router.get`, `router.post`, `router.put`, `router.patch` ou `router.delete` nos módulos `tournament-payment` e `matchmaking-realtime`. Eles podem expor funcionalidades por workers, eventos, gateways ou WebSocket, mas não por rotas HTTP Express.

## Manutenção

Ao criar uma nova rota, atualize o respetivo arquivo `*.routes.ts`, registre o router em `src/main/routes.ts` e inclua uma linha nesta documentação. Isso evita que “rota declarada” e “rota pública” fiquem divergentes.
