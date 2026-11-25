import type { Queue, Worker } from 'bullmq';

export const OPERATIONS_QUEUE_SOURCES = 'platform.operations.queueSources';
const jobStates = ['waiting', 'active', 'completed', 'failed', 'delayed', 'paused'] as const;
type JobCounts = Record<(typeof jobStates)[number], number>;

interface RuntimeHandles {
  queue?: Pick<Queue, 'name' | 'getJobCounts' | 'isPaused'>;
  worker?: Pick<Worker, 'isRunning' | 'isPaused'>;
}
type WorkerState = 'RUNNING' | 'PAUSED' | 'STOPPED' | 'NOT_STARTED';
export interface QueueView {
  key: string;
  name: string | null;
  status: 'ACTIVE' | 'PAUSED' | 'NOT_STARTED' | 'UNAVAILABLE';
  localWorker: WorkerState;
  counts: JobCounts | null;
}
export type QueueReader = () => Promise<QueueView>;

export function queueReader(key: string, getHandles: () => RuntimeHandles, timeoutMs = 2000): QueueReader {
  let inFlight: Promise<Pick<QueueView, 'status' | 'counts'>> | undefined;
  return async () => {
    const { queue, worker } = getHandles();
    const localWorker = !worker ? 'NOT_STARTED' : worker.isPaused() ? 'PAUSED' : worker.isRunning() ? 'RUNNING' : 'STOPPED';
    if (!queue) return { key, name: null, status: 'NOT_STARTED', localWorker, counts: null };
    const unavailable = { status: 'UNAVAILABLE', counts: null } as const;

    // An offline Redis command can remain pending after the HTTP deadline.
    // Share that request until it settles so refreshing cannot accumulate reads.
    inFlight ??= Promise.all([queue.getJobCounts(...jobStates), queue.isPaused()])
      .then(([raw, paused]) => ({
        status: paused ? 'PAUSED' as const : 'ACTIVE' as const,
        counts: {
          waiting: raw.waiting ?? 0, active: raw.active ?? 0, completed: raw.completed ?? 0,
          failed: raw.failed ?? 0, delayed: raw.delayed ?? 0, paused: raw.paused ?? 0,
        },
      }))
      .catch(() => unavailable)
      .finally(() => { inFlight = undefined; });

    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const deadline = new Promise<typeof unavailable>(resolve => {
        timeout = setTimeout(() => resolve(unavailable), timeoutMs);
      });
      const result = await Promise.race([inFlight, deadline]);
      return { key, name: queue.name, localWorker, ...result };
    } finally { clearTimeout(timeout); }
  };
}
