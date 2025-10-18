import type { Tables } from "../../db/database.types";
import type { SupabaseClient } from "../../db/supabase.client";
import type { CategoriesResponse, CategoryDTO } from "../../types";

export type ListCategoriesErrorCode = "LIST_CATEGORIES_QUERY_FAILED";

export class ListCategoriesError extends Error {
  public readonly code: ListCategoriesErrorCode;

  constructor(code: ListCategoriesErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "ListCategoriesError";
    this.code = code;

    if (options?.cause) {
      this.cause = options.cause;
    }
  }
}

interface ListCategoriesParams {
  supabase: SupabaseClient;
  includeUncategorized: boolean;
  requestId?: string;
}

type CategoryRow = Tables<"categories">;

function toCategoryDTO(row: Pick<CategoryRow, "id" | "key" | "name" | "sort_order">): CategoryDTO {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    sortOrder: row.sort_order,
  };
}

export async function listCategories({
  supabase,
  includeUncategorized,
  requestId,
}: ListCategoriesParams): Promise<CategoriesResponse> {
  const { data, error } = await supabase
    .from("categories")
    .select("id, key, name, sort_order")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new ListCategoriesError("LIST_CATEGORIES_QUERY_FAILED", "Failed to load categories", {
      cause: { error, requestId },
    });
  }

  const rows = includeUncategorized ? data : data.filter((category) => category.key !== "uncategorized");

  return {
    items: rows.map(toCategoryDTO),
  };
}
