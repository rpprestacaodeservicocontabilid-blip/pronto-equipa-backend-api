Esta é a documentação técnica oficial para o **Módulo Financeiro (`finance`)** da plataforma Tukio. Esta documentação foi desenhada para servir de guia tanto para a equipa atual como para o *onboarding* de novos engenheiros de software.

---

# Documentação Técnica: Módulo Financeiro (`finance`)

O módulo `finance` é responsável por gerir todo o fluxo de faturação, receção de pagamentos, custódia temporária de valores (Carteira Virtual), divisão de taxas (*Split*) e liquidação de valores para parceiros (donos de campos e equipas de arbitragem ou transmissão).

A arquitetura segue rigorosamente os princípios de **Clean Architecture** e **DDD (Domain-Driven Design)**, garantindo isolamento total das regras de negócio contra fatores externos como bases de dados ou gateways de pagamento.

---

## 1. Visão Geral do Modelo de Negócio

Sempre que uma partida é criada via módulos `Matchmaking` e `Match`, o utilizador efetua um único pagamento. Internamente, a plataforma desdobra este valor (*Split*) em quatro frações de destino:

1. **Taxa da Plataforma (Tukio Fee):** Comissão de serviço retida pela aplicação.
2. **Taxa do Campo:** Valor destinado ao proprietário do recinto desportivo.
3. **Taxa de Arbitragem:** Destinado à equipa de juízes contratada (opcional).
4. **Taxa de Transmissão:** Destinado à equipa de cobertura ao vivo (opcional).

O dinheiro destinado aos parceiros (campos, árbitros, câmaras) não é transferido imediatamente para as suas contas bancárias. O saldo **acumula numa Carteira Virtual (`Wallet`)** dentro da aplicação, permitindo que estes utilizadores solicitem o levantamento manual (*Payout/Withdrawal*) via IBAN.

---

## 2. Estrutura de Pastas e Arquitetura

O módulo está auto-contido e dividido em três camadas principais, além de utilitários e validações:

```text
modules/
 └── finance/
     ├── domain/          # Regras de Negócio Puras (Entidades, Interfaces, Enums e Eventos)
     ├── application/     # Casos de Uso (Orquestração do fluxo da aplicação)
     ├── infrastructure/  # Implementações Tecnológicas (Rotas, Controllers, Gateways e Base de Dados)
     └── finance.module.ts

```

---

## 3. Especificação das Camadas

### A. Camada de Domínio (`domain/`)

Contém o núcleo imutável da aplicação. Não possui dependências de nenhuma biblioteca externa ou framework.

#### Entidades e Agregados (`domain/entities/`)

* **`payment.entity.ts`:** Representa a intenção e o estado de um pagamento associado a uma partida (`matchId`). Contém o estado atual do ciclo de pagamento.
* **`wallet.entity.ts`:** Representa a conta digital interna de um parceiro (campo ou árbitro). Controla o saldo disponível e saldo cativo.
* **`transaction.entity.ts`:** O livro-razão (*Ledger*). Cada movimentação de saldo (Crédito por jogo, Débito por levantamento) gera um registo imutável. O saldo da `Wallet` deve coincidir rigorosamente com o somatório das suas transações.
* **`invoice.entity.ts`:** Documento fiscal ou recibo digital gerado após a confirmação do pagamento.

#### Objetos de Valor (`domain/value-objects/`)

* **`price-breakdown.vo.ts`:** Responsável pela matemática financeira do sistema. Garante que a soma das taxas individuais seja exatamente igual ao valor cobrado ao cliente, mitigando erros de arredondamento.

#### Repositórios - Interfaces (`domain/repositories/`)

Interfaces que definem os contratos de persistência.

* `payment.repository.interface.ts`
* `wallet.repository.interface.ts`
* `transaction.repository.interface.ts`
* `invoice.repository.interface.ts`

---

### B. Camada de Aplicação (`application/`)

Implementa os fluxos de história de usuário da aplicação (Casos de Uso).

* **`CreatePaymentUseCase`:** Avalia o custo total da partida (com os opcionais de arbitragem/live), gera o desdobramento e invoca o Gateway para obter os dados de pagamento.
* **`ConfirmPaymentUseCase`:** Acionado pelo Gateway ou Webhook para validar que o pagamento foi liquidado com sucesso. Atualiza o estado do pagamento e dispara o evento de confirmação.
* **`ProcessSplitPaymentUseCase`:** Escuta o evento de confirmação, calcula a quota-parte de cada interveniente e atualiza as respetivas `Wallets` na base de dados, criando os registos de `Transaction`.
* **`WithdrawFundsUseCase`:** Permite aos donos de campos ou árbitros solicitar a transferência do seu saldo acumulado para uma conta bancária real.
* **`CancelPaymentUseCase` / `RefundPaymentUseCase`:** Gestão de estornos e cancelamentos em caso de desistências em conformidade com as regras da plataforma.

---

### C. Camada de Infraestrutura (`infrastructure/`)

Contém os adaptadores e detalhes técnicos para o mundo exterior.

```text
infrastructure/
 ├── routes/          # Definição e exposição dos endpoints HTTP
 ├── controllers/     # Receção de pedidos HTTP, extração de payloads e resposta
 ├── validations/     # Data Transfer Objects (DTOs) e esquemas de validação (Zod/Joi)
 ├── repositories/    # Implementação real das queries (ex: Prisma, TypeORM)
 └── gateways/        # Conexão com APIs externas (Stripe, PayPal, APIs de Referências MCX)

```

---

## 4. API Reference: Endpoints e Rotas

### Pagamentos Públicos / Clientes (`payment.routes.ts`)

#### 1. Criar Intenção de Pagamento

* **Endpoint:** `POST /finance/payments`
* **Autenticação:** Requerida (Token do utilizador jogador)
* **Payload (DTO):**
```json
{
  "matchId": "uuid-da-partida",
  "gateway": "MULTICAIXA" // ou "STRIPE", "PAYPAY"
}

```


* **Resposta Esperada (201 Created):**
```json
{
  "paymentId": "uuid-do-pagamento",
  "status": "PENDING",
  "amount": 25000.00,
  "currency": "AOA",
  "paymentData": {
    "entidade": "00211",
    "referencia": "123456789",
    "dataLimite": "2026-06-03T23:59:59Z"
  }
}

```



#### 2. Consultar Estado de Pagamento

* **Endpoint:** `GET /finance/payments/:id`
* **Autenticação:** Requerida

---

### Webhooks de Provedores FinTech (`webhook.routes.ts`)

#### 1. Webhook de Confirmação Multicaixa

* **Endpoint:** `POST /finance/webhooks/multicaixa`
* **Autenticação:** Nenhuma (Protegido por assinatura de chave secreta no Header)
* **Descrição:** Endpoint assíncrono chamado pelo integrador bancário quando o utilizador paga no ATM ou Internet Banking.

---

### Gestão de Carteira e Levantamentos (`wallet.routes.ts`)

#### 1. Consultar Saldo Atual

* **Endpoint:** `GET /finance/wallets/me`
* **Autenticação:** Requerida (Dono do Campo / Árbitro)
* **Resposta Esperada (200 OK):**
```json
{
  "walletId": "uuid-da-carteira",
  "balanceAvailable": 145000.00,
  "balanceLocked": 0.00,
  "currency": "AOA"
}

```



#### 2. Solicitar Levantamento (Payout)

* **Endpoint:** `POST /finance/wallets/me/withdraw`
* **Autenticação:** Requerida
* **Payload (DTO):**
```json
{
  "amount": 50000.00,
  "iban": "AO06004000001234567890123",
  "accountHolder": "Nome do Proprietário ou Empresa"
}

```


* **Resposta Esperada (202 Accepted):**
```json
{
  "withdrawalId": "uuid-da-solicitacao",
  "status": "PROCESSING",
  "message": "O seu pedido de levantamento foi registado e está a ser processado."
}

```



---

## 5. Fluxo de Estado de um Pagamento

```
[ PENDING ] ───( Confirmação Webhook )───> [ PAID ] ───( Dispara Split Interno )
     │
     └───( Tempo Limite / Cancelamento )───> [ CANCELLED ]

```

---

## 6. Políticas de Segurança Críticas

1. **Idempotência:** O caso de uso `ConfirmPaymentUseCase` deve ser estritamente idempotente. Se o mesmo webhook disparar duas vezes para o mesmo pagamento, o sistema não deve efetuar o split de saldos repetidamente.
2. **Database Transactions:** A operação de *Split* de pagamentos (onde o saldo da plataforma aumenta e o do parceiro também) deve correr dentro de uma transação da Base de Dados (*Database Transaction*). Se uma atualização falhar, toda a operação deve sofrer *rollback*.
3. **Validação de Webhooks:** Todos os controladores de webhook devem validar os cabeçalhos de segurança (como o `X-Signature`) para evitar simulações fraudulentas de injeção de capital.