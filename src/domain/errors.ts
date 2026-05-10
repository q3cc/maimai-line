export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(status: number, message: string, code = "api_error") {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function badRequest(message: string, code = "bad_request"): ApiError {
  return new ApiError(400, message, code);
}

export function unauthorized(message = "Authentication required"): ApiError {
  return new ApiError(401, message, "unauthorized");
}

export function forbidden(message = "Permission denied"): ApiError {
  return new ApiError(403, message, "forbidden");
}

export function notFound(message = "Resource not found"): ApiError {
  return new ApiError(404, message, "not_found");
}

export function conflict(message: string, code = "conflict"): ApiError {
  return new ApiError(409, message, code);
}
