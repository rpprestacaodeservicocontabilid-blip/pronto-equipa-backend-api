/**
 * Declaração de tipo para `swagger-jsdoc` (o pacote não publica tipos próprios).
 * Evita o erro TS7016 sem instalar dependências adicionais.
 */
declare module 'swagger-jsdoc' {
  namespace swaggerJsdoc {
    interface Options {
      definition: Record<string, unknown>;
      apis: string[];
    }

    interface SwaggerSpec {
      [key: string]: unknown;
    }
  }

  function swaggerJsdoc(options: swaggerJsdoc.Options): swaggerJsdoc.SwaggerSpec;

  export = swaggerJsdoc;
}
