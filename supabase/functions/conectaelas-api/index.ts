import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const secrets = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const SERVICE_KEY = secrets.default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const publishables = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
const PUBLIC_KEY = publishables.default ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const encoder = new TextEncoder();

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type, apikey, x-token",
    "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "cache-control": "no-store",
  }});
}
function fail(status: number, message: string): never { throw new ApiError(status, message); }
function safeEq(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function toHex(buf: ArrayBuffer | ArrayBufferView) { const view = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength); return [...view].map(x => x.toString(16).padStart(2, "0")).join(""); }
async function hashPassword(password: string, saltHex: string) {
  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map(x => parseInt(x, 16)));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 310000, hash: "SHA-256" }, key, 256);
  return `pbkdf2:310000:${saltHex}:${toHex(bits)}`;
}
async function verifyPassword(password: string, stored: string) {
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== "pbkdf2" || parts[1] !== "310000") return false;
  const actual = await hashPassword(password, parts[2]);
  return safeEq(actual, stored);
}
async function signature(payload: string) {
  if (!SERVICE_KEY) fail(503, "A configuração segura do banco Supabase está indisponível.");
  const key = await crypto.subtle.importKey("raw", encoder.encode(SERVICE_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
}
async function makeToken(user: { id: number | string; role: string }) {
  const payload = btoa(JSON.stringify({ id: Number(user.id), role: user.role, exp: Math.floor(Date.now() / 1000) + 604800 }));
  return `${payload}.${await signature(payload)}`;
}
async function auth(req: Request, roles?: string[]) {
  const raw = req.headers.get("x-token") ?? "";
  const [payload, sig] = raw.split(".");
  if (!payload || !sig || !safeEq(await signature(payload), sig)) fail(401, "Faça login");
  let user: { id: number; role: string; exp: number };
  try { user = JSON.parse(atob(payload)); } catch { fail(401, "Sessão inválida"); }
  if (!Number.isFinite(user!.id) || user!.exp < Math.floor(Date.now() / 1000)) fail(401, "Sessão expirada");
  if (roles && !roles.includes(user!.role)) fail(403, "Sem permissão");
  return user!;
}

async function db(table: string, method = "GET", params: Record<string, string> = {}, payload?: unknown, prefer?: string) {
  if (!SUPABASE_URL || !SERVICE_KEY) fail(503, "A configuração do banco Supabase está incompleta.");
  const url = new URL(`/rest/v1/${table}`, SUPABASE_URL);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const headers: Record<string, string> = { apikey: SERVICE_KEY, accept: "application/json" };
  if (payload !== undefined) headers["content-type"] = "application/json";
  if (prefer) headers.prefer = prefer;
  const res = await fetch(url, { method, headers, body: payload === undefined ? undefined : JSON.stringify(payload) });
  const text = await res.text();
  let parsed: any = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  if (!res.ok) {
    console.error("Supabase REST error", res.status, typeof parsed === "object" ? parsed?.code : "");
    fail(500, "Não foi possível concluir a operação no banco de dados.");
  }
  return parsed;
}
const get = (t: string, p: Record<string,string>) => db(t, "GET", p);
const post = (t: string, row: unknown, p: Record<string,string> = {}) => db(t, "POST", { ...p, select: "*" }, row, "return=representation");
const patch = (t: string, p: Record<string,string>, row: unknown) => db(t, "PATCH", { ...p, select: "*" }, row, "return=representation");
const del = (t: string, p: Record<string,string>) => db(t, "DELETE", { ...p, select: "*" }, undefined, "return=representation");
const first = (rows: any[]) => rows?.[0] ?? null;
const bodyString = (body: any, key: string) => String(body?.[key] ?? "").trim();
const idFilter = (id: unknown) => `eq.${Number(id)}`;
const inFilter = (ids: number[]) => ids.length ? `in.(${ids.join(",")})` : "in.(0)";

async function relatedUsers(ids: number[]) {
  if (!ids.length) return [];
  return get("users", { select: "id,name,whatsapp,role,email,created", id: inFilter(ids) });
}
async function relatedServices(ids: number[]) {
  if (!ids.length) return [];
  return get("services", { select: "id,title,price,provider_id", id: inFilter(ids) });
}
async function relatedSlots(ids: number[]) {
  if (!ids.length) return [];
  return get("slots", { select: "id,day,hour,booked,provider_id", id: inFilter(ids) });
}

async function handle(req: Request) {
  const url = new URL(req.url);
  const action = url.searchParams.get("a") ?? "";
  let input: any = {};
  if (req.method !== "GET" && req.method !== "OPTIONS") {
    try { input = await req.json(); } catch { input = {}; }
  }
  switch (action) {
    case "cats": {
      const rows = await get("categories", { select: "name", order: "name.asc" });
      return rows.map((r: any) => r.name);
    }
    case "register": {
      const role = input.role === "provider" ? "provider" : "client";
      const email = bodyString(input, "email").toLowerCase();
      const name = bodyString(input, "name"), password = String(input.password ?? ""), whatsapp = bodyString(input, "whatsapp");
      if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 6 || !whatsapp) fail(400, "Preencha nome, e-mail válido, WhatsApp e senha (mín. 6 caracteres).");
      if (first(await get("users", { select: "id", email: `eq.${email}`, limit: "1" }))) fail(400, "E-mail já cadastrado");
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const pass = await hashPassword(password, toHex(salt));
      const u = first(await post("users", { role, name, email, pass, whatsapp }));
      if (role === "provider") await post("providers", { user_id: u.id, category: bodyString(input, "category"), city: bodyString(input, "city") });
      const user = { id: u.id, role: u.role, name: u.name };
      return { token: await makeToken(user), user };
    }
    case "login": {
      const email = bodyString(input, "email").toLowerCase();
      const password = String(input.password ?? "");
      const u = first(await get("users", { select: "id,role,name,pass", email: `eq.${email}`, limit: "1" }));
      const supplied = u?.pass ?? "";
      const valid = u ? await verifyPassword(password, supplied) : false;
      if (!valid) fail(401, "E-mail ou senha inválidos");
      const user = { id: u.id, role: u.role, name: u.name };
      return { token: await makeToken(user), user };
    }
    case "providers": {
      const category = url.searchParams.get("cat") ?? "", query = (url.searchParams.get("q") ?? "").toLocaleLowerCase();
      const [users, profiles, services] = await Promise.all([
        get("users", { select: "id,name,is_demo", role: "eq.provider", order: "id.desc", limit: "200" }),
        get("providers", { select: "user_id,category,logo,city,bio" }),
        get("services", { select: "id,provider_id,title,price,images", order: "id.asc" }),
      ]);
      const result = users.map((u: any) => {
        const p = profiles.find((x: any) => Number(x.user_id) === Number(u.id));
        const own = services.filter((x: any) => Number(x.provider_id) === Number(u.id));
        return { id: u.id, name: u.name, is_demo: Boolean(u.is_demo), category: p?.category, logo: p?.logo, city: p?.city, min_price: own.length ? Math.min(...own.map((x: any) => Number(x.price))) : null, img: own[0]?.images };
      }).filter((p: any) => p.category && (!category || p.category === category) && (!query || [p.name,p.category,p.city].some(v => String(v ?? "").toLocaleLowerCase().includes(query)) || services.some((s: any) => Number(s.provider_id) === Number(p.id) && String(s.title).toLocaleLowerCase().includes(query))))
        .slice(0, 60);
      return result;
    }
    case "provider": {
      const id = Number(url.searchParams.get("id") ?? 0);
      const [u, p] = await Promise.all([
        get("users", { select: "id,name,whatsapp,is_demo", id: idFilter(id), role: "eq.provider", limit: "1" }),
        get("providers", { select: "category,bio,logo,city", user_id: idFilter(id), limit: "1" }),
      ]);
      if (!u.length || !p.length) fail(404, "Não encontrado");
      const today = new Date().toISOString().slice(0, 10);
      const [services, slots] = await Promise.all([
        get("services", { select: "*", provider_id: idFilter(id), order: "id.desc" }),
        get("slots", { select: "id,day,hour", provider_id: idFilter(id), booked: "eq.false", day: `gte.${today}`, order: "day.asc,hour.asc" }),
      ]);
      return { ...u[0], ...p[0], services, slots };
    }
    case "my_profile": {
      const me = await auth(req, ["provider"]);
      const [u,p] = await Promise.all([
        get("users", { select: "name,whatsapp", id: idFilter(me.id), limit: "1" }),
        get("providers", { select: "category,bio,logo,city", user_id: idFilter(me.id), limit: "1" }),
      ]);
      return { ...(u[0] ?? {}), ...(p[0] ?? {}) };
    }
    case "profile_save": {
      const me = await auth(req, ["provider"]);
      await patch("users", { id: idFilter(me.id) }, { name: bodyString(input,"name"), whatsapp: bodyString(input,"whatsapp") });
      await patch("providers", { user_id: idFilter(me.id) }, { category: bodyString(input,"category"), bio: bodyString(input,"bio"), logo: bodyString(input,"logo"), city: bodyString(input,"city") });
      return { ok: 1 };
    }
    case "service_save": {
      const me = await auth(req, ["provider"]);
      const title = bodyString(input,"title"), price = Number(input.price);
      if (!title || !Number.isFinite(price) || price < 0) fail(400, "Informe título e valor válido.");
      const images = String(input.images ?? "").split("\n").map((x: string) => x.trim()).filter(Boolean);
      await post("services", { provider_id: me.id, title, descr: bodyString(input,"descr"), price, images: JSON.stringify(images) });
      return { ok: 1 };
    }
    case "service_del": {
      const me = await auth(req, ["provider"]);
      await del("services", { id: idFilter(input.id), provider_id: idFilter(me.id) });
      return { ok: 1 };
    }
    case "slot_add": {
      const me = await auth(req, ["provider"]), day = bodyString(input,"day");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) fail(400, "Informe uma data válida.");
      for (const raw of Array.isArray(input.hours) ? input.hours : []) {
        const hour = String(raw).trim();
        if (/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(hour))
          await db("slots", "POST", { on_conflict: "provider_id,day,hour" }, { provider_id: me.id, day, hour }, "resolution=ignore-duplicates,return=minimal");
      }
      return { ok: 1 };
    }
    case "my_slots": {
      const me = await auth(req, ["provider"]), today = new Date().toISOString().slice(0, 10);
      return await get("slots", { select: "id,day,hour,booked", provider_id: idFilter(me.id), day: `gte.${today}`, order: "day.asc,hour.asc" });
    }
    case "slot_del": {
      const me = await auth(req, ["provider"]);
      await del("slots", { id: idFilter(input.id), provider_id: idFilter(me.id), booked: "eq.false" });
      return { ok: 1 };
    }
    case "book": {
      const me = await auth(req, ["client"]);
      const sl = first(await get("slots", { select: "id,provider_id", id: idFilter(input.slot_id), booked: "eq.false", limit: "1" }));
      const sv = sl ? first(await get("services", { select: "id", id: idFilter(input.service_id), provider_id: idFilter(sl.provider_id), limit: "1" })) : null;
      if (!sl || !sv) fail(400, "Horário indisponível");
      const booked = await patch("slots", { id: idFilter(sl.id), booked: "eq.false" }, { booked: true });
      if (!booked.length) fail(400, "Horário acabou de ser reservado");
      await post("bookings", { slot_id: sl.id, service_id: sv.id, client_id: me.id, provider_id: sl.provider_id });
      return { ok: 1 };
    }
    case "bookings": {
      const me = await auth(req, ["client","provider"]), client = me.role === "client";
      const rows = await get("bookings", { select: "id,status,slot_id,service_id,client_id,provider_id", [client ? "client_id" : "provider_id"]: idFilter(me.id), order: "created.desc", limit: "200" });
      const [slots, services, people] = await Promise.all([
        relatedSlots([...new Set<number>(rows.map((r: any) => Number(r.slot_id)))]),
        relatedServices([...new Set<number>(rows.map((r: any) => Number(r.service_id)))]),
        relatedUsers([...new Set<number>(rows.map((r: any) => Number(client ? r.provider_id : r.client_id))) ]),
      ]);
      return rows.map((b: any) => {
        const sl = slots.find((x: any) => Number(x.id) === Number(b.slot_id));
        const sv = services.find((x: any) => Number(x.id) === Number(b.service_id));
        const other = people.find((x: any) => Number(x.id) === Number(client ? b.provider_id : b.client_id));
        return { id: b.id, status: b.status, day: sl?.day, hour: sl?.hour, title: sv?.title, price: sv?.price, other_name: other?.name, other_whatsapp: other?.whatsapp };
      }).sort((a: any,b: any) => `${b.day} ${b.hour}`.localeCompare(`${a.day} ${a.hour}`));
    }
    case "booking_status": {
      const me = await auth(req, ["client","provider"]), status = ["confirmado","cancelado"].includes(input.status) ? input.status : "pendente";
      const client = me.role === "client";
      if (client && status !== "cancelado") fail(403, "Sem permissão");
      const b = first(await get("bookings", { select: "slot_id", id: idFilter(input.id), [client ? "client_id" : "provider_id"]: idFilter(me.id), limit: "1" }));
      if (b) {
        await patch("bookings", { id: idFilter(input.id), [client ? "client_id" : "provider_id"]: idFilter(me.id) }, { status });
        if (status === "cancelado") await patch("slots", { id: idFilter(b.slot_id) }, { booked: false });
      }
      return { ok: 1 };
    }
    case "admin_users": {
      await auth(req,["admin"]);
      const [users, providers] = await Promise.all([
        get("users", { select: "id,role,name,email,whatsapp,created,is_demo", role: "neq.admin", order: "id.desc" }),
        get("providers", { select: "user_id,category" }),
      ]);
      return users.map((u: any) => ({ ...u, category: providers.find((p: any) => Number(p.user_id) === Number(u.id))?.category ?? null }));
    }
    case "admin_user_del": {
      await auth(req,["admin"]);
      await del("users", { id: idFilter(input.id), role: "neq.admin" });
      return { ok: 1 };
    }
    case "admin_demo_del": {
      await auth(req,["admin"]);
      await del("users", { id: idFilter(input.id), role: "eq.provider", is_demo: "eq.true" });
      return { ok: 1 };
    }
    case "admin_cat_add": {
      await auth(req,["admin"]);
      const name = bodyString(input,"name"); if (!name) fail(400,"Informe o nome da categoria.");
      await db("categories", "POST", { on_conflict: "name" }, { name }, "resolution=ignore-duplicates,return=minimal");
      return { ok: 1 };
    }
    case "admin_cat_del": {
      await auth(req,["admin"]);
      await del("categories", { name: `eq.${bodyString(input,"name")}` });
      return { ok: 1 };
    }
    case "admin_bookings": {
      await auth(req,["admin"]);
      const rows = await get("bookings", { select: "id,status,slot_id,service_id,client_id,provider_id", order: "id.desc", limit: "100" });
      const [slots, services, people] = await Promise.all([
        relatedSlots([...new Set<number>(rows.map((r: any) => Number(r.slot_id)))]),
        relatedServices([...new Set<number>(rows.map((r: any) => Number(r.service_id)))]),
        relatedUsers([...new Set<number>(rows.flatMap((r: any) => [Number(r.client_id),Number(r.provider_id)]))]),
      ]);
      return rows.map((b: any) => ({ id:b.id, status:b.status, day:slots.find((x:any)=>Number(x.id)===Number(b.slot_id))?.day, hour:slots.find((x:any)=>Number(x.id)===Number(b.slot_id))?.hour, title:services.find((x:any)=>Number(x.id)===Number(b.service_id))?.title, client:people.find((x:any)=>Number(x.id)===Number(b.client_id))?.name, provider:people.find((x:any)=>Number(x.id)===Number(b.provider_id))?.name }));
    }
    default: fail(404, "Ação inválida");
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return response({ ok: true });
  try {
    if (!SERVICE_KEY || !SUPABASE_URL) fail(503, "A configuração segura do banco Supabase está indisponível.");
    if (PUBLIC_KEY && !safeEq(req.headers.get("apikey") ?? "", PUBLIC_KEY)) fail(401, "Chave pública inválida.");
    return response(await handle(req));
  } catch (e) {
    if (e instanceof ApiError) return response({ error: e.message }, e.status);
    console.error("Conecta Ela's Edge Function error", e instanceof Error ? e.name : "UnknownError");
    return response({ error: "Erro interno do servidor." }, 500);
  }
});
