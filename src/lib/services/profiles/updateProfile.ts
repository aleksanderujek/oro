import type { Tables } from "../../../db/database.types";
import type { SupabaseClient } from "../../../db/supabase.client";
import type { UpdateProfileCommand } from "../../../types";
import { toProfileDTO } from "./mappers";
import { UpdateProfileError } from "./errors";
import { isValidIanaTimezone } from "../../utils/timezone";

type ProfileRow = Tables<"profiles">;

interface UpdateProfileParams {
  supabase: SupabaseClient;
  userId: string;
  command: UpdateProfileCommand;
  requestId?: string;
}

export async function updateProfile({ supabase, userId, command, requestId }: UpdateProfileParams) {
  const updatePayload: Record<string, unknown> = {};

  if (command.timezone !== undefined && command.timezone !== null) {
    const isValidTimezone = await isValidIanaTimezone(command.timezone, supabase);

    if (!isValidTimezone) {
      throw new UpdateProfileError("INVALID_TIMEZONE", "Timezone is not a valid IANA identifier", {
        cause: { userId, requestId, timezone: command.timezone },
      });
    }

    updatePayload.timezone = command.timezone;
  }

  if (command.lastAccount !== undefined && command.lastAccount !== null) {
    updatePayload.last_account = command.lastAccount;
  }

  if (Object.keys(updatePayload).length === 0) {
    throw new UpdateProfileError("PROFILE_UPDATE_FAILED", "No fields provided to update", {
      cause: { userId, requestId },
    });
  }

  const query = supabase.from("profiles").update(updatePayload).eq("id", userId);

  const { data, error } = await query.select("id, timezone, last_account, created_at, updated_at").single<ProfileRow>();

  if (error) {
    if (error.code === "PGRST116") {
      // row not found
      throw new UpdateProfileError("PROFILE_NOT_FOUND", "Profile not found for user", {
        cause: { userId, requestId, reason: error },
      });
    }

    throw new UpdateProfileError("PROFILE_UPDATE_FAILED", "Failed to update profile", {
      cause: { userId, requestId, reason: error },
    });
  }

  if (!data) {
    throw new UpdateProfileError("PROFILE_NOT_FOUND", "Profile not found for user", {
      cause: { userId, requestId },
    });
  }

  try {
    return toProfileDTO(data);
  } catch (mapperError) {
    const accountType = (mapperError as { cause?: { accountType?: unknown } }).cause?.accountType;

    throw new UpdateProfileError("INVALID_ACCOUNT_TYPE", "Profile default account is invalid", {
      cause: { userId, requestId, accountType },
    });
  }
}
