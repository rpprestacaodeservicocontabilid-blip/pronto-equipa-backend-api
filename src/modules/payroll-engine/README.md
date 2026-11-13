# payroll-engine

Motor interno e puro de cálculo salarial. O domínio não importa Express, Sequelize, Redis, BullMQ nem executa consultas ou chamadas HTTP. O `payroll` obtém e congela os dados e regras antes de chamar o adaptador local.

## Operações

- `calculate(input)`: calcula remuneração e retenções, produz rubricas, alertas e trilho explicativo.
- `simulate(input)`: executa o mesmo cálculo determinístico sem persistência nem efeitos financeiros.
- `calculateDifference(input)`: compara um recálculo com o resultado histórico imutável e discrimina diferenças.
- `explain(result)`: devolve o trilho, versões e hashes registados no resultado.
- `evaluateRule(expression)`: interpreta somente expressões declarativas permitidas; não usa `eval` nem código JavaScript configurável.
- `RuleDependencyGraph.order(nodes)`: verifica dependências ausentes/cíclicas e produz ordem topológica.

## Contrato canónico do snapshot

O adaptador lê o snapshot actualmente criado por `payroll`. Para assiduidade detalhada, o leitor de fontes deve incluir `data.engineInput` com campos `attendance`, `deductions`, `leave` e, opcionalmente, `segments` já normalizados. Horas/ausências não são inferidas a partir de campos arbitrários de dias de presença.

```ts
{
  tenantId: 17,
  employeeId: 'employee-id',
  payrollRunId: 'run-id',
  period: { startDate: 'YYYY-MM-DD', endDate: 'YYYY-MM-DD' },
  currency: 'AOA',
  engineVersion: '1.0.0',
  inputHash: 'sha256 do snapshot imutável',
  legalRules: { /* PayrollLegalRuleSet */ },
  segments: [{
    startDate: 'YYYY-MM-DD', endDate: 'YYYY-MM-DD', baseSalary: '0.00',
    components: [{ code: 'ALLOWANCE_CODE', amount: '0.00', kind: 'EARNING', frequency: 'MONTHLY', sourceReference: 'salary-version-id' }]
  }],
  attendance: {
    absences: [{ code: 'ABSENCE', amount: '0.00', sourceReference: 'attendance-event-id', authorized: false }],
    overtime: [{ code: 'OVERTIME', hours: '0.00', hourlyRate: '0.00', sourceReference: 'attendance-event-id', authorized: true, category: 'STANDARD', workDate: 'YYYY-MM-DD' }],
    nightWork: [{ code: 'NIGHT_WORK', hours: '0.00', hourlyRate: '0.00', sourceReference: 'attendance-event-id' }]
  },
  deductions: [{ code: 'LOAN_id', requestedAmount: '0.00', priority: 10, sourceReference: 'loan-deduction:id', authorized: true, category: 'LOAN' }]
}
```

Os campos de valor aceitam decimais com até seis casas internamente; os resultados financeiros são arredondados para duas casas de acordo com a política versionada. A moeda actualmente suportada neste backend é AOA. Cada segmento salarial tem de estar dentro do período, não pode cruzar meses e não pode sobrepor outro segmento.

Componentes salariais aceitam `frequency`: `MONTHLY` (padrão), `WEEKLY` (52/12 do valor semanal), `BIWEEKLY` (26/12), `ANNUAL` (1/12) e `ONE_TIME`. Os componentes recorrentes são rateados pelos dias efectivos do segmento, com a mesma base de rateio do salário-base. `ONE_TIME` falha de forma explícita (`ONE_TIME_COMPONENT_REQUIRES_EVENT`): só pode ser calculado depois de ligado a um evento datado e idempotente, para impedir pagamentos repetidos em folhas diferentes. `maximumDailyOvertimeHours` exige `workDate` em cada registo de horas extra e valida o total diário antes de calcular o valor.

## Contrato das regras legais

`data.legalRules` contém as regras publicadas resolvidas para todo o período. Os valores `employeeRate`, `employerRate`, `rate`, `maxPercentageOfGross` e multiplicadores são factores decimais (por exemplo, `0.08` representa oito por cento; `1.5` é um multiplicador de uma vez e meia). A aplicação valida vigência, jurisdição, publicação, compatibilidade, intervalos fiscais e hash opcional.

Campos obrigatórios:

- `ruleSetId`, `version`, `status: 'PUBLISHED'`, `jurisdiction: 'AO'`, `effectiveFrom`, `sourceReference`.
- `roundingPolicy: { mode, scale: 2 }`.
- `laborRules: { prorationBasis, ... }`.
- `socialSecurityRules: { employeeRate, employerRate, ... }`.
- `incomeTaxRules: { calculation, brackets, ... }`.
- `deductionRules` com limites e categorias aplicáveis.

Em `PROGRESSIVE`, cada taxa é aplicada apenas ao valor no intervalo correspondente. Em `MARGINAL`, a taxa do escalão seleccionado incide sobre a base tributável inteira e o campo `deduction` é subtraído. `from` é o limite inferior e `to` o superior inclusivo; o último intervalo pode omitir `to`. Os códigos incluídos/excluídos determinam a incidência de cada rubrica. Nenhuma taxa ou escalão angolano é fixado no motor.

## Resultado e segurança

O resultado separa bruto, base tributável, base contributiva, IRT, INSS do trabalhador, INSS patronal, outros descontos, líquido e custo total da entidade. O trilho guarda referências de regras, versão do motor, hash do snapshot e hash do resultado. O motor não altera empréstimos nem grava resultados; o `payroll` continua responsável por reservas, persistência, auditoria, aprovação e fecho. O adaptador também compara a versão legal resolvida com a versão congelada no snapshot. As tabelas de IRT têm de começar em zero, ser contíguas e terminar sem limite superior; lacunas nunca são tratadas como taxa zero.

O cálculo de descontos aplica limites depois das retenções estatutárias e percorre descontos autorizados por prioridade. Os parcialmente aplicados incluem montante pedido, aplicado e remanescente. Descontos não autorizados geram aviso e não são aplicados. INSS patronal não reduz o líquido. Uma regra fiscal ou contributiva ausente, inválida, fora de vigência ou incompatível bloqueia o cálculo.

## Integração

`createPayrollEngineModule()` expõe o serviço de domínio e `PayrollCalculatorAdapter`, que implementa a porta consumida pelo `payroll`. A configuração actual usa esse adaptador no worker BullMQ, mantendo as leituras de dados e regras no `payroll`/`legal-rules` antes da fase matemática. Não são necessárias tabelas nem migrações para o motor.

Para habilitar produção, o serviço `legal-rules` deve devolver o contrato versionado acima e os casos fiscais/contributivos devem ser validados por responsáveis competentes contra as fontes oficiais e cenários aprovados. Até esses dados existirem, o comportamento seguro é falhar o item de folha com `CALCULATION_FAILED`, em vez de gerar retenções presumidas.
