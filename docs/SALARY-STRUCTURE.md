# Módulo de estrutura salarial

Prefixo: `/api/v1/salary-structure`. Todas as rotas exigem JWT, `X-Company-Id`, associação activa à empresa e a permissão `salary-structure:*` indicada no catálogo. As permissões são semeadas sem grants automáticos.

## Ciclos e regras

- Componentes, tabelas e estruturas mantêm versões datadas. Componentes e tabelas são publicados após edição; uma estrutura passa por `DRAFT` → `PENDING_APPROVAL` → `APPROVED` → `PUBLISHED` ou `SCHEDULED`.
- O proponente de uma estrutura ou revisão não pode aprová-la. Lotes exigem validação sem itens inválidos e aprovação por outro utilizador antes da aplicação.
- A atribuição verifica trabalhador e contrato activos da mesma empresa, vigência, moeda, versão publicada e componentes da estrutura. Se o contrato contém salário-base, o valor atribuído tem de coincidir; o contrato deve ser alterado primeiro no módulo `contracts`.
- Revisões e snapshots preservam as versões usadas. Os snapshots são append-only e imutáveis no PostgreSQL.
- Os valores monetários são persistidos como `DECIMAL(18,2)` e calculados em cêntimos com `BigInt`. Fórmulas aceitam apenas a operação declarativa `PERCENT_OF_BASE`; não existe avaliação de expressões arbitrárias.
- A simulação apresenta `totalRecurring` como equivalente mensal (12 períodos mensais, 52 semanais, 26 quinzenais ou 1 anual); componentes `ONE_TIME` ficam fora do total. O salário-base é tratado como mensal.
- As políticas salariais podem ser versionadas e consultadas, mas ainda não são aplicadas automaticamente na validação de atribuições ou revisões. Um lote que falha fica em `FAILED`; para reaplicar depois de corrigir a causa é necessário criar outro lote.
- O cálculo de IRT, INSS e outras obrigações legais não está implementado neste módulo. Referências legais podem ser armazenadas, mas os respectivos valores não são inferidos.
- `POST /exports` grava um pedido no outbox e devolve `202 PENDING`. O consumidor/worker de exportação ainda não está configurado; o endpoint não disponibiliza o ficheiro.
- Todos os dados são filtrados por `companyId`; a migration também configura RLS e chaves tenant-compostas para PostgreSQL. Os testes automatizados verificam o ciclo da migration em SQLite e o isolamento HTTP entre empresas, mas não substituem a validação de RLS numa instância PostgreSQL.

## Migrations

- `20261109000016-create-salary-structure.js`: tabelas, índices, chaves tenant-compostas, RLS e imutabilidade de snapshots.
- `20261109000017-seed-salary-structure-permissions.js`: catálogo de permissões, sem atribuição automática a papéis.
