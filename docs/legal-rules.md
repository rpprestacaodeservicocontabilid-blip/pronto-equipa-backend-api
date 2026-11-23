# Módulo `legal-rules`

O módulo administra conjuntos versionados de regras legais e fornece ao `payroll` a versão publicada que cobre todo o intervalo solicitado. Está implementado com Express, TypeScript, Sequelize e PostgreSQL/SQLite segundo os padrões actuais do backend. Não contém taxas fiscais predefinidas: os valores são inseridos a partir de fontes oficiais, revistos e publicados por utilizadores da plataforma.

## Ciclo de vida

`DRAFT → IN_REVIEW → APPROVED → PUBLISHED → RETIRED`

- Um rascunho pode ser alterado. Depois de submetido, os dados ficam imutáveis; uma correcção requer nova versão.
- A aprovação tem de ser feita por utilizador diferente do criador/submissor.
- Só conjuntos aprovados podem ser publicados. Não se permitem vigências sobrepostas no mesmo âmbito.
- A publicação calcula SHA-256 dos dados canónicos completos que o motor recebe.
- Conjuntos publicados não são editados nem apagados; podem ser retirados, preservando o histórico.
- O âmbito pode ser global (`companyId: null`) ou específico de uma empresa. Para a resolução, regras da empresa têm precedência sobre as globais; um override empresarial que toque parcialmente no período bloqueia a resolução em vez de cair silenciosamente na regra global.

## API de gestão

Prefixo `/api/v1/legal-rules`; JWT e permissões de plataforma (`scope=PLATFORM`):

| Operação | Endpoint | Permissão |
| --- | --- | --- |
| Listar conjuntos e versões | `GET /` | `legal-rules:read` |
| Consultar conjunto | `GET /:id` | `legal-rules:read` |
| Criar rascunho | `POST /` | `legal-rules:create` |
| Alterar rascunho | `PATCH /:id` | `legal-rules:update` |
| Submeter para revisão | `POST /:id/submit` | `legal-rules:submit` |
| Aprovar | `POST /:id/approve` | `legal-rules:approve` |
| Publicar | `POST /:id/publish` | `legal-rules:publish` |
| Rejeitar com motivo | `POST /:id/reject` | `legal-rules:approve` |
| Listar diplomas | `GET /sources` | `legal-rules:read` |
| Registar diploma | `POST /sources` | `legal-rules:create` |
| Simular impacto | `POST /impact` | `legal-rules:read` |
| Retirar da vigência | `POST /:id/retire` | `legal-rules:retire` |

As permissões são criadas pela migration, mas não são concedidas automaticamente a papéis.

O corpo de criação contém `companyId` (omitido ou `null` para âmbito global), `ruleSetId`, `version`, `jurisdiction: "AO"`, `effectiveFrom`, `effectiveTo`, `sourceReference`, `evidenceReference` e `rules`. `rules` segue o contrato `PayrollLegalRuleSet` do motor: `roundingPolicy`, `laborRules`, `socialSecurityRules`, `incomeTaxRules`, `deductionRules` e `compatibility` opcional. Escalões de IRT devem começar em zero, ser contíguos e terminar sem limite superior. Taxas são factores decimais (`0.08` = 8%).

As alterações e transições aceitam `expectedUpdatedAt` para confirmar a versão consultada. Uma rejeição preserva a versão e o motivo. A criação de uma versão pode associar diplomas registados e disposições laborais através de `governance`. O Payroll recebe os parâmetros do motor através de `rules`.

A simulação de impacto compara duas versões do mesmo âmbito com salários fictícios. Cada mês tem de estar integralmente dentro da vigência da versão seleccionada. Esta operação utiliza o motor de cálculo e devolve os totais e diferenças sem persistir uma folha.

## Resolução interna

`POST /api/v1/legal-rules/resolve` recebe o contrato já usado por `HttpPayrollLegalRules`:

```json
{
  "companyId": 17,
  "startDate": "2026-11-01",
  "endDate": "2026-11-30"
}
```

O endpoint requer `Authorization: Bearer $PAYROLL_INTEGRATION_TOKEN`. Responde com `ruleSetId`, `version`, `status: "PUBLISHED"`, datas de vigência, referências de fonte, hash de integridade e `rules` no formato aceito pelo motor. Se nenhuma versão única cobrir o período integral, ou se houver ambiguidade, responde conflito e não escolhe uma taxa por aproximação.

Configurar `PAYROLL_LEGAL_RULES_URL` como `https://<host>/api/v1/legal-rules` e usar o mesmo segredo forte em `PAYROLL_INTEGRATION_TOKEN` no serviço consumidor e nesta API. Limitar o acesso de rede do endpoint de resolução aos serviços internos.

## Dados e execução

Migrations: `20261114000000-create-legal-rules.js` e `20261120000000-add-legal-governance.js`. Permissões: `20261114000001-seed-legal-rules-permissions.js`. Executar `npm run db:migrate` no ambiente pretendido. Nenhuma regra fiscal é criada pela migration.

Registar mudanças através do audit log de plataforma. A documentação e referência de evidência são obrigatórias para criar um conjunto, e o estado, os responsáveis e os timestamps de submissão/aprovação/publicação/reforma ficam persistidos.

O resolvedor devolve uma única versão por intervalo, conforme o contrato actual do `payroll-engine`. Se uma mudança legal entrar em vigor dentro de um período de folha, o período deve ser dividido nas fronteiras legais ou o contrato do motor deve ser ampliado para calcular segmentos com versões distintas antes de processar esse caso. Não publicar uma regra fictícia para contornar a pendência.
