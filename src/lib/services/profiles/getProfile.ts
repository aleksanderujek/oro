import type { Tables } from "../../../db/database.types";
import type { SupabaseClient } from "../../../db/supabase.client";
import type { AccountType, ProfileDTO } from "../../../types";

export type GetProfileErrorCode = "PROFILE_LOOKUP_FAILED" | "PROFILE_NOT_FOUND" | "INVALID_ACCOUNT_TYPE";

export class GetProfileError extends Error {
  public readonly code: GetProfileErrorCode;

  constructor(code: GetProfileErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "GetProfileError";
    this.code = code;

    if (options?.cause) {
      this.cause = options.cause;
    }
  }
}

interface GetProfileParams {
  supabase: SupabaseClient;
  userId: string;
  requestId?: string;
}

type ProfileRow = Tables<"profiles">;

const VALID_ACCOUNT_TYPES = new Set<AccountType>(["cash", "card"]);

function isValidAccountType(value: ProfileRow["last_account"]): value is AccountType | null {
  if (value === null) {
    return true;
  }

  return VALID_ACCOUNT_TYPES.has(value as AccountType);
}

function assertValidAccountType(
  value: ProfileRow["last_account"],
  context: { userId: string; requestId?: string }
): AccountType | null {
  if (isValidAccountType(value)) {
    return value;
  }

  throw new GetProfileError("INVALID_ACCOUNT_TYPE", "Profile default account is invalid", {
    cause: {
      userId: context.userId,
      requestId: context.requestId,
      accountType: value,
    },
  });
}

function toProfileDTO(row: ProfileRow, context: { userId: string; requestId?: string }): ProfileDTO {
  return {
    id: row.id,
    timezone: row.timezone,
    lastAccount: assertValidAccountType(row.last_account, context),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getProfile({ supabase, userId, requestId }: GetProfileParams): Promise<ProfileDTO> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, timezone, last_account, created_at, updated_at")
    .eq("id", userId)
    .maybeSingle<ProfileRow>();

  if (error) {
    throw new GetProfileError("PROFILE_LOOKUP_FAILED", "Unable to load profile", {
      cause: { error, userId, requestId },
    });
  }

  if (!data) {
    throw new GetProfileError("PROFILE_NOT_FOUND", "Profile not found for user");
  }

  return toProfileDTO(data, { userId, requestId });
}
