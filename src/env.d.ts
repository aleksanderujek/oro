/// <reference types="astro/client" />

import type { SupabaseClient } from "./db/supabase.client";
import type { Session } from "@supabase/supabase-js";

declare global {
  namespace App {
    interface Locals {
      supabase: SupabaseClient;
      session: Session | null;
    }
  }
}

interface ImportMetaEnv {
  readonly SUPABASE_URL: string;
  readonly SUPABASE_KEY: string;
  readonly OPENROUTER_API_KEY: string;
  readonly MOCK_AUTH_ENABLED?: string;
  readonly MOCK_SUPABASE_USER_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
