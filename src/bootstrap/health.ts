/**
 * ============================================================
 * HEALTH REGISTRY — prontidão real da aplicação (BOOT-004)
 * ============================================================
 *
 * Cada módulo regista aqui o seu estado. O endpoint de
 * readiness (`/health/ready`) devolve o agregado:
 *
 *   - qualquer dependência CRÍTICA em `down`  → `down`  (503);
 *   - qualquer dependência não crítica degradada → `degraded` (200);
 *   - tudo operacional                         → `up`    (200).
 */

import type { HealthStatus } from "./types/application-context";

export interface HealthCheckSnapshot {
  name: string;
  status: HealthStatus;
  critical: boolean;
}

export interface HealthSnapshot {
  status: HealthStatus;
  checks: HealthCheckSnapshot[];
}

interface Entry {
  status: HealthStatus;
  critical: boolean;
}

export class HealthRegistry {
  private readonly checks = new Map<string, Entry>();

  set(name: string, status: HealthStatus, critical = false): void {
    this.checks.set(name, { status, critical });
  }

  remove(name: string): void {
    this.checks.delete(name);
  }

  has(name: string): boolean {
    return this.checks.has(name);
  }

  clear(): void {
    this.checks.clear();
  }

  snapshot(): HealthSnapshot {
    const checks: HealthCheckSnapshot[] = [...this.checks.entries()].map(
      ([name, entry]) => ({ name, ...entry }),
    );

    let status: HealthStatus = "up";

    for (const check of checks) {
      if (check.critical && check.status === "down") {
        return { status: "down", checks };
      }

      if (check.status !== "up" && status === "up") {
        status = "degraded";
      }
    }

    return { status, checks };
  }

  get status(): HealthStatus {
    return this.snapshot().status;
  }
}
