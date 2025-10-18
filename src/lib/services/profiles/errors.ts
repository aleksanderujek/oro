export type UpdateProfileErrorCode =
  | "INVALID_ACCOUNT_TYPE"
  | "INVALID_TIMEZONE"
  | "PROFILE_NOT_FOUND"
  | "PROFILE_UPDATE_FAILED";

export interface UpdateProfileErrorCause {
  userId: string;
  requestId?: string;
  accountType?: unknown;
  timezone?: string;
  reason?: unknown;
}

export class UpdateProfileError extends Error {
  public readonly code: UpdateProfileErrorCode;

  constructor(code: UpdateProfileErrorCode, message: string, options: { cause: UpdateProfileErrorCause }) {
    super(message);
    this.name = "UpdateProfileError";
    this.code = code;
    this.cause = options.cause;
  }
}
