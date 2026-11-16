import { RequestHandler } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { NotificationsService } from '../../application/use-cases/notifications.service';
export const notificationCallback =
  (service: NotificationsService): RequestHandler =>
  async (req, res, next) => {
    try {
      const secret = process.env.NOTIFICATIONS_CALLBACK_SECRET;
      if (!secret) {
        res.sendStatus(503);
        return;
      }
      const timestamp = String(req.headers['x-notification-timestamp'] || ''),
        payload = String(req.headers['x-notification-payload'] || ''),
        signature = String(req.headers['x-notification-signature'] || '');
      if (
        !/^\d{13}$/.test(timestamp) ||
        Math.abs(Date.now() - Number(timestamp)) > 300000 ||
        payload.length > 12000 ||
        !/^[a-f0-9]{64}$/.test(signature)
      ) {
        res.sendStatus(401);
        return;
      }
      const digest = createHmac('sha256', secret).update(`${timestamp}\n${payload}`).digest();
      if (!timingSafeEqual(digest, Buffer.from(signature, 'hex'))) {
        res.sendStatus(401);
        return;
      }
      const data = z
        .object({
          companyId: z.number().int().positive().nullable(),
          deliveryId: z.string().uuid(),
          providerMessageId: z.string().min(1),
          status: z.enum(['DELIVERED', 'FAILED_PERMANENT']),
        })
        .strict()
        .parse(JSON.parse(Buffer.from(payload, 'base64').toString('utf8')));
      res.json(
        await service.callback(
          data.companyId,
          data.deliveryId,
          data.providerMessageId,
          data.status,
        ),
      );
    } catch (error) {
      next(error);
    }
  };
