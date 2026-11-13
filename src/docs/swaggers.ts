import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { Express } from "express";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",

    info: {
      title: "🏟️ ProntoEquipas API",
      version: "1.0.0",

      description:
        "API completa para gestão de RH e folha salarial multiempresa em Angola: empresas, membros, papéis e permissões, auditoria, autenticação e pagamentos.",

      contact: {
        name: "ProntoEquipas Team",
        email: "support@prontoequipas.com",
      },

      license: {
        name: "ISC",
      },
    },

    servers: [
      {
        url: "http://localhost:3333/api/v1",
        description: "Desenvolvimento",
      },

      {
        url: "https://api.prontoequipas.com/api/v1",
        description: "Produção",
      },
    ],

    /**
     * ==========================================
     * COMPONENTS
     * ==========================================
     */
    components: {

      /**
       * ----------------------------------------
       * SECURITY SCHEMES
       * ----------------------------------------
       */
      securitySchemes: {

        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",

          description:
            "Autenticação via JWT. Utilize o token retornado pelo endpoint de login no formato: Bearer {token}.",
        },
      },

      /**
       * ----------------------------------------
       * REUSABLE SCHEMAS
       * ----------------------------------------
       */
      schemas: {

        /**
         * Generic API response
         */
        ApiResponse: {
          type: "object",

          properties: {
            success: {
              type: "boolean",
              example: true,
            },

            message: {
              type: "string",
              example: "Operação realizada com sucesso.",
            },

            data: {
              type: "object",
              nullable: true,
            },
          },
        },

        /**
         * Generic error response
         */
        ErrorResponse: {
          type: "object",

          properties: {
            success: {
              type: "boolean",
              example: false,
            },

            error: {
              type: "string",
              example: "Ocorreu um erro.",
            },

            code: {
              type: "string",
              example: "VALIDATION_ERROR",
            },
          },
        },

        /**
         * Validation error response
         */
        ValidationErrorResponse: {
          type: "object",

          properties: {
            success: {
              type: "boolean",
              example: false,
            },

            error: {
              type: "string",
              example: "Erro de validação de dados.",
            },

            code: {
              type: "string",
              example: "VALIDATION_ERROR",
            },

            errors: {
              type: "array",

              items: {
                type: "object",

                properties: {
                  field: {
                    type: "string",
                    example: "email",
                  },

                  message: {
                    type: "string",
                    example:
                      "Email inválido.",
                  },
                },
              },
            },
          },
        },
      },

      /**
       * ----------------------------------------
       * REUSABLE RESPONSES
       * ----------------------------------------
       */
      responses: {

        UnauthorizedError: {
          description:
            "Acesso negado - token ausente, inválido ou expirado.",

          content: {
            "application/json": {
              schema: {
                $ref:
                  "#/components/schemas/ErrorResponse",
              },
            },
          },
        },

        ForbiddenError: {
          description:
            "Acesso negado - o utilizador não possui permissão para executar esta operação.",

          content: {
            "application/json": {
              schema: {
                $ref:
                  "#/components/schemas/ErrorResponse",
              },
            },
          },
        },

        ValidationError: {
          description:
            "Erro de validação dos dados enviados.",

          content: {
            "application/json": {
              schema: {
                $ref:
                  "#/components/schemas/ValidationErrorResponse",
              },
            },
          },
        },

        NotFoundError: {
          description:
            "Recurso não encontrado.",

          content: {
            "application/json": {
              schema: {
                $ref:
                  "#/components/schemas/ErrorResponse",
              },
            },
          },
        },

        ConflictError: {
          description:
            "Conflito com o estado atual do recurso.",

          content: {
            "application/json": {
              schema: {
                $ref:
                  "#/components/schemas/ErrorResponse",
              },
            },
          },
        },

        TooManyRequestsError: {
          description:
            "Limite de requisições excedido. Tente novamente mais tarde.",

          content: {
            "application/json": {
              schema: {
                $ref:
                  "#/components/schemas/ErrorResponse",
              },
            },
          },
        },

        InternalServerError: {
          description:
            "Erro interno do servidor.",

          content: {
            "application/json": {
              schema: {
                $ref:
                  "#/components/schemas/ErrorResponse",
              },
            },
          },
        },
      },
    },

    /**
     * ==========================================
     * GLOBAL SECURITY
     * ==========================================
     *
     * Por padrão as rotas são protegidas.
     *
     * Rotas públicas, como:
     * - register
     * - login
     * - refresh
     * - verify-email
     * - forgot-password
     *
     * devem declarar:
     *
     * security: []
     *
     * individualmente.
     */
    security: [
      {
        bearerAuth: [],
      },
    ],

    /**
     * ==========================================
     * API TAGS
     * ==========================================
     */
    tags: [

      {
        name: "Auth",
        description:
          "Autenticação, registro, sessões, verificação de email e recuperação de acesso.",
      },
      {
        name: "Authorization",
        description:
          "Gerenciamento de roles, permissões e autorização de utilizadores.",
      },

      {
        name: "OAuth",
        description:
          "Autenticação e associação de contas através de provedores OAuth.",
      },

      {
        name: "Sessions",
        description:
          "Gerenciamento de sessões autenticadas dos utilizadores.",
      },

      {
        name: "Cities",
        description: "Gerenciamento de cidades, estados e países.",
      },

      {
        name: "Notifications",
        description:
          "Criação, envio, agendamento, leitura e gerenciamento de notificações dos utilizadores.",
      },

      {
        name: "Notification Templates",
        description:
          "Gerenciamento de templates utilizados para criação e envio de notificações.",
      },

      {
        name: "Notification Preferences",
        description:
          "Gerenciamento das preferências e canais de notificações dos utilizadores.",
      },

      {
        name: "Users",
        description:
          "Gerenciamento de usuários.",
      },

      {
        name: "Teams",
        description:
          "Gerenciamento de times.",
      },

      {
        name: "Productivity",
        description:
          "Departamentos da empresa, membros de equipa e gestão de tarefas estilo Jira.",
      },

      {
        name: "Store",
        description:
          "Catálogo da loja (categorias, marcas, produtos e variantes), stock por variante e métricas comerciais.",
      },

      {
        name: "Players",
        description:
          "Gerenciamento de jogadores, estatísticas, capitães e associação a equipas e cidades.",
      },

      {
        name: "Player History",
        description:
          "Registo e gerenciamento do histórico, acontecimentos e verificações dos jogadores.",
      },

      {
        name: "Player Injuries",
        description:
          "Gerenciamento de lesões, recuperação, gravidade e histórico médico-desportivo dos jogadores.",
      },

      {
        name: "Player Ratings",
        description:
          "Avaliações de jogadores, atributos, médias, verificações e histórico de avaliações.",
      },
      {
        name: "Player Statistics",
        description:
          "Gerenciamento de estatísticas, métricas, totais e médias dos jogadores.",
      },

      {
        name: "Player Suspensions",
        description:
          "Gerenciamento de suspensões disciplinares, cumprimento, levantamento e histórico dos jogadores.",
      },
      {
        name: "Player Transfers",
        description:
          "Solicitação, aprovação, rejeição, cancelamento e consulta de transferências de jogadores.",
      },
      {
        name: "Matches",
        description:
          "Gerenciamento de partidas, agendamento, resultados, placares e estatísticas.",
      },

      {
        name: "Chat",
        description:
          "Chat entre donos de equipas com mensagens de texto e voz; abre após as duas equipas aceitarem o jogo e fecha segundo o ciclo de vida da partida.",
      },

      {
        name: "Matchmaking",
        description:
          "Busca automática de adversários, recomendações e gestão de solicitações de partidas.",
      },

      {
        name: "Fields",
        description:
          "Gerenciamento de campos de futebol.",
      },

      {
        name: "Bookings",
        description:
          "Reserva e gerenciamento de campos.",
      },

      {
        name: "Tournaments",
        description:
          "Gerenciamento de torneios.",
      },

      {
        name: "Rankings",
        description:
          "Rankings, classificações e estatísticas.",
      },

      {
        name: "Payments",
        description:
          "Processamento de pagamentos, reembolsos, transações e integração com gateways.",
      },

      {
        name: "Finance",
        description:
          "Carteira, transações, pagamentos, reembolsos e operações financeiras.",
      },

      {
        name: "Tournament Awards",
        description:
          "Gerenciamento de premiações, cálculo e atribuição de prêmios de torneios.",
      },

      {
        name: "Tournament Discipline",
        description:
          "Gerenciamento de cartões, suspensões, penalidades e relatórios disciplinares de torneios.",
      },

      {
        name: "Tournament Fixtures",
        description:
          "Geração, agendamento, reagendamento e consulta de jogos/partidas de torneios.",
      },

      {
        name: "Tournament History",
        description:
          "Registro e consulta de históricos de torneios, campeões e estatísticas históricas.",
      },

      {
        name: "Tournament Payments",
        description:
          "Gerenciamento de pagamentos de inscrição, taxas e reembolsos de torneios.",
      },

      {
        name: "Tournament Registrations",
        description:
          "Gerenciamento de inscrições de equipes em torneios, aprovação e rejeição.",
      },

      {
        name: "Tournament Stages",
        description:
          "Gerenciamento de fases e etapas de torneios, avanço e conclusão de stages.",
      },

      {
        name: "Tournament Standings",
        description:
          "Classificações, cálculo de standings e posições de equipes em torneios.",
      },

      {
        name: "Tournament Statistics",
        description:
          "Estatísticas de torneios, artilheiros, assistências e métricas de equipes e jogadores.",
      },
      {
        name: "Support Cases",
        description:
          "Pedidos de suporte, denúncias, disputas, incidentes operacionais e respetivo histórico de resolução.",
      },
    ],
  },

  /**
   * ==========================================
   * ROUTE DOCUMENTATION
   * ==========================================
   */
  apis: [
    "./src/modules/**/routes/*.ts",
    "./src/modules/auth/infrastructure/bootstrap/authorization-check.bootstrap.ts",
    "./src/docs/schemas/*.ts",
  ],
};

const swaggerSpec = swaggerJsdoc(options);

/**
 * ==========================================
 * SWAGGER DOCUMENTATION
 * ==========================================
 */
export function swaggerDocs(
  app: Express,
): void {

  /**
   * Swagger UI
   */
  app.use(
    "/api-docs",

    swaggerUi.serve,

    swaggerUi.setup(
      swaggerSpec,
      {
        customCss:
          ".swagger-ui .topbar { display: none }",

        customSiteTitle:
          "ProntoEquipas API Docs",

        swaggerOptions: {

          /**
           * Mantém o JWT autorizado
           * mesmo ao atualizar/interagir
           * com a documentação.
           */
          persistAuthorization: true,

          /**
           * Mostra duração das requisições.
           */
          displayRequestDuration: true,

          /**
           * Permite filtrar endpoints.
           */
          filter: true,

          /**
           * Expande as operações por padrão.
           */
          docExpansion: "none",

          /**
           * Ordena endpoints por método.
           */
          operationsSorter: "method",

          /**
           * Ordena as tags alfabeticamente.
           */
          tagsSorter: "alpha",
        },
      },
    ),
  );

  /**
   * ==========================================
   * OPENAPI JSON
   * ==========================================
   *
   * Útil para:
   *
   * - Postman
   * - Insomnia
   * - Redoc
   * - geração de SDK
   * - geração automática de clientes
   * - ferramentas de testes
   */
  app.get(
    "/api-spec.json",
    (_req, res) => {

      res.setHeader(
        "Content-Type",
        "application/json",
      );

      res.send(swaggerSpec);
    },
  );
}
