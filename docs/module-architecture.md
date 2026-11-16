# Arquitectura dos módulos

Cada bounded context usa as mesmas direcções de dependência. A separação é funcional; criar pastas vazias não implementa DDD ou arquitectura hexagonal.

## Organização

```text
modules/<module>/
  domain/
    aggregates/
    entities/
    value-objects/
    services/
    repositories/
    events/
  application/
    use-cases/
    ports/
    dto/
  infrastructure/
    persistence/models/
    persistence/repositories/
    adapters/
    jobs/
    bootstrap/
  presentation/
    controllers/
    routes/
    middlewares/
    schemas/
  <module>.module.ts
  index.ts
```

Só criar os componentes necessários. O motor de cálculo não recebe endpoints artificiais. Testes podem ficar junto do comportamento testado e devem depender das portas para isolar infraestrutura.

## Responsabilidades

O domínio possui os invariantes e a linguagem do negócio. Não importa ORM, Express, filas, configuração de ambiente ou adaptadores. Entidades de ORM são modelos de persistência e não substituem agregados de domínio.

A aplicação coordena casos de uso através de portas. Contratos de repositório usam DTOs e entidades do domínio, sem expor instâncias Sequelize. Unidade de trabalho, autorização, relógio, armazenamento, notificações e integrações externas entram por contratos explícitos. Não inicializar adaptadores concretos dentro de um caso de uso.

A infraestrutura implementa essas portas e traduz entidades e DTOs para o ORM. Locks, contexto RLS, SQL, gateways e filas pertencem a adaptadores. Uma transacção financeira deve garantir atomicidade dos registos e eventos relacionados.

A apresentação trata protocolo, validação de entrada e resposta. Não consulta tabelas. O composition root do módulo constrói repositórios e casos de uso e fornece as rotas e contratos públicos. Outros módulos consomem contratos públicos, não modelos privados.

## Regras de manutenção

- Evitar importações circulares e dependências da aplicação para infraestrutura.
- Manter regras de dinheiro, datas e transições no domínio, com testes determinísticos.
- Exigir tenant nas operações empresariais e validar titularidade antes da existência de tenant.
- Publicar eventos transaccionais, com idempotência e estados de recuperação.
- Preservar contratos HTTP durante refactorizações; alterações de esquema exigem migração própria.
- Utilizar os formatadores existentes e nomes do vocabulário do módulo.

## Auditoria

Executar `npm run architecture:report` para actualizar o inventário e `npm run architecture:check` para rejeitar dependências proibidas, camadas obrigatórias ausentes ou entradas públicas ausentes. A CI executa esta verificação depois da compilação de tipos. Imports estáticos, exports, imports dinâmicos, imports de tipos e chamadas literais a `require` são auditados. Não há uma lista de violações ignoradas.

## Persistência e integração

Os casos de uso recebem portas de persistência, fontes de dados, armazenamento e renderização. Os adaptadores devolvem registos simples, sem `Model`, `get`, `toJSON`, `update` ou transacções Sequelize nas interfaces de aplicação. `RecordStoreContext` representa uma unidade de trabalho opaca; apenas a infraestrutura resolve a transacção efectiva. O contexto pode abranger várias colecções e fica inválido no fim da operação. Os adaptadores mantêm a identidade dos registos carregados sem acrescentar campos técnicos às respostas HTTP.

No PostgreSQL, as unidades de trabalho configuram o tenant e serializam operações por módulo e empresa com advisory locks. Operações da plataforma usam contexto global. Esta serialização é mais abrangente do que locks por recurso e deve ser medida em testes de carga antes de ajustar a granularidade. Os testes SQLite verificam comportamento e rollback; não homologam RLS ou concorrência PostgreSQL.

Em Payroll, a criação de períodos e execuções e as transições do ciclo de vida pertencem à aplicação. A reserva de descontos de empréstimos usa uma porta e participa na mesma transacção. Em Payments, a aprovação confirma o estado e grava a decisão dentro da unidade de trabalho; as respostas devolvem DTOs. PDFs, armazenamento e consultas consolidadas entram pelos composition roots.

Os registos extensíveis preservam os payloads JSON existentes para manter compatibilidade. Há serviços extensos e adaptadores de leitura que consultam modelos de outros módulos. A tipagem integral desses payloads, a divisão adicional por casos de uso e o isolamento físico das consultas entre bounded contexts são evoluções que a auditoria de imports não valida. Zero violações automatizadas não equivale a uma certificação completa de DDD ou Clean Code.

## Verificação

`src/tests/integration/modular-persistence.test.ts` verifica rollback entre colecções, expiração do contexto, idempotência de uploads e pagamentos, quotas, aprovação independente, titularidade de relatórios, isolamento entre empresas e versões de cenários e modelos de recibo. O fluxo salarial mantém testes próprios de cálculo, revisão e encerramento. Não executar migrações ou alterar bases de produção para validar esta refactorização.
