import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";

const DEFAULT_APP_URL = "https://i-care-connect.candi1505.workers.dev/";
const optionalEnv = (name: string) => String(Deno.env.get(name) || "").trim();
const env = (name: string) => {
  const value = optionalEnv(name);
  if (!value) throw new Error(`Missing Edge Function secret: ${name}`);
  return value;
};
const admin = () => createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

function normaliseUrl(value: string) {
  const cleaned = String(value || "").trim().replace(/^["']|["']$/g, "");
  if (!cleaned) return null;
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`);
  } catch {
    return null;
  }
}

function configuredOrigins() {
  const origins = new Set<string>([new URL(DEFAULT_APP_URL).origin]);
  const configuredApp = normaliseUrl(optionalEnv("FLORENCE_APP_URL"));
  if (configuredApp) origins.add(configuredApp.origin);
  for (const item of optionalEnv("FLORENCE_ALLOWED_ORIGINS").split(/[\n,]+/).map(value => value.trim()).filter(Boolean)) {
    const parsed = normaliseUrl(item);
    if (parsed) origins.add(parsed.origin);
  }
  return origins;
}

function originAllowed(req: Request) {
  const origin = req.headers.get("Origin");
  return !origin || configuredOrigins().has(origin);
}

function corsHeaders(req: Request, echoRequestOrigin = false) {
  const origin = req.headers.get("Origin");
  const allowed = configuredOrigins();
  const selected = origin && (allowed.has(origin) || echoRequestOrigin) ? origin : [...allowed][0];
  return {
    "Access-Control-Allow-Origin": selected,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

const json = (req: Request, body: unknown, status = 200, echoRequestOrigin = false) => new Response(JSON.stringify(body), {
  status,
  headers: {
    ...corsHeaders(req, echoRequestOrigin),
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  },
});

function jwtClaims(token: string): Record<string, unknown> {
  const part = token.split(".")[1];
  if (!part) throw new Error("Invalid Florence access token");
  const base64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
  const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function supervisorContext(req: Request) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Sign in to Florence first");
  const db = admin();
  const { data: { user }, error: userError } = await db.auth.getUser(token);
  if (userError || !user) throw new Error("Your Florence session has expired");
  const claims = jwtClaims(token);
  if (claims.sub !== user.id || claims.aal !== "aal2") throw new Error("Multi-factor authentication is required");
  const { data: profile, error } = await db.from("profiles").select("id,organisation_id,role,active").eq("id", user.id).single();
  if (error || !profile?.active || profile.role !== "supervisor") throw new Error("Only active supervisors can manage account setup");
  return { db, user, profile };
}

async function authUsers(db: ReturnType<typeof admin>) {
  const users = [];
  let page = 1;
  while (page <= 10) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 100) break;
    page++;
  }
  return users;
}

const normaliseEmail = (value: unknown) => String(value || "").trim().toLowerCase();
const sha256 = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))))
  .map(byte => byte.toString(16).padStart(2, "0")).join("");
const setupCode = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 100000000).padStart(8, "0");

async function issueCode(db: ReturnType<typeof admin>, organisationId: string, userId: string, email: string, createdBy: string) {
  const { error: expiryError } = await db.from("account_setup_codes").update({ used_at: new Date().toISOString() }).eq("user_id", userId).is("used_at", null);
  if (expiryError) throw expiryError;
  const code = setupCode();
  const { error } = await db.from("account_setup_codes").insert({
    organisation_id: organisationId,
    user_id: userId,
    email,
    code_hash: await sha256(code),
    expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    created_by: createdBy,
  });
  if (error) throw error;
  return code;
}

async function audit(db: ReturnType<typeof admin>, organisationId: string, actorId: string, action: "INSERT" | "UPDATE", recordId: string, details: Record<string, unknown>) {
  const { error } = await db.from("audit_events").insert({
    organisation_id: organisationId,
    actor_id: actorId,
    table_name: "profiles",
    record_id: recordId,
    action,
    after_data: details,
  });
  if (error) throw error;
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") {
    return originAllowed(req)
      ? new Response("ok", { headers: corsHeaders(req) })
      : new Response("Origin not permitted", { status: 403, headers: corsHeaders(req, true) });
  }
  if (!originAllowed(req)) return json(req, { error: `Request origin ${req.headers.get("Origin") || "unknown"} is not permitted` }, 403, true);
  try {
    if (req.method !== "POST") return json(req, { error: "POST required" }, 405);
    const { db, user, profile } = await supervisorContext(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");

    if (action === "invite") {
      const email = normaliseEmail(body.email);
      const fullName = String(body.full_name || "").trim();
      const allowedRoles = ["staff", "supervisor", "family", "client"];
      const role = allowedRoles.includes(body.role) ? String(body.role) : "staff";
      const portalRole = ["family", "client"].includes(role);
      const participantId = portalRole ? String(body.participant_id || "") : null;
      const relationship = portalRole ? String(body.relationship || "").trim() : null;
      if (!fullName || !/^\S+@\S+\.\S+$/.test(email)) throw new Error("A valid name and email are required");
      if (portalRole) {
        if (body.authorisation_confirmed !== true) throw new Error("Confirm this person is authorised for the participant");
        if (role === "family" && !relationship) throw new Error("Record the family representative's relationship to the participant");
        const { data, error } = await db.from("participants").select("id").eq("id", participantId).eq("organisation_id", profile.organisation_id).single();
        if (error || !data) throw new Error("Choose a valid participant for this portal account");
      }

      const users = await authUsers(db);
      let authUser = users.find(item => normaliseEmail(item.email) === email) || null;
      const existing = Boolean(authUser);
      let existingProfile = null;
      if (authUser) {
        const lookup = await db.from("profiles").select("organisation_id,role,active,portal_access_acknowledged_at").eq("id", authUser.id).maybeSingle();
        if (lookup.error) throw lookup.error;
        existingProfile = lookup.data;
        if (existingProfile && existingProfile.organisation_id !== profile.organisation_id) throw new Error("This email is already linked to another Florence organisation");
        const { data, error } = await db.auth.admin.updateUserById(authUser.id, {
          email_confirm: true,
          user_metadata: { ...authUser.user_metadata, full_name: fullName, organisation_id: profile.organisation_id, role, participant_id: participantId },
        });
        if (error || !data.user) throw new Error(error?.message || "Account could not be updated");
        authUser = data.user;
      } else {
        const { data, error } = await db.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: { full_name: fullName, organisation_id: profile.organisation_id, role, participant_id: participantId },
        });
        if (error || !data.user) throw new Error(error?.message || "Account could not be created");
        authUser = data.user;
      }

      const priorRole = String(existingProfile?.role || "");
      const needsPortalActivation = portalRole && (!existingProfile?.portal_access_acknowledged_at || !["family", "client"].includes(priorRole));
      const active = needsPortalActivation ? false : (existingProfile?.active ?? true);
      const { error: profileError } = await db.from("profiles").upsert({
        id: authUser.id,
        organisation_id: profile.organisation_id,
        participant_id: participantId,
        full_name: fullName,
        email,
        role,
        active,
        portal_relationship: relationship,
      }, { onConflict: "id" });
      if (profileError) {
        if (!existing) await db.auth.admin.deleteUser(authUser.id);
        throw profileError;
      }
      const code = await issueCode(db, profile.organisation_id, authUser.id, email, user.id);
      await audit(db, profile.organisation_id, user.id, existing ? "UPDATE" : "INSERT", authUser.id, {
        event: existing ? "setup_code_reissued" : "account_created_with_setup_code",
        role,
        participant_id: participantId,
        relationship,
        portal_activation_required: needsPortalActivation,
        authorisation_confirmed: true,
      });
      return json(req, {
        success: true,
        user_id: authUser.id,
        existing,
        setup_code: code,
        expires_minutes: 30,
        email,
        role,
        participant_id: participantId,
        activation_required: needsPortalActivation,
      });
    }

    if (action === "generate-code") {
      const userId = String(body.user_id || "");
      const { data: target, error } = await db.from("profiles").select("id,email,role,active").eq("id", userId).eq("organisation_id", profile.organisation_id).single();
      if (error || !target?.active || !target.email) throw new Error("Active Florence account with an email address not found");
      const code = await issueCode(db, profile.organisation_id, target.id, normaliseEmail(target.email), user.id);
      await audit(db, profile.organisation_id, user.id, "UPDATE", target.id, { event: "setup_code_reissued" });
      return json(req, { success: true, setup_code: code, expires_minutes: 30, email: target.email, role: target.role });
    }
    return json(req, { error: "Unknown account setup action" }, 400);
  } catch (error) {
    const record = error && typeof error === "object" ? error as Record<string, unknown> : null;
    const message = error instanceof Error ? error.message : String(record?.message || record?.details || record?.hint || record?.code || error || "Account setup failed");
    console.error("account-setup-admin error:", message);
    return json(req, { error: message }, 400);
  }
});
