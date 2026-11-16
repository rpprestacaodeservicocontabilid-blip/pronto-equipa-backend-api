import { createHmac, timingSafeEqual } from 'crypto';
import { RequestHandler } from 'express';
import { z } from 'zod';
import { BillingCommercialService } from '../../application/use-cases/billing-commercial.service';
/** Adapter contract: provider signs timestamp + newline + exact JSON payload header. */
export function providerWebhook(service: BillingCommercialService): RequestHandler {
  return async (req, res, next) => {
    try {
      const secret = process.env.PLATFORM_BILLING_PROVIDER_WEBHOOK_SECRET;
      if (!secret) {
        res.status(503).json({ message: 'Prestador não configurado.' });
        return;
      }
      const timestamp = String(req.headers['x-billing-timestamp'] || ''),
        payload = String(req.headers['x-billing-payload'] || ''),
        signature = String(req.headers['x-billing-signature'] || '');
      if (
        !/^\d{13}$/.test(timestamp) ||
        Math.abs(Date.now() - Number(timestamp)) > 300000 ||
        payload.length > 12000 ||
        !/^[a-f0-9]{64}$/.test(signature)
      ) {
        res.sendStatus(401);
        return;
      }
      const expected = createHmac('sha256', secret).update(`${timestamp}\n${payload}`).digest();
      if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) {
        res.sendStatus(401);
        return;
      }
      const body = z
        .object({
          companyId: z.number().int().positive(),
          paymentId: z.string().uuid(),
          reference: z.string().min(1),
          provider: z.string().min(1),
          amount: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/),
          currency: z.string().regex(/^[A-Z]{3}$/),
        })
        .strict()
        .parse(JSON.parse(Buffer.from(payload, 'base64').toString('utf8')));
      // The signed payload is authoritative. Provider retries are handled by the payment state.
      const result = await service.confirmProvider(body);
      res.json({ success: true, id: result.id });
    } catch (error) {
      next(error);
    }
  };
}
