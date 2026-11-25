import { Router } from 'express';

type ProviderState = 'REGISTERED' | 'CONFIGURED' | 'NOT_CONFIGURED' | 'ACTIVE' | 'DISABLED' | 'UNKNOWN';
export interface ProviderSummary {
  id: string;
  name: string;
  type: string;
  state: ProviderState;
  capabilities?: string[];
}
type Source = 'PAYMENTS' | 'NOTIFICATIONS' | 'AI';
interface ProviderSource {
  read: () => Promise<{ items: ProviderSummary[]; total: number }> | { items: ProviderSummary[]; total: number };
  authorize?: (actor: number) => Promise<boolean>;
}

export function createIntegrationsModule(sources: Record<Source, ProviderSource>) {
  const routes = Router();
  routes.get('/catalog', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const actor = req.user?.userId;
    if (!actor) {
      res.status(401).json({ message: 'Authentication required.' });
      return;
    }

    const catalog = await Promise.all((Object.keys(sources) as Source[]).map(async source => {
      const integration = sources[source];
      try {
        if (integration.authorize && !(await integration.authorize(actor))) {
          return { source, status: 'RESTRICTED' };
        }
        const started = performance.now();
        let timer: NodeJS.Timeout | undefined;
        const deadline = new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Inventory read timed out')), 5000);
        });
        const { items, total } = await Promise.race([
          Promise.resolve().then(() => integration.read()), deadline,
        ]).finally(() => clearTimeout(timer));
        const readDurationMs = Math.round(performance.now() - started);
        const providers = items.map(({id, name, type, state, capabilities}) => ({ id, name, type, state, capabilities }));
        return { source, status: 'AVAILABLE', providers, total, readDurationMs };
      } catch {
        return { source, status: 'UNAVAILABLE' };
      }
    }));
    res.json({ data: { sources: catalog, observedAt: new Date().toISOString() } });
  });
  return routes;
}
