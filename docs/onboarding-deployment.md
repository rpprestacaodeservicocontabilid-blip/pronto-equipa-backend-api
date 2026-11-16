# Onboarding

## Fluxo implementado

O módulo utiliza o ORM Sequelize existente na aplicação. O responsável cria a sua conta e verifica o e-mail através de Auth. As rotas de Onboarding exigem JWT e validam a titularidade do processo sem exigir um tenant previamente criado.

1. POST /onboarding/applications com operationKey, acceptedTerms=true e termsVersion.
2. PUT /onboarding/applications/:id/company, plan, organization ou payroll-settings com `{version,data}`. A versão devolvida pelo processo protege alterações concorrentes.
3. POST validate-readiness e submit. A submissão exige e-mail verificado, dados empresariais, plano e parâmetros salariais, incluindo regra legal publicada.
4. SUPER_ADMIN decide em /onboarding/admin/applications/:id/approve, reject ou request-info, com reason. O requerente não pode aprovar a sua própria adesão.
5. POST /onboarding/applications/:id/activate inicia o provisionamento. A empresa, papel e vínculo são criados numa transacção no módulo Tenancy. O slug persistente do processo permite recuperar falhas sem criar outra empresa.
6. Organization cria departamentos e centros de custo por códigos estáveis. Subscriptions cria a subscrição pela chave do processo. Platform Billing recebe a conta fiscal. Planos pagos ficam AWAITING_PAYMENT; a empresa só passa de PENDING para ACTIVE quando a subscrição está ACTIVE ou TRIALING.

O runtime verifica pagamentos e recupera execuções interrompidas com lease de dez minutos. Falhas persistem no processo e podem ser retomadas pelo proprietário pela rota activate. O histórico transaccional em onboarding_events preserva decisões e resultados. A listagem administrativa tem limite de cem registos.

## Instalação

Aplicar 20261116000002-create-onboarding.js depois das migrações de users e companies. Os módulos Subscriptions, Organization e Platform Billing precisam das respectivas tabelas. A versão publicada do plano deve existir. Configurar as regras e séries de facturação conforme platform-billing-deployment.md.

## Extensões de adesão

Aplicar também 20261116000004-create-onboarding-resources.js. A tabela onboarding_resources guarda convites, documentos pré-tenant e lotes de importação. As verificações são autorizadas pelo proprietário do processo e não pelo header de empresa.

POST /onboarding/admin/applications cria modalidades ADMIN_ASSISTED, SALES_ASSISTED, MIGRATION, ENTERPRISE ou INVITATION. POST /onboarding/admin/applications/:id/invitations recebe email e devolve um token uma única vez para entrega autorizada. Guarda apenas SHA256 e validade de vinte e quatro horas. POST /onboarding/invitations/accept exige utilizador autenticado com e-mail verificado correspondente; transfere a titularidade e invalida a aprovação anterior. O novo responsável deve aceitar os termos em POST /applications/:id/consent.

POST /applications/:id/documents inicia upload privado S3 de PDF/PNG/JPEG até cinco MiB. POST /applications/:id/documents/:documentId/submit verifica tamanho e ClamAV; indisponibilidade do scanner resulta em quarentena. GET documents lista metadados e GET documents/:documentId/download emite URL curta apenas para ficheiros limpos. Configurar as variáveis S3 e ClamAV documentadas no módulo Documents. O armazenamento pré-tenant utiliza prefixo técnico de quarentena e identificadores aleatórios, com metadados associados ao processo.

POST /applications/:id/imports recebe operationKey e rows de trabalhadores. POST imports/contracts e imports/salaries validam os schemas dos módulos respectivos. As importações exigem empresa já activada; GET imports apresenta resultados por linha. O runtime processa lotes persistidos; trabalhadores usam IDs estáveis e reservas de ACTIVE_EMPLOYEES em Subscriptions. Corrigir linhas rejeitadas e submeter um novo lote com nova chave. Contratos e remunerações são criados pelos módulos proprietários.

payroll-settings passa a receber effectiveFrom e components, validados por Salary Structure. O provisionamento cria o calendário de trabalho em Organization e componentes salariais pelos respectivos casos de uso. Não publica automaticamente componentes nem estruturas remuneratórias que exigem aprovação própria.

O runtime envia alterações de estado para o centro pessoal de Notifications utilizando o modelo global ONBOARDING_STATUS, deduplicado por processo, responsável e estado. Activar o runtime de Notifications e aplicar a sua migração. As comunicações desta integração são IN_APP; não enviam convites por e-mail automaticamente.

## Limitações explícitas

Esta implementação cobre o fluxo autenticado e as extensões acima. Permanecem políticas/formulários configuráveis, verificação telefónica, importação directa de ficheiros XLSX, retenção/expiração e relatórios administrativos completos. As importações actuais recebem JSON estruturado. A revisão administrativa de adesão é obrigatória. Os parâmetros salariais não substituem a validação do primeiro payroll. Os eventos constituem histórico e ainda não têm dispatcher externo próprio.

As migrações não foram aplicadas. O ambiente de desenvolvimento está configurado para SQLite; integrações financeiras utilizam PostgreSQL. Antes de produção executar verificações reais de isolamento, concorrência, recuperação e activação condicionada ao pagamento.

A pré-visualização CSV está disponível em POST imports/preview com kind e csv. Devolve dados validados e erros por linha sem criar registos. Submeter as linhas aprovadas para o endpoint do tipo correspondente. POST /onboarding/admin/applications/:id/documents/:documentId/decision regista revisão independente de documentos limpos. Configurar ONBOARDING_REQUIRED_DOCUMENTS para bloquear submissão e activação sem o número mínimo de documentos VALIDATED.
