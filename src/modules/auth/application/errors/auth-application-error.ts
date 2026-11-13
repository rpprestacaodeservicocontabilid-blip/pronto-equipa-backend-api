/**
 * Cria um erro de aplicação com o código HTTP
 * associado, interpretado pelos controllers.
 */
export function authError(
  message: string,
  statusCode: number,
): Error {
  const error = new Error(message) as Error & {
    statusCode?: number;
  };

  error.statusCode = statusCode;

  return error;
}
