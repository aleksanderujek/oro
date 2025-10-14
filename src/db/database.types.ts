export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ai_logs: {
        Row: {
          ai_category_id: string | null
          confidence: number | null
          created_at: string
          error_code: string | null
          expense_id: string | null
          id: string
          latency_ms: number | null
          model: string | null
          provider: string | null
          query_text: string | null
          suggestions: Json | null
          timed_out: boolean
          user_id: string
        }
        Insert: {
          ai_category_id?: string | null
          confidence?: number | null
          created_at?: string
          error_code?: string | null
          expense_id?: string | null
          id?: string
          latency_ms?: number | null
          model?: string | null
          provider?: string | null
          query_text?: string | null
          suggestions?: Json | null
          timed_out?: boolean
          user_id: string
        }
        Update: {
          ai_category_id?: string | null
          confidence?: number | null
          created_at?: string
          error_code?: string | null
          expense_id?: string | null
          id?: string
          latency_ms?: number | null
          model?: string | null
          provider?: string | null
          query_text?: string | null
          suggestions?: Json | null
          timed_out?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_logs_ai_category_id_fkey"
            columns: ["ai_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_logs_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_logs_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses_active"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_logs_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses_deleted"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          id: string
          key: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          key: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          account: Database["public"]["Enums"]["account_type"] | null
          amount: number
          category_id: string
          created_at: string
          deleted: boolean
          deleted_at: string | null
          description: string | null
          id: string
          merchant_key: string
          name: string
          occurred_at: string
          search_text: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account?: Database["public"]["Enums"]["account_type"] | null
          amount: number
          category_id?: string
          created_at?: string
          deleted?: boolean
          deleted_at?: string | null
          description?: string | null
          id?: string
          merchant_key?: string
          name: string
          occurred_at: string
          search_text?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account?: Database["public"]["Enums"]["account_type"] | null
          amount?: number
          category_id?: string
          created_at?: string
          deleted?: boolean
          deleted_at?: string | null
          description?: string | null
          id?: string
          merchant_key?: string
          name?: string
          occurred_at?: string
          search_text?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_mappings: {
        Row: {
          category_id: string
          id: string
          merchant_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category_id: string
          id?: string
          merchant_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category_id?: string
          id?: string
          merchant_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_mappings_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          last_account: Database["public"]["Enums"]["account_type"] | null
          timezone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          last_account?: Database["public"]["Enums"]["account_type"] | null
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_account?: Database["public"]["Enums"]["account_type"] | null
          timezone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      expenses_active: {
        Row: {
          account: Database["public"]["Enums"]["account_type"] | null
          amount: number | null
          category_id: string | null
          created_at: string | null
          deleted: boolean | null
          deleted_at: string | null
          description: string | null
          id: string | null
          merchant_key: string | null
          name: string | null
          occurred_at: string | null
          search_text: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          account?: Database["public"]["Enums"]["account_type"] | null
          amount?: number | null
          category_id?: string | null
          created_at?: string | null
          deleted?: boolean | null
          deleted_at?: string | null
          description?: string | null
          id?: string | null
          merchant_key?: string | null
          name?: string | null
          occurred_at?: string | null
          search_text?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          account?: Database["public"]["Enums"]["account_type"] | null
          amount?: number | null
          category_id?: string | null
          created_at?: string | null
          deleted?: boolean | null
          deleted_at?: string | null
          description?: string | null
          id?: string | null
          merchant_key?: string | null
          name?: string | null
          occurred_at?: string | null
          search_text?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses_deleted: {
        Row: {
          account: Database["public"]["Enums"]["account_type"] | null
          amount: number | null
          category_id: string | null
          created_at: string | null
          deleted: boolean | null
          deleted_at: string | null
          description: string | null
          id: string | null
          merchant_key: string | null
          name: string | null
          occurred_at: string | null
          search_text: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          account?: Database["public"]["Enums"]["account_type"] | null
          amount?: number | null
          category_id?: string | null
          created_at?: string | null
          deleted?: boolean | null
          deleted_at?: string | null
          description?: string | null
          id?: string | null
          merchant_key?: string | null
          name?: string | null
          occurred_at?: string | null
          search_text?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          account?: Database["public"]["Enums"]["account_type"] | null
          amount?: number | null
          category_id?: string | null
          created_at?: string | null
          deleted?: boolean | null
          deleted_at?: string | null
          description?: string | null
          id?: string | null
          merchant_key?: string | null
          name?: string | null
          occurred_at?: string | null
          search_text?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      gtrgm_compress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_decompress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_in: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_options: {
        Args: { "": unknown }
        Returns: undefined
      }
      gtrgm_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      is_valid_iana_timezone: {
        Args: { tz: string }
        Returns: boolean
      }
      normalize_merchant: {
        Args: { input: string }
        Returns: string
      }
      set_limit: {
        Args: { "": number }
        Returns: number
      }
      show_limit: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      show_trgm: {
        Args: { "": string }
        Returns: string[]
      }
      unaccent: {
        Args: { "": string }
        Returns: string
      }
      unaccent_init: {
        Args: { "": unknown }
        Returns: unknown
      }
      uncategorized_uuid: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
    }
    Enums: {
      account_type: "cash" | "card"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      account_type: ["cash", "card"],
    },
  },
} as const

