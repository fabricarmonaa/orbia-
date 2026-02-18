export class HttpError extends Error {
  status: number;
  code: string;
  extra?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, extra?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export function badRequest(code: string, message: string, extra?: Record<string, unknown>) {
  return new HttpError(400, code, message, extra);
}

export function unauthorized(code: string, message: string, extra?: Record<string, unknown>) {
  return new HttpError(401, code, message, extra);
}

export function forbidden(code: string, message: string, extra?: Record<string, unknown>) {
  return new HttpError(403, code, message, extra);
}

export function notFound(code: string, message: string, extra?: Record<string, unknown>) {
  return new HttpError(404, code, message, extra);
}
