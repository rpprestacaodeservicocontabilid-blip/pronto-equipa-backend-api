# Payroll — processamento salarial

O módulo segue o padrão existente de Express, TypeScript e Sequelize. `companyId` representa o tenant. Não foi adicionado outro ORM ao projecto. Fórmulas salariais, IRT e INSS pertencem ao `payroll-engine`; regras publicadas pertencem ao `legal-rules`.

## Estrutura

- `domain/`: estados, invariantes, valores monetários exactos, reconciliação e hashes canónicos.
- `application/ports/`: contratos de fontes, motor, regras legais e publicação.
- `application/use-cases/`: validação, filas persistentes, execução individual, reconciliação, aprovação, fecho, pagamentos, regularizações, relatórios e exportações.
- `infrastructure/`: modelos Sequelize, adaptadores de integração, exportadores PDF/XLSX e runtime BullMQ/outbox.
- `presentation/`: rotas, controller e schemas Zod.
- `payroll.module.ts`: composição, com injecção de serviço para testes ou integrações locais.

## Preparação

1. Configurar PostgreSQL e executar `npm run db:migrate` no ambiente pretendido. As migrations não são aplicadas pelo arranque da API. As duas migrations iniciais e as duas de conclusão de workflow são necessárias.
2. Atribuir as permissões `payroll:*` concretas aos papéis autorizados. Não há atribuição automática nem bypass global de administrador.
3. Configurar Redis e pelo menos uma instância da aplicação com `PAYROLL_WORKER_ENABLED=true`. Workers ficam desligados por omissão; comandos assíncronos permanecem na base até existir um worker.
4. Configurar `PAYROLL_ENGINE_URL`, `PAYROLL_LEGAL_RULES_URL`, `PAYROLL_EVENTS_URL` e `PAYROLL_INTEGRATION_TOKEN`. As URLs são configuração do operador, nunca valores enviados pelos clientes.
5. Publicar estruturas salariais e encerrar a assiduidade do período. Pedidos de descontos de empréstimos devem ser autorizados no módulo `loans` antes da captura das entradas.

O runtime é registado no bootstrap e encerrado antes de Redis e da base. A fila usa oito workers globais, limite de dispatch por empresa, lotes até 100 trabalhadores e `PAYROLL_TENANT_CONCURRENCY` entre 1 e 8, por omissão 2. A base é a fonte de verdade; leases e tokens protegem gravações de tarefas repetidas. O dispatcher procura tarefas persistentes a cada dez segundos. Falhas do motor são guardadas por trabalhador e recuperadas por `retry-failed`. Falhas transitórias de infraestrutura usam retry exponencial BullMQ. Permissões e vínculo activo do operador são verificados novamente nos workers.

## Contratos de integração

### Regras legais

`POST {PAYROLL_LEGAL_RULES_URL}/resolve` recebe `{ companyId, startDate, endDate }`. Resposta:

```json
{
  "version": "referencia-publicada",
  "status": "PUBLISHED",
  "effectiveFrom": "2026-01-01",
  "effectiveTo": null,
  "rules": {}
}
```

O serviço deve garantir regras publicadas para todo o intervalo, incluindo alterações de vigência dentro do período quando aplicável. Sem configuração ou sem regras válidas, a pré-validação produz uma pendência bloqueante.

### Motor salarial

`POST {PAYROLL_ENGINE_URL}/calculate` recebe `PayrollInputSnapshot` conforme o contrato TypeScript: identidade da empresa/execução/trabalhador, período de cálculo, IDs de snapshots, hash e dados completos. `data` contém segmentos contratuais/salariais históricos, assiduidade fechada filtrada por trabalhador, férias aprovadas, empréstimos, prestações, movimentos de pagamento e descontos autorizados. Contém ainda finalidade da execução, período de lançamento e, nas regularizações, resultado original e motivo.

A resposta deve cumprir `PayrollCalculationResult`: valores monetários em strings com duas casas decimais; moeda; versões do motor e regras; trace; rubricas EARNING, DEDUCTION e EMPLOYER_COST com origem. O módulo verifica identidade, versão legal, duplicados e reconciliação das rubricas com os totais. Encargos patronais não são subtraídos ao líquido.

Para rectificações e retroactivos, o motor devolve o resultado integral corrigido do período original; `payroll` preserva esse resultado e regista separadamente a diferença face ao original. O pagamento contém apenas a diferença. Diferenças negativas bloqueiam preparação automática e exigem tratamento autorizado de recuperação. Complementos devem respeitar o mesmo contrato de resultado integral de referência. Não enviar apenas o valor adicional como se fosse o resultado integral.

Rubricas de empréstimos devem ter código `LOAN_*` e `sourceReference` igual a `loan-deduction:UUID`. A referência precisa constar no snapshot, estar solicitada e ter montante autorizado. A reserva da referência e o resultado são gravados na mesma transacção. No fecho, a outbox entrega a confirmação ao adaptador de `loans`, que chama `confirmDeduction` com uma chave estável. Cálculo e simulação não confirmam pagamentos de empréstimos. Cancelar uma execução provisória liberta as reservas ainda não confirmadas.

Os módulos `payroll-engine` e `legal-rules` estão implementados neste repositório. O `payroll` usa o motor local e o resolvedor HTTP das regras legais; as taxas continuam a depender de regras oficiais publicadas e revistas. Consulte `src/modules/payroll-engine/README.md` e `docs/legal-rules.md` para configurar as integrações.

### Eventos

`PAYROLL_EVENTS_URL` recebe os eventos da outbox por POST com Bearer token e `Idempotency-Key` igual ao ID do evento. O endpoint deve responder 2xx somente depois de aceitar duravelmente o evento. Consumo é pelo menos uma vez e precisa deduplicar por empresa e ID. O fecho inclui referências e evidências dos resultados; preparação de pagamentos inclui as instruções. `payments`, `payslips`, `reports` e notificações são consumidores independentes. Fecho não significa salário pago.

A publicação usa transacção, locks e marca `publishedAt` apenas após sucesso. Sem endpoint configurado os eventos permanecem pendentes; não são descartados. Como o payload de fecho contém dados salariais, o endpoint deve pertencer a um consumidor interno autorizado.

## API

Prefixo `/api/v1/payroll`. Todas as rotas requerem JWT, contexto `X-Company-Id` e permissões do tenant.

| Operação | Endpoint | Permissão |
| --- | --- | --- |
| Listar/consultar períodos e execuções | GET /periods, /periods/:id, /runs, /runs/:id | payroll:read |
| Criar período | POST /periods | payroll:periods:create |
| Alterar rascunho | PATCH /periods/:id | payroll:periods:update |
| Abrir/encerrar período | POST /periods/:id/open, /close | payroll:periods:open, payroll:periods:close |
| Criar execução | POST /runs | payroll:runs:create |
| Enfileirar validação | POST /runs/:id/validate | payroll:runs:validate |
| Enfileirar cálculos | POST /runs/:id/process | payroll:runs:process |
| Repetir falhados | POST /runs/:id/retry-failed | payroll:runs:retry |
| Cancelar provisório | POST /runs/:id/cancel | payroll:runs:cancel |
| Progresso/pendências/totais | GET /runs/:id/progress, /issues, /summary | payroll:read |
| Resultados e detalhes | GET /runs/:id/results, /results/:resultId | payroll:results:read-sensitive |
| Explicação | GET /runs/:id/results/:resultId/explanation | payroll:results:read-sensitive |
| Submeter/aprovar/rejeitar | POST /runs/:id/submit, /approve, /reject | payroll:approvals:submit, :approve, :reject |
| Fechar | POST /runs/:id/close | payroll:closing:execute |
| Consultar fecho | GET /runs/:id/closing | payroll:results:read-sensitive |
| Histórico | GET /runs/:id/history | payroll:history:read |
| Preparar/consultar instruções | POST/GET /runs/:id/payment-instructions | payroll:payments:prepare, :read |
| Rectificar/complementar | POST /runs/:id/corrections, /supplements | payroll:corrections:create |
| Comparação | GET /runs/:id/comparison?otherRunId=UUID | payroll:results:compare e read-sensitive |
| Relatórios | GET /reports/summary, /deductions, /employer-costs?periodId=UUID | payroll:reports:read; mapas individuais também read-sensitive |
| Políticas | GET/POST /policies | payroll:policies:manage |
| Solicitar exportação | POST /exports | payroll:export e read-sensitive |
| Descarregar exportação pronta | GET /exports/:id/download | payroll:export e read-sensitive |

Período: `{ "startDate": "2026-11-01", "endDate": "2026-11-30", "paymentDate": "2026-11-30" }`. Comandos de transição: `{ "expectedVersion": 1 }`; rejeição também exige `reason`. PATCH exige datas completas e `expectedVersion`.

Execução: `{ "periodId": "UUID", "runType": "REGULAR", "executionScope": "INDIVIDUAL", "employeeIds": ["UUID"], "idempotencyKey": "novembro-001" }`. Finalidades: REGULAR, OFF_CYCLE, SUPPLEMENTARY, RETROACTIVE, CORRECTION, TERMINATION, SIMULATION. `executionScope` distingue INDIVIDUAL de COLLECTIVE. Não existe runType INDIVIDUAL.

Regularizações exigem `originalRunId` fechado, `reason` e trabalhadores do resultado original. As rotas aninhadas preenchem o ID original e a finalidade. Para regularizar novamente o mesmo trabalhador, usar a rectificação fechada mais recente como original; a aplicação impede diferenças repetidas contra o mesmo resultado.

Exportação: `{ "runId": "UUID", "format": "PDF", "idempotencyKey": "exportacao-001" }`, ou formato XLSX. Resposta 202 com ID; o download devolve conflito enquanto pendente. Exportações expiram em 24 horas. XLSX usa células de texto para impedir execução de fórmulas. PDF é tabular, com páginas e sem layout de recibo de vencimento. A emissão oficial do recibo pertence ao módulo payslips.

## Garantias de persistência

PostgreSQL recebe RLS forçado, referências compostas por empresa, índices, unicidade por resultado/trabalhador, snapshots de entrada imutáveis, evidências imutáveis e triggers de protecção dos resultados fechados. Comandos financeiros usam transacções e bloqueio por empresa; versões esperadas rejeitam comandos desactualizados. O utilizador que cria ou submete não pode aprovar a execução. A política permite de um a cinco aprovadores distintos e fica capturada na submissão.

A mesma chave de criação com os mesmos dados devolve a execução original; parâmetros diferentes produzem conflito. Processamentos regulares não repetem o trabalhador no período. Fecho e instruções de pagamento não duplicam resultados em reexecução. Não há endpoint para injectar resultados arbitrários nem alterar directamente uma folha fechada.

## Verificação e entrada em produção

Os testes usam motor e fontes determinísticas de fixture, não regras fiscais reais. A suite completa do projecto passou com 277 testes antes dos últimos reforços do workflow; testes específicos cobrem cálculo, hashes, isolamento, permissões HTTP, falhas, retries, políticas, regularizações, fecho e exportações.

Docker local indisponível durante esta implementação: RLS, triggers PostgreSQL, BullMQ/Redis real e carga de 500–5.000 utilizadores não foram executados neste ambiente. Antes da entrada em produção é necessário validar as migrations PostgreSQL com um papel de aplicação sem BYPASSRLS, executar testes de concorrência/recuperação com Redis e o motor real, verificar consumidores de pagamentos/recibos/empréstimos e validar juridicamente as regras publicadas. Os adaptadores preparados não significam que esses serviços externos já estejam implementados ou configurados.
