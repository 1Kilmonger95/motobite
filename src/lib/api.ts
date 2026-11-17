import { supabase } from "./supabase";
import { FN } from "./functions";

export type ApiResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; status: number; code: string }; // status 0 = no se pudo contactar

export async function callApi(body: Record<string, unknown>): Promise<ApiResult> {
  try {
    const { data, error } = await supabase.functions.invoke(FN.api, { body });
    if (error) {
      const ctx = (error as { context?: unknown }).context;
      if (ctx instanceof Response) {
        let code = "";
        try {
          code = String(((await ctx.json()) as { error?: unknown }).error ?? "");
        } catch {
          /* la respuesta no traía JSON */
        }
        return { ok: false, status: ctx.status, code };
      }
      return { ok: false, status: 0, code: "network" };
    }
    return { ok: true, data: (data ?? {}) as Record<string, unknown> };
  } catch {
    return { ok: false, status: 0, code: "network" };
  }
}
