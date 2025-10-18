import type { SupabaseClient } from "../../db/supabase.client";

const VALID_REGION_SEPARATOR = "/";

function isPotentialIanaFormat(timezone: string): boolean {
  return timezone.includes(VALID_REGION_SEPARATOR);
}

function normalizeTimezoneInput(timezone: string): string {
  return timezone.trim();
}

export async function isValidIanaTimezone(timezone: string, supabase?: SupabaseClient): Promise<boolean> {
  if (typeof timezone !== "string") {
    return false;
  }

  const normalized = normalizeTimezoneInput(timezone);

  if (!normalized) {
    return false;
  }

  if (!isPotentialIanaFormat(normalized)) {
    return false;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: normalized });
    return true;
  } catch (error) {
    if (error instanceof RangeError) {
      // fall through to Supabase validation when available
    } else {
      return false;
    }
  }

  if (!supabase) {
    return false;
  }

  const { data, error } = await supabase.rpc("is_valid_iana_timezone", { tz: normalized }).single<boolean>();

  if (error) {
    return false;
  }

  return Boolean(data);
}
