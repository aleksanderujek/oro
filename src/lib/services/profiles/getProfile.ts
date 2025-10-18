import type { Tables } from "../../../db/database.types";
import type { SupabaseClient } from "../../../db/supabase.client";
import type { ProfileDTO } from "../../../types";
import { InvalidAccountTypeError, toProfileDTO } from "./mappers";

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

  try {
    return toProfileDTO(data);
  } catch (error) {
    if (error instanceof InvalidAccountTypeError) {
      throw new GetProfileError("INVALID_ACCOUNT_TYPE", error.message, {
        cause: { userId, requestId, accountType: error.cause },
      });
    }

    throw new GetProfileError("PROFILE_LOOKUP_FAILED", "Unable to load profile", {
      cause: { error, userId, requestId },
    });
  }
}
