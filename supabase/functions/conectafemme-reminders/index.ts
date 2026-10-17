import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const secrets = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const SERVICE_KEY = secrets.default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type, apikey, x-cron-secret",
    "access-control-allow-methods": "POST, OPTIONS",
    "cache-control": "no-store",
  }});
}
function fail(status: number, message: string): never { throw new ApiError(status, message); }
function idFilter(id: number) { return `eq.${id}`; }

async function db(path: string, method = "GET", params: Record<string, string> = {}, body?: unknown, prefer?: string) {
  if (!SUPABASE_URL || !SERVICE_KEY) fail(503, "A configuração do Supabase está indisponível.");
  const url = new URL(`/rest/v1/${path}`, SUPABASE_URL);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const headers: Record<string, string> = { apikey: SERVICE_KEY, accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (prefer) headers.prefer = prefer;
  const result = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await result.text();
  let parsed: any = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  if (!result.ok) {
    console.error("Reminder database error", result.status, typeof parsed === "object" ? parsed?.code : "");
    fail(500, "Não foi possível consultar os agendamentos.");
  }
  return parsed;
}
const get = (path: string, params: Record<string, string>) => db(path, "GET", params);
const del = (path: string, params: Record<string, string>) => db(path, "DELETE", params, undefined, "return=minimal");

function saoPauloNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { day: `${values.year}-${values.month}-${values.day}`, minutes: Number(values.hour) * 60 + Number(values.minute) };
}
function timeMinutes(value: unknown) {
  const match = String(value ?? "").match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]), minute = Number(match[2]);
  return hour <= 23 && minute <= 59 ? hour * 60 + minute : null;
}
function dateBr(value: unknown) {
  const parts = String(value ?? "").split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : String(value ?? "");
}

async function sendReminder(booking: any, title: string, hour: string, day: string) {
  const userId = Number(booking.client_id);
  const subscriptions = await get("push_subscriptions", {
    select: "endpoint,p256dh,auth", user_id: idFilter(userId), limit: "50",
  });
  if (!Array.isArray(subscriptions) || !subscriptions.length) return "unsubscribed";

  const eventKey = `reminder:${booking.id}:${day}`;
  const claimed = await db("push_event_log", "POST", { on_conflict: "event_key" }, { event_key: eventKey }, "resolution=ignore-duplicates,return=representation");
  if (!Array.isArray(claimed) || !claimed.length) return "duplicate";

  try {
    const keys = await get("push_settings", { select: "public_key,private_key", name: "eq.vapid", limit: "1" });
    if (!Array.isArray(keys) || !keys[0]?.public_key || !keys[0]?.private_key) fail(503, "As chaves de notificação não estão configuradas.");
    webpush.setVapidDetails("mailto:conectafemmest@gmail.com", keys[0].public_key, keys[0].private_key);
    const payload = JSON.stringify({
      title: "Lembrete: seu atendimento é hoje",
      body: `${title} está agendado para hoje, ${dateBr(day)}, às ${hour}.`,
      url: "/#/painel",
    });
    let failed = false;
    await Promise.all(subscriptions.map(async (subscription: any) => {
      try {
        await webpush.sendNotification({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        }, payload, { TTL: 3600 });
      } catch (error) {
        const status = Number((error as any)?.statusCode ?? 0);
        if (status === 404 || status === 410) {
          try { await del("push_subscriptions", { endpoint: `eq.${subscription.endpoint}`, user_id: idFilter(userId) }); } catch { /* limpeza best effort */ }
        } else {
          failed = true;
          console.error("Reminder push failed", status || (error instanceof Error ? error.name : "UnknownError"));
        }
      }
    }));
    if (failed) {
      await del("push_event_log", { event_key: `eq.${eventKey}` });
      return "failed";
    }
    return "sent";
  } catch (error) {
    try { await del("push_event_log", { event_key: `eq.${eventKey}` }); } catch { /* retry cleanup best effort */ }
    throw error;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return response({ ok: true });
  if (req.method !== "POST") return response({ error: "Método inválido." }, 405);
  try {
    const candidate = req.headers.get("x-cron-secret") ?? "";
    if (!candidate) fail(401, "A autorização do agendador está ausente.");
    const secretIsValid = await db("rpc/check_conectafemme_reminder_secret", "POST", {}, { candidate });
    if (secretIsValid !== true) fail(401, "A autorização do agendador é inválida.");

    const now = saoPauloNow();
    const slots = await get("slots", { select: "id,day,hour", day: `eq.${now.day}`, limit: "1000" });
    const slotRows = Array.isArray(slots) ? slots : [];
    const slotIds = slotRows.map((slot: any) => Number(slot.id)).filter((id: number) => Number.isInteger(id) && id > 0);
    if (!slotIds.length) return response({ ok: true, day: now.day, sent: 0, failed: 0 });

    const bookings = await get("bookings", {
      select: "id,slot_id,service_id,client_id,status", slot_id: `in.(${slotIds.join(",")})`,
      status: "eq.confirmado", client_id: "not.is.null", limit: "1000",
    });
    const bookingRows = Array.isArray(bookings) ? bookings : [];
    const serviceIds = [...new Set(bookingRows.map((booking: any) => Number(booking.service_id)).filter((id: number) => Number.isInteger(id) && id > 0))];
    const services = serviceIds.length
      ? await get("services", { select: "id,title", id: `in.(${serviceIds.join(",")})`, limit: "1000" })
      : [];
    const slotsById = new Map(slotRows.map((slot: any) => [Number(slot.id), slot]));
    const servicesById = new Map((Array.isArray(services) ? services : []).map((service: any) => [Number(service.id), service.title]));
    let sent = 0, failed = 0;

    for (const booking of bookingRows) {
      const slot = slotsById.get(Number(booking.slot_id));
      const appointmentMinutes = timeMinutes(slot?.hour);
      if (!slot || appointmentMinutes === null || appointmentMinutes <= now.minutes) continue;
      const title = servicesById.get(Number(booking.service_id)) ?? "Seu procedimento";
      try {
        const result = await sendReminder(booking, title, String(slot.hour), now.day);
        if (result === "sent") sent++;
        if (result === "failed") failed++;
      } catch {
        failed++;
      }
    }
    return response({ ok: true, day: now.day, sent, failed });
  } catch (error) {
    if (error instanceof ApiError) return response({ error: error.message }, error.status);
    console.error("ConectaFemme reminder error", error instanceof Error ? error.name : "UnknownError");
    return response({ error: "Não foi possível processar os lembretes." }, 500);
  }
});
