(() => {
  "use strict";

  const SUPABASE_URL = "https://pbbsaquwumxyrhqhnobv.supabase.co";
  const PUBLISHABLE_KEY = "sb_publishable_4D2Oc8FJjOXDXgGG7GbzfA_oYRpXSU5";
  const AUTH_STORAGE_KEY = "florence-auth-session";
  const SETUP_VERSION = "2026-08-24";
  let contextPromise = null;
  let observerQueued = false;

  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);

  function readSession() {
    try {
      const parsed = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || "null");
      const session = parsed?.currentSession || parsed?.session || parsed;
      if (!session?.access_token || !session?.user?.id) return null;
      return session;
    } catch {
      return null;
    }
  }

  function headers(session) {
    return {
      apikey: PUBLISHABLE_KEY,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    };
  }

  async function request(path, options = {}) {
    const session = readSession();
    if (!session) throw new Error("Sign in to Florence before managing portal access.");
    let response;
    try {
      response = await fetch(`${SUPABASE_URL}${path}`, {
        ...options,
        headers: { ...headers(session), ...(options.headers || {}) },
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });
    } catch {
      throw new Error("Florence could not reach secure account setup. Check your connection and try again.");
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || payload?.message || "Florence could not manage portal access.");
    return payload;
  }

  async function loadContext() {
    if (contextPromise) return contextPromise;
    contextPromise = (async () => {
      const session = readSession();
      if (!session) return null;
      const [profiles, participants] = await Promise.all([
        request(`/rest/v1/profiles?id=eq.${encodeURIComponent(session.user.id)}&select=id,organisation_id,role,active`),
        request("/rest/v1/participants?select=id,full_name,preferred_name,status&status=eq.Active&order=full_name.asc"),
      ]);
      const profile = Array.isArray(profiles) ? profiles[0] : null;
      if (!profile?.active || profile.role !== "supervisor") return null;
      return { profile, participants: Array.isArray(participants) ? participants : [] };
    })().catch(error => {
      contextPromise = null;
      throw error;
    });
    return contextPromise;
  }

  function closeModal() {
    document.querySelector("#portal-access-modal")?.remove();
    document.body.classList.remove("portal-access-modal-open");
  }

  function showStatus(element, message, error = false) {
    element.textContent = message;
    element.classList.toggle("error", error);
    element.classList.remove("hidden");
  }

  function encodeSetupPayload(payload) {
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function setupLink(result) {
    const token = encodeSetupPayload({
      email: result.email,
      code: result.setup_code,
      role: result.role,
      version: SETUP_VERSION,
    });
    return new URL(`set-password.html#setup=${token}`, location.href).toString();
  }

  async function copyText(value, status, successMessage) {
    try {
      await navigator.clipboard.writeText(value);
      showStatus(status, successMessage);
    } catch {
      const input = document.createElement("textarea");
      input.value = value;
      input.setAttribute("readonly", "");
      input.className = "portal-access-copy-fallback";
      document.body.appendChild(input);
      input.select();
      const copied = document.execCommand?.("copy");
      input.remove();
      showStatus(status, copied ? successMessage : "Press and hold the link above, then tap Copy.", !copied);
    }
  }

  function showLink(result) {
    closeModal();
    const link = setupLink(result);
    const modal = document.createElement("div");
    modal.id = "portal-access-modal";
    modal.className = "portal-access-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "portal-access-link-title");
    modal.innerHTML = `
      <div class="portal-access-backdrop" data-close-portal-access></div>
      <section class="portal-access-card portal-access-link-card">
        <p class="eyebrow">PRIVATE ONE-TIME LINK</p>
        <h2 id="portal-access-link-title">Portal setup link ready</h2>
        <p>Send this link privately to <strong>${escapeHtml(result.full_name || result.email)}</strong>. It expires in ${Number(result.expires_minutes) || 30} minutes and works once.</p>
        <label>Secure setup link
          <textarea readonly data-portal-setup-link>${escapeHtml(link)}</textarea>
        </label>
        <div class="portal-access-actions">
          <button type="button" class="primary" data-copy-portal-link>Copy secure link</button>
          <button type="button" class="secondary" data-share-portal-link>Share securely</button>
          <button type="button" class="secondary" data-copy-portal-code>Copy code only</button>
          <button type="button" class="secondary" data-finish-portal-access>Done</button>
        </div>
        <p class="notice hidden" data-portal-access-status role="status" aria-live="polite"></p>
        <p class="portal-access-privacy">Only the authorised person should open this link. Florence limits them to the participant portal information approved for their role.</p>
      </section>`;
    document.body.appendChild(modal);
    document.body.classList.add("portal-access-modal-open");
    const status = modal.querySelector("[data-portal-access-status]");
    modal.querySelector("[data-copy-portal-link]").onclick = () => copyText(link, status, "Secure setup link copied.");
    modal.querySelector("[data-copy-portal-code]").onclick = () => copyText(String(result.setup_code), status, "One-time setup code copied.");
    modal.querySelector("[data-share-portal-link]").onclick = async () => {
      if (!navigator.share) return copyText(link, status, "Secure setup link copied.");
      try {
        await navigator.share({
          title: "Florence portal account setup",
          text: `Use this private one-time link to set up your Florence ${result.role === "client" ? "participant" : "family"} portal account. It expires in ${Number(result.expires_minutes) || 30} minutes.`,
          url: link,
        });
        showStatus(status, "Secure share sheet opened.");
      } catch (error) {
        if (error?.name !== "AbortError") showStatus(status, "The share sheet could not open. Copy the secure link instead.", true);
      }
    };
    modal.querySelector("[data-finish-portal-access]").onclick = () => location.reload();
    modal.querySelector("[data-close-portal-access]").onclick = () => closeModal();
    requestAnimationFrame(() => modal.querySelector("[data-copy-portal-link]")?.focus());
  }

  function updateRelationship(form) {
    const role = form.elements.namedItem("role")?.value;
    const relationship = form.elements.namedItem("relationship");
    const fullName = form.elements.namedItem("full_name");
    if (!(relationship instanceof HTMLInputElement)) return;
    const family = role === "family";
    const participantName = form.dataset.participantName || "";
    const previousRole = form.dataset.currentRole;
    if (fullName instanceof HTMLInputElement) {
      if (family && previousRole === "client" && fullName.value === participantName) fullName.value = "";
      if (!family && !fullName.value.trim()) fullName.value = participantName;
    }
    relationship.required = family;
    relationship.disabled = !family;
    relationship.closest("label")?.classList.toggle("hidden", !family);
    if (!family) relationship.value = "Participant";
    else if (relationship.value === "Participant") relationship.value = "";
    form.dataset.currentRole = role;
  }

  async function openInvite() {
    const context = await loadContext();
    if (!context) throw new Error("Only an active Florence supervisor can add portal access.");
    if (!context.participants.length) throw new Error("Add Ash as a participant before creating portal access.");
    const ashParticipant = context.participants.find(participant => /^ash(?:\s|$)/i.test(participant.preferred_name || participant.full_name)) || context.participants[0];
    closeModal();
    const modal = document.createElement("div");
    modal.id = "portal-access-modal";
    modal.className = "portal-access-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "portal-access-title");
    modal.innerHTML = `
      <div class="portal-access-backdrop" data-close-portal-access></div>
      <section class="portal-access-card">
        <button type="button" class="portal-access-close" data-close-portal-access aria-label="Close">×</button>
        <p class="eyebrow">FAMILY & PARTICIPANT PORTAL</p>
        <h2 id="portal-access-title">Add portal access</h2>
        <p>Create Ash’s own participant login or a separate family login for Ash’s mum. Each account is linked only to the selected participant.</p>
        <form id="portal-access-form" data-participant-name="${escapeHtml(ashParticipant.full_name)}">
          <label>Portal account type
            <select name="role" required>
              <option value="client">Participant portal — for Ash</option>
              <option value="family">Family portal — for Ash’s mum or representative</option>
            </select>
          </label>
          <label>Person’s full name
            <input name="full_name" autocomplete="name" value="${escapeHtml(ashParticipant.full_name)}" required>
          </label>
          <label>Email address
            <input name="email" type="email" inputmode="email" autocomplete="email" required>
          </label>
          <label>Linked participant
            <select name="participant_id" required>
              <option value="">Choose participant</option>
              ${context.participants.map(participant => `<option value="${escapeHtml(participant.id)}"${participant.id === ashParticipant.id ? " selected" : ""}>${escapeHtml(participant.preferred_name || participant.full_name)}</option>`).join("")}
            </select>
          </label>
          <label class="hidden">Relationship to participant
            <input name="relationship" placeholder="For example: Mum, guardian or nominee">
          </label>
          <label class="portal-access-confirm">
            <input name="authorisation_confirmed" type="checkbox" value="true" required>
            <span>I confirm this person is authorised for this participant and I will send the setup link privately.</span>
          </label>
          <p class="portal-access-privacy">Portal users can see approved updates, messages, complaints, resources and other portal information only. They cannot see MAR, incidents, finance, internal notes or staff records.</p>
          <p class="notice hidden" data-portal-access-status role="status" aria-live="polite"></p>
          <div class="portal-access-actions">
            <button type="button" class="secondary" data-close-portal-access>Cancel</button>
            <button type="submit" class="primary" data-create-portal-access>Create secure link</button>
          </div>
        </form>
      </section>`;
    document.body.appendChild(modal);
    document.body.classList.add("portal-access-modal-open");
    const form = modal.querySelector("#portal-access-form");
    const status = modal.querySelector("[data-portal-access-status]");
    form.elements.namedItem("role").addEventListener("change", () => updateRelationship(form));
    updateRelationship(form);
    modal.querySelectorAll("[data-close-portal-access]").forEach(button => button.addEventListener("click", closeModal));
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const button = form.querySelector("[data-create-portal-access]");
      const values = new FormData(form);
      const role = String(values.get("role") || "");
      const relationship = role === "family" ? String(values.get("relationship") || "").trim() : "Participant";
      if (role === "family" && !relationship) return showStatus(status, "Record Ash’s mum’s relationship to Ash.", true);
      button.disabled = true;
      button.textContent = "Creating secure link…";
      showStatus(status, "Checking supervisor access and preparing the private setup link.");
      try {
        const result = await request("/functions/v1/account-setup-admin", {
          method: "POST",
          body: JSON.stringify({
            action: "invite",
            full_name: String(values.get("full_name") || "").trim(),
            email: String(values.get("email") || "").trim().toLowerCase(),
            role,
            participant_id: String(values.get("participant_id") || ""),
            relationship,
            authorisation_confirmed: values.get("authorisation_confirmed") === "true",
          }),
        });
        showLink({ ...result, full_name: String(values.get("full_name") || "").trim(), role });
      } catch (error) {
        showStatus(status, error?.message || "Florence could not create the portal setup link.", true);
        button.disabled = false;
        button.textContent = "Create secure link";
      }
    });
    requestAnimationFrame(() => form.elements.namedItem("full_name")?.focus());
  }

  function ensureLauncher() {
    if (document.querySelector("#portal-access-invite-panel")) return;
    const heading = [...document.querySelectorAll(".module-head h1")].find(element => element.textContent?.trim() === "Family & participant portal");
    if (!heading) return;
    loadContext().then(context => {
      if (!context || document.querySelector("#portal-access-invite-panel") || !heading.isConnected) return;
      const panel = document.createElement("section");
      panel.id = "portal-access-invite-panel";
      panel.className = "panel portal-access-invite-panel";
      panel.innerHTML = `
        <div>
          <p class="eyebrow">PORTAL ACCESS</p>
          <h2>Add Ash and authorised family</h2>
          <p>Create separate, participant-linked accounts and send each person a private one-time setup link.</p>
        </div>
        <button type="button" class="primary" data-open-portal-access>+ Add portal access</button>`;
      heading.closest(".module-head")?.insertAdjacentElement("afterend", panel);
      panel.querySelector("[data-open-portal-access]").onclick = async () => {
        try {
          await openInvite();
        } catch (error) {
          alert(error?.message || "Florence could not open portal access setup.");
        }
      };
    }).catch(() => {});
  }

  function queueLauncher() {
    if (observerQueued) return;
    observerQueued = true;
    requestAnimationFrame(() => {
      observerQueued = false;
      ensureLauncher();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", queueLauncher, { once: true });
  else queueLauncher();
  new MutationObserver(queueLauncher).observe(document.documentElement, { childList: true, subtree: true });
})();
