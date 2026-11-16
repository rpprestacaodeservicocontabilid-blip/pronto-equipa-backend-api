# Revisão arquitectural dos módulos

Regras: domínio independente de frameworks; aplicação depende de contratos; apresentação depende dos casos de uso; infraestrutura implementa adaptadores. O composition root pode conhecer todas as camadas. Testes e declarações ambientais são excluídos desta contagem.

Este relatório verifica imports directos e organização, não certifica por si só DDD ou Clean Code. A revisão de agregados, invariantes e contratos entre bounded contexts exige análise semântica adicional.

Resultado: 25 módulos; 0 violações das regras automatizadas.

| Módulo           | Ficheiros | Camadas presentes                                 | Entrada pública | Violações |
| ---------------- | --------: | ------------------------------------------------- | --------------- | --------: |
| attendance       |        15 | domain, application, infrastructure, presentation | Sim             |         0 |
| audit            |        14 | domain, application, infrastructure, presentation | Sim             |         0 |
| auth             |       150 | domain, application, infrastructure, presentation | Sim             |         0 |
| authorization    |        19 | domain, application, infrastructure, presentation | Sim             |         0 |
| contracts        |        17 | domain, application, infrastructure, presentation | Sim             |         0 |
| documents        |        14 | domain, application, infrastructure, presentation | Sim             |         0 |
| employees        |        31 | domain, application, infrastructure, presentation | Sim             |         0 |
| leave            |        43 | domain, application, infrastructure, presentation | Sim             |         0 |
| legal-rules      |        11 | domain, application, infrastructure, presentation | Sim             |         0 |
| loans            |        22 | domain, application, infrastructure, presentation | Sim             |         0 |
| notifications    |        12 | domain, application, infrastructure, presentation | Sim             |         0 |
| onboarding       |        11 | domain, application, infrastructure, presentation | Sim             |         0 |
| organization     |        15 | domain, application, infrastructure, presentation | Sim             |         0 |
| payments         |        14 | domain, application, infrastructure, presentation | Sim             |         0 |
| payroll          |        20 | domain, application, infrastructure, presentation | Sim             |         0 |
| payroll-engine   |        14 | domain, application, infrastructure               | Sim             |         0 |
| payslips         |        16 | domain, application, infrastructure, presentation | Sim             |         0 |
| platform-billing |        13 | domain, application, infrastructure, presentation | Sim             |         0 |
| reports          |        12 | domain, application, infrastructure, presentation | Sim             |         0 |
| salary-structure |        10 | domain, application, infrastructure, presentation | Sim             |         0 |
| simulations      |        13 | domain, application, infrastructure, presentation | Sim             |         0 |
| subscriptions    |        12 | domain, application, infrastructure, presentation | Sim             |         0 |
| support          |        14 | domain, application, infrastructure, presentation | Sim             |         0 |
| tenancy          |        47 | domain, application, infrastructure, presentation | Sim             |         0 |
| user             |       102 | domain, application, infrastructure, presentation | Sim             |         0 |

## Dependências a corrigir

Nenhuma violação das regras automatizadas.

O motor payroll-engine é um módulo de cálculo sem interface HTTP; não precisa de controllers vazios. Preservar essa característica é compatível com as mesmas regras de dependência.
