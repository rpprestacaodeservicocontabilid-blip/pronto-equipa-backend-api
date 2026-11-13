import type { EnvVars } from "./env";
import { parseOrigins } from "./env";

export interface CorsConfig {
  /**
   * `true` quando NÃO há origens configuradas fora de produção:
   * o middleware reflete a origem do pedido (conveniência de dev,
   * comportamento histórico). Nunca `true` em produção.
   */
  allowAnyOrigin: boolean;
  origins: string[];
  credentials: boolean;
  methods: string[];
  allowedHeaders: string[];
}

/**
 * Origens autorizadas.
 *
 * REGRA DE OURO: em produção NUNCA `*` nem origens de loopback
 * (`localhost`/`127.0.0.1`) e a lista NUNCA pode estar vazia —
 * só origens explícitas do frontend. Em desenvolvimento/teste,
 * sem configuração, reflete-se a origem do pedido.
 *
 * Este módulo apenas DERIVA e valida as opções; quem as aplica é
 * o middleware em `bootstrap/register-middlewares`.
 */
export function createCorsConfig(
  env: Pick<EnvVars, "NODE_ENV" | "FRONTEND_URL" | "CORS_ORIGIN">,
): CorsConfig {
  const isProd = env.NODE_ENV === "production";
  const raw = [env.CORS_ORIGIN, env.FRONTEND_URL].filter(Boolean).join(",");
  const origins = parseOrigins(raw);

  const problems: string[] = [];

  if (isProd && origins.length === 0) {
    problems.push(
      "CORS_ORIGIN or FRONTEND_URL is required in production (no wildcard, no empty list)",
    );
  }

  for (const origin of origins) {
    if (origin === "*") {
      problems.push('CORS wildcard "*" is not allowed');
      continue;
    }

    if (!/^https?:\/\//.test(origin)) {
      problems.push(`CORS origin must include scheme: ${origin}`);
      continue;
    }

    if (isProd) {
      const host = safeHost(origin);
      if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") {
        problems.push(
          `CORS loopback origin not allowed in production: ${origin}`,
        );
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `[config] invalid CORS configuration:\n - ${problems.join("\n - ")}`,
    );
  }

  return {
    allowAnyOrigin: !isProd && origins.length === 0,
    origins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Company-Id",
      "X-Request-Id",
    ],
  };
}

function safeHost(origin: string): string {
  try {
    return new URL(origin).hostname;
  } catch {
    return "";
  }
}
