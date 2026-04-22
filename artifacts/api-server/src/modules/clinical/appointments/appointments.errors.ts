export class AppointmentError extends Error {
  constructor(
    public readonly httpStatus: number,
    public readonly code: string,
    message: string,
    public readonly extra?: Record<string, unknown>
  ) {
    super(message);
    this.name = "AppointmentError";
  }
}

export function notFound(message = "Agendamento não encontrado.") {
  return new AppointmentError(404, "Not Found", message);
}

export function conflict(message: string, extra?: Record<string, unknown>) {
  return new AppointmentError(409, "Conflict", message, extra);
}

export function unprocessable(code: string, message: string) {
  return new AppointmentError(422, code, message);
}

export function badRequest(message: string) {
  return new AppointmentError(400, "BadRequest", message);
}
