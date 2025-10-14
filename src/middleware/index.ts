import type { MiddlewareHandler } from "astro";

import { supabaseClient } from "../db/supabase.client";

export const onRequest: MiddlewareHandler = async (context, next) => {
  context.locals.supabase = supabaseClient;
  return next();
};
