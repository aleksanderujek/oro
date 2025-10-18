import type { Tables } from "../../../db/database.types";
import type { AccountType, ProfileDTO } from "../../../types";

export type ProfileRow = Tables<"profiles">;

const VALID_ACCOUNT_TYPES = new Set<AccountType>(["cash", "card"]);

export class InvalidAccountTypeError extends Error {
  constructor(accountType: unknown) {
    super("Profile default account is invalid");
    this.name = "InvalidAccountTypeError";
    this.cause = { accountType };
  }
}

export function assertValidAccountType(value: ProfileRow["last_account"]): AccountType | null {
  if (value === null) {
    return null;
  }

  if (VALID_ACCOUNT_TYPES.has(value as AccountType)) {
    return value as AccountType;
  }

  throw new InvalidAccountTypeError(value);
}

export function toProfileDTO(row: ProfileRow): ProfileDTO {
  return {
    id: row.id,
    timezone: row.timezone,
    lastAccount: assertValidAccountType(row.last_account),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
