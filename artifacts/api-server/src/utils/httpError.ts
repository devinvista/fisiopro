/**
 * HttpError — exceção transportada pelo middleware central de erros.
 *
 * Uso típico em handlers:
 *   if (!record) throw new HttpError(404, "Registro não encontrado");
 *   if (!isMine) throw HttpError.forbidden("Acesso negado a este paciente");
 *
 * O middleware em app.ts converte qualquer HttpError em uma resposta JSON
 * padronizada `{ error, message, issues? }` com o status correto.
 */
export class HttpError extends Error {
  readonly status: number;
  readonly error: string;
  readonly issues?: unknown;

  constructor(status: number, message: string, opts?: { error?: string; issues?: unknown }) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.error = opts?.error ?? defaultErrorLabel(status);
    this.issues = opts?.issues;
  }

  static badRequest(message: string, issues?: unknown) {
    return new HttpError(400, message, { error: "Bad Request", issues });
  }
  static unauthorized(message = "Não autenticado") {
    return new HttpError(401, message, { error: "Unauthorized" });
  }
  static forbidden(message = "Acesso negado") {
    return new HttpError(403, message, { error: "Forbidden" });
  }
  static notFound(message = "Não encontrado") {
    return new HttpError(404, message, { error: "Not Found" });
  }
  static conflict(message: string) {
    return new HttpError(409, message, { error: "Conflict" });
  }
}

function defaultErrorLabel(status: number): string {
  if (status >= 500) return "Internal Server Error";
  if (status === 400) return "Bad Request";
  if (status === 401) return "Unauthorized";
  if (status === 403) return "Forbidden";
  if (status === 404) return "Not Found";
  if (status === 409) return "Conflict";
  if (status === 429) return "Too Many Requests";
  return "Error";
}
