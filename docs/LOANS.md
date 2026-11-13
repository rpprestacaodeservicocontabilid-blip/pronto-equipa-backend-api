# Módulo de empréstimos

Prefixo: `/api/v1/loans`. Todas as rotas exigem autenticação, contexto empresarial (`X-Company-Id`) e a permissão `loans.*` indicada em cada endpoint. As permissões são adicionadas ao catálogo, sem atribuição automática a papéis.

## Endpoints

| Método | Endpoint | Permissão |
| --- | --- | --- |
| GET / POST | `/applications` | `loans.applications.read` / `.create` |
| GET / PATCH | `/applications/:id` | `loans.applications.read` / `.update` |
| POST | `/applications/:id/submit` | `loans.applications.submit` |
| POST | `/applications/:id/decision` | `loans.applications.decide` |
| POST | `/applications/:id/cancel` | `loans.applications.cancel` |
| GET | `/` e `/:id` | `loans.loans.read` |
| GET | `/:id/balance`, `/:id/plans`, `/:id/installments`, `/:id/history` | `loans.loans.read` |
| POST / GET | `/:id/disbursements` | `loans.disbursements.request` / `.read` |
| POST | `/:id/disbursements/:disbursementId/confirm` | `loans.disbursements.confirm` |
| POST / GET | `/:id/repayments` | `loans.repayments.register` / `.read` |
| POST | `/:id/repayments/:repaymentId/reverse` | `loans.repayments.reverse` |
| POST / GET | `/:id/deductions`, `/deductions` | `loans.deductions.request` / `.read` |
| POST | `/deductions/:deductionId/confirm` | `loans.deductions.confirm` |
| POST | `/:id/renegotiations` | `loans.renegotiations.request` |
| POST | `/renegotiations/:renegotiationId/decision` | `loans.renegotiations.decide` |
| POST | `/:id/status`, `/:id/settle` | `loans.loans.manage` / `.settle` |
| GET / POST | `/policies` | `loans.policies.read` / `.manage` |
| POST | `/simulations` | `loans.simulations.create` |
| GET | `/reports/summary`, `/reports/outstanding`, `/reports/late-installments` | `loans.reports.read` |

## Regras relevantes

- Os valores são armazenados como `DECIMAL(15,2)` e calculados em cêntimos inteiros. A moeda aceite é AOA.
- Juros só podem ser aplicados quando permitidos explicitamente na política da empresa.
- A aprovação exige um aprovador diferente do requerente e confirma novamente a elegibilidade e os limites da política.
- Um desembolso só entra no saldo após confirmação com referência de pagamento. Um desconto salarial solicitado não amortiza o empréstimo até confirmação pela folha.
- Pagamentos e estornos produzem lançamentos append-only; um estorno cria lançamentos compensatórios.
- A migração `20261109000014-create-loans.js` configura isolamento por empresa e RLS no PostgreSQL. Os testes automatizados usam SQLite; a validação das políticas RLS deve ser feita também numa instância PostgreSQL.
- Eventos transaccionais são gravados em `loan_outbox`. A integração com folha salarial e pagamentos depende de consumidores/confirmadores externos e não é simulada pelo módulo.
