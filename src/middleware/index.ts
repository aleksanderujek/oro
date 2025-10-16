import type { MiddlewareHandler } from "astro";

import { supabaseClient } from "../db/supabase.client";
import type { Session } from "@supabase/supabase-js";

export const onRequest: MiddlewareHandler = async (context, next) => {
  context.locals.supabase = supabaseClient;

  const isMockAuthEnabled = import.meta.env.MOCK_AUTH_ENABLED === "true";
  const mockUserId = import.meta.env.MOCK_SUPABASE_USER_ID ?? "";

  if (isMockAuthEnabled) {
    if (!mockUserId) {
      context.locals.session = null;
      return next();
    }

    const session = {
      user: {
        id: mockUserId,
      },
    } as Session;

    context.locals.session = session;
    return next();
  }

  const {
    data: { session },
  } = await supabaseClient.auth.getSession();

  context.locals.session = session;
  return next();
};
