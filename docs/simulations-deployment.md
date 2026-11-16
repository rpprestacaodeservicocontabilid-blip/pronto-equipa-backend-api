# Simulations: ativação e execução

1. Executar `npm run db:migrate` para criar as tabelas tenant-scoped, RLS PostgreSQL, índices de idempotência e permissões.
2. Atribuir as permissões de `simulations:*` aos papéis que devem criar, calcular, consultar, exportar ou decidir propostas. A permissão `simulations:salary:read-sensitive` é requerida para dados individuais.
3. Configurar `PAYROLL_LEGAL_RULES_URL` para o módulo `legal-rules` e `PAYROLL_ENGINE_URL` quando o motor for servido externamente. Esta aplicação usa por omissão o `PayrollCalculatorAdapter` local sobre o motor compartilhado, mas o leitor de payroll exige regras publicadas e snapshot fechado de assiduidade para o período.
4. Para cálculos colectivos em background, ativar Redis e `SIMULATIONS_WORKER_ENABLED=true`. Lotes são limitados a 500 trabalhadores; o worker revalida membership e permissões. Sem worker activo, o cálculo é síncrono e limitado pelo mesmo máximo.

Todos os resultados, linhas, memória de cálculo, snapshots e exportações incluem a marca `simulationOnly`; não são criados payroll runs oficiais, pagamentos ou recibos. A comparação com folha oficial aceita apenas payroll runs encerrados e é somente leitura. Uma proposta aprovada regista a decisão; não aplica alterações em contratos ou remunerações.

Projecções são estimativas baseadas no resultado de referência e nas hipóteses mensais informadas (percentagem de aumento e variação de efectivo), nunca obrigações definitivas. Os ficheiros ficam guardados como payload privado por tenant na tabela `simulation_exports`; para volumes maiores, encaminhar este armazenamento para o módulo de documentos/object storage.
