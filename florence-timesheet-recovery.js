(() => {
  "use strict";

  const SUPABASE_URL = "https://pbbsaquwumxyrhqhnobv.supabase.co";
  const PUBLISHABLE_KEY = "sb_publishable_4D2Oc8FJjOXDXgGG7GbzfA_oYRpXSU5";
  const AUTH_STORAGE_KEY = "florence-auth-session";
  const STALE_AFTER_MS = 18 * 60 * 60 * 1000;
  let staleTimesheets = [];
  let staffNames = new Map();
  let loadPromise = null;

  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);

  function readSession() {
    try {
      const parsed = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || "null");
      const session = parsed?.currentSession || parsed?.session || parsed;
      return session?.access_token && session?.user?.id ? session : null;
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
    if (!session) throw new Error("Sign in to Florence to review old clock-ins.");
    const response = await fetch(`${SUPABASE_URL}${path}`, {
      ...options,
      headers: { ...headers(session), ...(options.headers || {}) },
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.message || payload?.error || "Florence could not review old clock-ins.");
    }
    return payload;
  }

  function closeModal() {
    document.querySelector("#timesheet-recovery-modal")?.remove();
    document.body.classList.remove("timesheet-recovery-modal-open");
  }

  function setStatus(message, error = false) {
    const status = document.querySelector("#timesheet-recovery-modal [data-timesheet-recovery-status]");
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("error", error);
    status.classList.toggle("hidden", !message);
  }

  function formatDateTime(value) {
    return new Intl.DateTimeFormat("en-AU", {
      timeZone: "Australia/Brisbane",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  }

  function renderBanner() {
    let banner = document.querySelector("#timesheet-recovery-banner");
    if (!staleTimesheets.length) {
      banner?.remove();
      closeModal();
      return;
    }
    if (!banner) {
      banner = document.createElement("aside");
      banner.id = "timesheet-recovery-banner";
      banner.className = "timesheet-recovery-banner";
      banner.setAttribute("role", "status");
      document.body.appendChild(banner);
    }
    banner.innerHTML = `
      <div>
        <strong>${staleTimesheets.length} old clock-in${staleTimesheets.length === 1 ? "" : "s"} need review</strong>
        <span>Enter the actual finish time so payroll records stay accurate.</span>
      </div>
      <button type="button" data-open-timesheet-recovery>Review now</button>`;
    banner.querySelector("[data-open-timesheet-recovery]")?.addEventListener("click", renderModal);
  }

  function renderModal() {
    closeModal();
    const modal = document.createElement("div");
    modal.id = "timesheet-recovery-modal";
    modal.className = "timesheet-recovery-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "timesheet-recovery-title");
    modal.innerHTML = `
      <div class="timesheet-recovery-backdrop" data-close-timesheet-recovery></div>
      <section class="timesheet-recovery-card">
        <button type="button" class="timesheet-recovery-close" data-close-timesheet-recovery aria-label="Close">×</button>
        <header>
          <p class="eyebrow">SUPERVISOR PAYROLL SAFEGUARD</p>
          <h2 id="timesheet-recovery-title">Resolve old clock-ins</h2>
          <p>Use the worker’s actual finish time. Florence PIN-signs the correction and keeps the before-and-after audit record.</p>
        </header>
        <div class="timesheet-recovery-list">
          ${staleTimesheets.map(timesheet => `
            <article data-stale-timesheet="${escapeHtml(timesheet.id)}">
              <div>
                <strong>${escapeHtml(staffNames.get(timesheet.staff_id) || "Worker")}</strong>
                <span>Started ${escapeHtml(formatDateTime(timesheet.clock_in))}</span>
                <small>${escapeHtml(timesheet.work_type || "Support work")}</small>
              </div>
              <button type="button" data-resolve-timesheet="${escapeHtml(timesheet.id)}">Enter actual finish</button>
            </article>`).join("")}
        </div>
        <form id="timesheet-recovery-form" class="hidden">
          <input name="timesheet_id" type="hidden">
          <p data-timesheet-worker></p>
          <label>Actual clock-out date and time
            <input name="clock_out" type="datetime-local" required>
          </label>
          <label>Unpaid break minutes
            <input name="break_minutes" type="number" min="0" max="1440" value="0" required>
          </label>
          <label>Correction reason
            <textarea name="reason" minlength="10" maxlength="1000" required placeholder="For example: Worker forgot to clock out at the end of the shift."></textarea>
          </label>
          <label>Your personal six-digit signing PIN
            <input name="pin" type="password" inputmode="numeric" autocomplete="off" pattern="[0-9]{6}" maxlength="6" required>
          </label>
          <p class="notice hidden" data-timesheet-recovery-status role="status" aria-live="polite"></p>
          <div class="timesheet-recovery-actions">
            <button type="button" class="secondary" data-cancel-timesheet-recovery>Back</button>
            <button type="submit" class="primary">PIN-sign correction</button>
          </div>
        </form>
      </section>`;
    document.body.appendChild(modal);
    document.body.classList.add("timesheet-recovery-modal-open");
    modal.querySelectorAll("[data-close-timesheet-recovery]").forEach(button => button.addEventListener("click", closeModal));
    modal.querySelectorAll("[data-resolve-timesheet]").forEach(button => button.addEventListener("click", () => showForm(button.dataset.resolveTimesheet)));
    modal.querySelector("[data-cancel-timesheet-recovery]")?.addEventListener("click", () => {
      modal.querySelector("#timesheet-recovery-form")?.classList.add("hidden");
      modal.querySelector(".timesheet-recovery-list")?.classList.remove("hidden");
      setStatus("");
    });
    modal.querySelector("#timesheet-recovery-form")?.addEventListener("submit", event => void submitCorrection(event));
    modal.querySelector("[data-resolve-timesheet]")?.focus();
  }

  function showForm(timesheetId) {
    const timesheet = staleTimesheets.find(item => item.id === timesheetId);
    const form = document.querySelector("#timesheet-recovery-form");
    if (!timesheet || !(form instanceof HTMLFormElement)) return;
    form.reset();
    form.elements.namedItem("timesheet_id").value = timesheet.id;
    const worker = form.querySelector("[data-timesheet-worker]");
    if (worker) worker.textContent = `${staffNames.get(timesheet.staff_id) || "Worker"} · started ${formatDateTime(timesheet.clock_in)}`;
    document.querySelector("#timesheet-recovery-modal .timesheet-recovery-list")?.classList.add("hidden");
    form.classList.remove("hidden");
    form.elements.namedItem("clock_out")?.focus();
  }

  async function submitCorrection(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('button[type="submit"]');
    const values = new FormData(form);
    const pin = String(values.get("pin") || "");
    const localClockOut = String(values.get("clock_out") || "");
    if (!/^\d{6}$/.test(pin)) return setStatus("Enter exactly six numbers for your signing PIN.", true);
    const clockOut = new Date(localClockOut);
    if (!localClockOut || Number.isNaN(clockOut.getTime())) return setStatus("Enter the worker’s actual finish date and time.", true);
    submit.disabled = true;
    setStatus("Saving the PIN-signed correction…");
    try {
      await request("/rest/v1/rpc/supervisor_resolve_open_timesheet", {
        method: "POST",
        body: JSON.stringify({
          p_timesheet_id: String(values.get("timesheet_id") || ""),
          p_clock_out: clockOut.toISOString(),
          p_break_minutes: Number(values.get("break_minutes") || 0),
          p_reason: String(values.get("reason") || "").trim(),
          p_pin: pin,
        }),
      });
      await load();
      if (staleTimesheets.length) renderModal();
      else closeModal();
    } catch (error) {
      setStatus(error.message || "Florence could not save the correction.", true);
    } finally {
      submit.disabled = false;
    }
  }

  async function load() {
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      const session = readSession();
      if (!session) {
        staleTimesheets = [];
        renderBanner();
        return;
      }
      const profiles = await request(`/rest/v1/profiles?id=eq.${encodeURIComponent(session.user.id)}&select=id,organisation_id,role,active`);
      const profile = Array.isArray(profiles) ? profiles[0] : null;
      if (!profile?.active || profile.role !== "supervisor") {
        staleTimesheets = [];
        renderBanner();
        return;
      }
      const cutoff = new Date(Date.now() - STALE_AFTER_MS).toISOString();
      const [timesheets, staff] = await Promise.all([
        request(`/rest/v1/timesheets?organisation_id=eq.${encodeURIComponent(profile.organisation_id)}&clock_out=is.null&clock_in=lt.${encodeURIComponent(cutoff)}&select=id,staff_id,clock_in,work_type,clock_in_notes&order=clock_in.asc`),
        request(`/rest/v1/profiles?organisation_id=eq.${encodeURIComponent(profile.organisation_id)}&select=id,full_name`),
      ]);
      staleTimesheets = Array.isArray(timesheets) ? timesheets : [];
      staffNames = new Map((Array.isArray(staff) ? staff : []).map(person => [person.id, person.full_name]));
      renderBanner();
    })().catch(() => {
      staleTimesheets = [];
      renderBanner();
    }).finally(() => {
      loadPromise = null;
    });
    return loadPromise;
  }

  window.addEventListener("storage", event => {
    if (event.key === AUTH_STORAGE_KEY) void load();
  });
  const authObserver = new MutationObserver(() => {
    if (!readSession() && document.querySelector('input[type="email"]')) {
      staleTimesheets = [];
      renderBanner();
    }
  });
  authObserver.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("focus", () => void load());
  window.setInterval(() => void load(), 5 * 60 * 1000);
  window.setTimeout(() => void load(), 1200);
})();
