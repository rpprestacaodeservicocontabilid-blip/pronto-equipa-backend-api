# Módulo Payments

## Implementado

- Persistência multiempresa para instruções, lotes, itens, ordens, tentativas, transações, aprovações, contas bancárias, configurações de provedores, extratos, reconciliações, devoluções e inbox/outbox.
- Chaves idempotentes por instrução e ordem, unicidade do resultado salarial e relações entre tabelas compostas por `companyId` e identificador.
- Consumo automático do outbox `payroll.payment-instructions.prepared`, com inbox durável, tentativas e backoff. O consumidor inicia e termina com o ciclo de vida da aplicação.
- Validação da instrução contra um resultado salarial da mesma empresa e execução fechada; o montante e a moeda são derivados do resultado persistido.
- Aprovação financeira separada, bloqueio de autoaprovação e de execução pelo aprovador, revalidação da conta de origem e invalidação da aprovação quando os dados dessa conta mudam.
- Política por empresa para número de aprovações e aprovações adicionais acima de um limite monetário.
- Montantes em strings decimais e somas em cêntimos inteiros. Instruções repetidas, pagamentos parciais no lote e sobrepagamentos são bloqueados.
- Encriptação AES-256-GCM para números de conta e beneficiário, com apresentação mascarada e registo de auditoria sem divulgar os números completos.
- Tentativas idempotentes através de uma porta de provedor. Resultados incertos ficam em `SUBMISSION_UNKNOWN`; uma instrução assim não é reenviada automaticamente.
- Consulta de estado ao provedor por `POST /orders/:id/refresh-status`; a atualização de estado não aceita confirmação manual de um utilizador.
- Importação estruturada de linhas de extrato com hash, deduplicação, reconciliação por referência/valor/moeda, exceções e resolução com motivo e evidências.
- Exportação CSV real para relatórios. O endpoint de ficheiro bancário falha de forma explícita enquanto não existir um adaptador com o formato exigido pelo banco.
- Catálogo de permissões `payments:*`; a atribuição a papéis continua a ser uma decisão administrativa explícita.

## Ativação

1. Aplicar as migrações `202611130001-create-payroll-payments.js` e `20261114000002-seed-payments-permissions.js` com o comando de migração já usado pelo backend.
2. Definir `PAYMENTS_PII_ENCRYPTION_KEY` como uma chave hexadecimal de 64 caracteres (32 bytes). A aplicação recusa guardar dados bancários se a chave estiver ausente ou inválida; o arranque de produção também valida esta configuração.
3. Implementar e injetar um `PaymentProviderPort` contratado e autenticado em `createPaymentsModule`. Registar a configuração do provedor como `ACTIVE` para cada empresa. Sem ambos, a execução é recusada.
4. Atribuir as permissões `payments:*` a papéis aprovados. As migrações registam as permissões, mas não concedem acesso automaticamente.

## Limites explícitos

Não havia especificação de API, ficheiro bancário, credenciais ou mecanismo de assinatura de nenhum banco. Por isso, nenhum provedor angolano fictício foi instalado. A execução real, callbacks assinados e geração de ficheiros específicos de banco dependem do contrato e dos dados técnicos do provedor escolhido. O estado pode ser consultado pelo adaptador; um endpoint de callback só deve ser adicionado junto com as regras de assinatura e payload do banco. PDF e XLSX de relatórios também não estão implementados; a aplicação só entrega CSV e não afirma que um ficheiro foi gerado quando não foi.
