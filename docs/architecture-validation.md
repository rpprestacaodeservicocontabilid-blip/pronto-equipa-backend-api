# Validação da revisão arquitectural

Data: 16 de novembro de 2026.

## Alterações implementadas

- Organização dos 25 módulos em domínio, aplicação, infraestrutura e apresentação, com composition roots e entradas públicas. Payroll Engine mantém apenas as camadas necessárias ao cálculo, sem endpoints artificiais.
- Repositórios, modelos, casos de uso, DTOs, rotas, controladores e jobs posicionados nas respectivas camadas; referências actualizadas.
- Portas de persistência e integração independentes do Sequelize. Os casos de uso operam sobre registos simples e contextos opacos de transacção.
- Persistência, PDFs, armazenamento, antivírus e consultas de fontes externas injectados nos serviços dos módulos recentes.
- Regras do ciclo de vida salarial transferidas do repositório técnico para a aplicação. Reservas de empréstimos continuam na mesma transacção do cálculo.
- Aprovação de lotes de pagamento executada numa unidade de trabalho, com controlo de estado e separação entre criador e aprovador.
- Correcção da versão dos snapshots de simulação para acompanhar a versão do cenário.
- Substituição do adaptador User incompleto por uma exportação da implementação existente.
- Configuração ESLint corrigida: regra de retorno com o nome correcto, projecto de análise que inclui testes e restrições de imports aplicadas por camada.
- Verificação arquitectural automática adicionada à CI, sem excepções para violações existentes.

## Evidência

O inventário e o resultado das regras automatizadas encontram-se em [architecture-review.md](architecture-review.md). Os contratos e as responsabilidades das camadas estão descritos em [module-architecture.md](module-architecture.md).

Os testes adicionais cobrem atomicidade entre colecções, invalidação do contexto transaccional, quotas e idempotência de uploads, versões de planos e cenários, modelos de recibo, titularidade de relatórios e aprovação de pagamentos. O fluxo salarial conserva os testes de validação, cálculo, revisão e encerramento.

Os dois testes PostgreSQL são condicionais à variável `PAYROLL_TEST_POSTGRES_URL`. Sem essa ligação, ficam ignorados. Os testes SQLite não demonstram o comportamento de RLS nem a concorrência do PostgreSQL.

## Trabalho ainda necessário

O lint global continua a identificar problemas de tipagem e manutenção, especialmente acessos a payloads JSON através de `any`, retornos e argumentos sem tipos seguros, promessas sem tratamento explícito e código legado. A análise permanece activa; as regras de segurança de tipos não foram desactivadas para obter um resultado verde. A etapa de lint da CI continua a bloquear enquanto houver erros.

A conformidade integral com DDD e Clean Code ainda exige tipar esses payloads por agregado, dividir serviços extensos em casos de uso mais específicos e substituir consultas de modelos de outros módulos por contratos públicos de leitura. A auditoria de imports não verifica esses requisitos semânticos. O resultado estrutural não deve ser apresentado como certificação de que toda a aplicação está concluída ou pronta para produção.

Esta refactorização não aplicou migrações nem alterou esquemas de bases de dados de produção.

## Continuação da revisão

A configuração de lint permanece com as regras de segurança de tipos activas. A análise final foi executada sem cache, para considerar alterações de tipos importados por outros ficheiros.

A base medida no início desta continuação, já com Support, tinha 1886 erros. O resultado passou para 1457: 429 erros corrigidos e 16 dos 25 módulos sem erros de lint.

Este lote eliminou os erros em Attendance, Contracts, Employees, Legal Rules, Loans, Notifications, Payroll, Payroll Engine, Reports, Support e Tenancy. Onboarding e Platform Billing tiveram redução parcial.

Correcções adicionais:

- Notifications valida cada tipo de payload persistido e os dados das filas, sem usar `any` nos contratos. Dados de entrega corrompidos são rejeitados antes do contacto com o prestador.
- Respostas HTTP bem-sucedidas mas inválidas do prestador mantêm estado desconhecido, evitando repetição automática de uma entrega incerta.
- Reports usa projecções com valores desconhecidos tipados e traduz os resultados ORM dentro do adaptador.
- As entradas HTTP de RH e as importações iniciais de trabalhadores passam pelos respectivos validadores antes dos casos de uso.
- O provisionamento valida os dados da empresa e das configurações recebidas.
- Support usa a identidade documentada de artigos e incidentes, pesquisa as projecções publicadas e preserva os metadados persistidos nas respostas. A entrada pública do módulo foi acrescentada.

## Resultado final das verificações

| Verificação                                  | Resultado                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------ |
| TypeScript (`tsc --noEmit -p tsconfig.json`) | Passou                                                                   |
| Arquitectura (`architecture:check`)          | 25 módulos, 661 ficheiros, zero violações das regras automatizadas       |
| Jest (`--runInBand`)                         | 38 suites aprovadas; 335 testes aprovados; 2 testes PostgreSQL ignorados |
| Lint global, sem cache                       | Falhou: 1457 erros                                                       |
| Diferenças Git (`git diff --check`)          | Passou                                                                   |

A contagem inclui o código de produção e os testes. O lint global e a conformidade integral com Clean Code continuam pendentes.

| Módulo                            | Erros de lint |
| --------------------------------- | ------------: |
| attendance                        |             0 |
| audit                             |             0 |
| auth                              |           135 |
| authorization                     |             0 |
| contracts                         |             0 |
| documents                         |            53 |
| employees                         |             0 |
| leave                             |             0 |
| legal-rules                       |             0 |
| loans                             |             0 |
| notifications                     |             0 |
| onboarding                        |            50 |
| organization                      |             0 |
| payments                          |            81 |
| payroll                           |             0 |
| payroll-engine                    |             0 |
| payslips                          |           140 |
| platform-billing                  |           115 |
| reports                           |             0 |
| salary-structure                  |             0 |
| simulations                       |           385 |
| subscriptions                     |           210 |
| support                           |             0 |
| tenancy                           |             0 |
| user                              |           114 |
| Suporte e testes fora dos módulos |           174 |

| Regra                                            | Erros |
| ------------------------------------------------ | ----: |
| @typescript-eslint/no-unsafe-member-access       |   564 |
| @typescript-eslint/no-unsafe-assignment          |   499 |
| @typescript-eslint/no-unsafe-argument            |   197 |
| @typescript-eslint/no-unsafe-return              |    95 |
| @typescript-eslint/no-unsafe-call                |    53 |
| @typescript-eslint/no-var-requires               |    18 |
| @typescript-eslint/no-unused-vars                |    11 |
| @typescript-eslint/unbound-method                |     7 |
| @typescript-eslint/restrict-template-expressions |     6 |
| @typescript-eslint/no-floating-promises          |     4 |
| no-control-regex                                 |     1 |
| no-useless-escape                                |     1 |
| @typescript-eslint/no-namespace                  |     1 |
