import { BillingService } from './billing.service';

import { amount, cents, billingError } from '../../domain/billing-calculation';
import { createHash, randomUUID } from 'crypto';
export class BillingOperationsService extends BillingService {
  credit(
    companyId: number,
    actor: number,
    input: { invoiceId: string; amount: string; reason: string; operationKey: string },
  ) {
    return this.transaction(companyId, async (tx) => {
      const old = await this.store.findOne({
        where: { companyId, kind: 'CREDIT_NOTE', key: input.operationKey },
        transaction: tx,
      });
      if (old) {
        if (JSON.stringify(old.data.request) !== JSON.stringify(input))
          throw billingError('Chave reutilizada.', 409);
        return old;
      }
      const invoice = await this.get(companyId, input.invoiceId, 'INVOICE', tx);
      if (invoice.status === 'DRAFT') throw billingError('Factura ainda não emitida.');
      const value = cents(input.amount),
        credited = cents(invoice.data.credited) + value;
      if (value <= BigInt(0) || credited > cents(invoice.data.total) - cents(invoice.data.paid))
        throw billingError('Crédito excede o saldo em aberto.');
      await this.store.update(
        invoice,
        { data: { ...invoice.data, credited: amount(credited) } },
        { transaction: tx },
      );
      const snapshot = {
        ...(await this.numberDocument(companyId, 'NC', tx)),
        buyer: invoice.data.buyer,
        request: input,
        invoiceId: invoice.id,
        originalNumber: invoice.data.number,
        amount: input.amount,
        currency: invoice.data.currency,
        createdBy: actor,
      };
      const row = await this.create(
        companyId,
        'CREDIT_NOTE',
        input.operationKey,
        'ISSUED',
        {
          ...snapshot,
          documentHash: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'),
        },
        tx,
      );
      await this.event(
        companyId,
        actor,
        'platform-billing.credit-note.issued',
        { id: row.id, invoiceId: invoice.id },
        tx,
      );
      return row;
    });
  }
  refund(
    companyId: number,
    actor: number,
    input: { paymentId: string; amount: string; reason: string; operationKey: string },
  ) {
    return this.transaction(companyId, async (tx) => {
      const old = await this.store.findOne({
        where: { companyId, kind: 'REFUND', key: input.operationKey },
        transaction: tx,
      });
      if (old) {
        if (old.data.paymentId !== input.paymentId || cents(old.data.amount) !== cents(input.amount) || old.data.reason !== input.reason)
          throw billingError('Chave reutilizada.', 409);
        return old;
      }
      const payment = await this.get(companyId, input.paymentId, 'PAYMENT', tx);
      if (payment.status !== 'CONFIRMED') throw billingError('Pagamento não confirmado.');
      const reserved = await this.refundReserved(companyId, payment.id, tx);
      const applied = payment.data.invoiceId ? 0n : cents(payment.data.allocated ?? '0.00');
      if (
        cents(input.amount) <= BigInt(0) ||
        applied + reserved + cents(input.amount) > cents(payment.data.amount)
      )
        throw billingError('Reembolso excede o pagamento disponível.');
      const row = await this.create(
        companyId,
        'REFUND',
        input.operationKey,
        'REQUESTED',
        { ...input, requestedBy: actor, currency: payment.data.currency },
        tx,
      );
      await this.event(companyId, actor, 'platform-billing.refund.requested', { id: row.id }, tx);
      return row;
    });
  }
  decideRefund(companyId: number, actor: number, id: string, approve: boolean) {
    return this.transaction(companyId, async (tx) => {
      const row = await this.get(companyId, id, 'REFUND', tx);
      if (row.status !== 'REQUESTED') throw billingError('Pedido já decidido.', 409);
      if (row.data.requestedBy === actor) throw billingError('Exige outro aprovador.', 403);
      await this.store.update(
        row,
        { status: approve ? 'APPROVED' : 'REJECTED', data: { ...row.data, approvedBy: actor } },
        { transaction: tx },
      );
      await this.event(companyId, actor, 'platform-billing.refund.decided', { id, approve }, tx);
      return row;
    });
  }
  executeRefund(companyId: number, actor: number, id: string, evidence: string) {
    return this.transaction(companyId, async (tx) => {
      const row = await this.get(companyId, id, 'REFUND', tx);
      if (row.status === 'COMPLETED') return row;
      if (row.status !== 'APPROVED') throw billingError('Reembolso não aprovado.');
      await this.store.update(
        row,
        {
          status: 'COMPLETED',
          data: { ...row.data, evidence, executedBy: actor, completedAt: new Date().toISOString() },
        },
        { transaction: tx },
      );
      await this.event(
        companyId,
        actor,
        'platform-billing.refund.completed',
        { id, amount: row.data.amount },
        tx,
      );
      return row;
    });
  }
  importStatement(
    companyId: number,
    actor: number,
    input: {
      operationKey: string;
      entries: Array<{ reference: string; amount: string; currency: string; occurredAt: string }>;
    },
  ) {
    return this.transaction(companyId, async (tx) => {
      const old = await this.store.findOne({
        where: { companyId, kind: 'STATEMENT', key: input.operationKey },
        transaction: tx,
      });
      if (old) return old;
      for (const entry of input.entries) {
        cents(entry.amount);
        const known = await this.store.findOne({
          where: { companyId, kind: 'BANK_ENTRY', key: entry.reference },
          transaction: tx,
        });
        if (known) throw billingError('Movimento bancário duplicado.', 409);
        await this.create(companyId, 'BANK_ENTRY', entry.reference, 'UNMATCHED', entry, tx);
      }
      const row = await this.create(
        companyId,
        'STATEMENT',
        input.operationKey,
        'IMPORTED',
        { count: input.entries.length, importedBy: actor },
        tx,
      );
      await this.event(companyId, actor, 'platform-billing.statement.imported', { id: row.id }, tx);
      return row;
    });
  }
  reconcile(companyId: number, actor: number, entryId: string, paymentId: string) {
    return this.transaction(companyId, async (tx) => {
      const entry = await this.get(companyId, entryId, 'BANK_ENTRY', tx),
        payment = await this.get(companyId, paymentId, 'PAYMENT', tx);
      if (entry.status === 'MATCHED') {
        if (entry.data.paymentId === paymentId) return entry;
        throw billingError('Movimento já reconciliado.', 409);
      }
      if (!['UNMATCHED', 'DISPUTED'].includes(entry.status))
        throw billingError('Movimento indisponível para reconciliação.', 409);
      if (
        payment.status !== 'CONFIRMED' ||
        entry.data.currency !== payment.data.currency ||
        cents(entry.data.amount) !== cents(payment.data.amount)
      )
        throw billingError('Pagamento e movimento incompatíveis.');
      const used = await this.store.findOne({
        where: { companyId, kind: 'RECONCILIATION', status: 'MATCHED', 'data.paymentId': paymentId },
        transaction: tx,
      });
      if (used) throw billingError('Pagamento já reconciliado.', 409);
      const match = await this.create(
        companyId,
        'RECONCILIATION',
        randomUUID(),
        'MATCHED',
        { entryId, paymentId, actor, amount: entry.data.amount, currency: entry.data.currency },
        tx,
      );
      await this.store.update(
        entry,
        { status: 'MATCHED', data: { ...entry.data, paymentId, reconciliationId: match.id } },
        { transaction: tx },
      );
      await this.event(
        companyId,
        actor,
        'platform-billing.reconciliation.completed',
        { id: match.id, entryId, paymentId },
        tx,
      );
      return entry;
    });
  }

  reviewBankEntry(companyId: number, actor: number, entryId: string, reason: string) {
    return this.transaction(companyId, async tx => {
      const entry = await this.get(companyId, entryId, 'BANK_ENTRY', tx);
      if (!['UNMATCHED', 'DISPUTED'].includes(entry.status)) throw billingError('O movimento já está reconciliado.', 409);
      if (entry.status === 'DISPUTED' && entry.data.reviewReason === reason) return entry;
      await this.store.update(entry, {
        status: 'DISPUTED', data: { ...entry.data, reviewReason: reason, reviewedBy: actor, reviewedAt: new Date().toISOString() },
      }, { transaction: tx });
      await this.event(companyId, actor, 'platform-billing.reconciliation.disputed', { entryId, reason }, tx);
      return entry;
    });
  }

  reverseReconciliation(companyId: number, actor: number, id: string, reason: string) {
    return this.transaction(companyId, async tx => {
      const match = await this.get(companyId, id, 'RECONCILIATION', tx);
      if (match.status === 'REVERSED') return match;
      if (match.status !== 'MATCHED') throw billingError('Reconciliação indisponível para reversão.', 409);
      const { entryId, paymentId } = match.data;
      const entry = await this.get(companyId, entryId, 'BANK_ENTRY', tx);
      if (entry.status !== 'MATCHED' || entry.data.paymentId !== paymentId ||
        (entry.data.reconciliationId && entry.data.reconciliationId !== id))
        throw billingError('O movimento já mudou de reconciliação.', 409);
      await this.store.update(match, {
        status: 'REVERSED', data: { ...match.data, reversalReason: reason, reversedBy: actor, reversedAt: new Date().toISOString() },
      }, { transaction: tx });
      await this.store.update(entry, {
        status: 'UNMATCHED', data: { ...entry.data, paymentId: null, reconciliationId: null },
      }, { transaction: tx });
      await this.event(companyId, actor, 'platform-billing.reconciliation.reversed', { id, entryId, paymentId, reason }, tx);
      return match;
    });
  }
}
