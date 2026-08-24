(() => {
  "use strict";

  const SUPABASE_URL = "https://pbbsaquwumxyrhqhnobv.supabase.co";
  const PUBLISHABLE_KEY = "sb_publishable_4D2Oc8FJjOXDXgGG7GbzfA_oYRpXSU5";
  const AUTH_STORAGE_KEY = "florence-auth-session";
  let cachedContext = null;

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
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

  async function api(path, { method = "GET", body, headers = {} } = {}) {
    const session = readSession();
    if (!session) throw new Error("Florence is still opening your secure account. Try again in a moment.");
    const response = await fetch(`${SUPABASE_URL}${path}`, {
      method,
      headers: {
        apikey: PUBLISHABLE_KEY,
        Authorization: `Bearer ${session.access_token}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(errorBody.message || errorBody.error_description || errorBody.error || "Florence could not complete that secure request.");
    }
    if (response.status === 204) return null;
    return response.json();
  }

  async function loadContext(force = false) {
    if (cachedContext && !force && Date.now() - cachedContext.loadedAt < 60_000) return cachedContext;
    const session = readSession();
    if (!session) throw new Error("Sign in to Florence before opening this record.");
    const [profiles, participants, workers] = await Promise.all([
      api(`/rest/v1/profiles?id=eq.${encodeURIComponent(session.user.id)}&select=id,organisation_id,full_name,role,active`),
      api("/rest/v1/participants?select=id,full_name,preferred_name,status&status=eq.Active&order=full_name.asc"),
      api("/rest/v1/profiles?select=id,full_name&active=eq.true&order=full_name.asc"),
    ]);
    const profile = profiles?.[0];
    if (!profile?.active || !["staff", "support_worker", "supervisor"].includes(profile.role)) {
      throw new Error("This record is available to active Florence workers only.");
    }
    cachedContext = { profile, participants: participants || [], workers: workers || [], loadedAt: Date.now() };
    return cachedContext;
  }

  function icon() {
    return '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 17h16M6 17l1-6h10l1 6M8 11l1.5-4h5L16 11"/><circle cx="8" cy="18" r="1.4"/><circle cx="16" cy="18" r="1.4"/><path d="M5 7h2M17 7h2"/></svg>';
  }

  function addMainCommunityButton() {
    document.querySelectorAll(".community-intro").forEach((intro) => {
      const launcher = intro.nextElementSibling;
      const grid = launcher?.classList.contains("sil-form-launcher") ? launcher.querySelector(".sil-form-grid") : null;
      if (!grid || grid.querySelector("[data-vehicle-refusal-context='community']")) return;
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.vehicleRefusalContext = "community";
      button.innerHTML = `<span>${icon()}</span><strong>Vehicle refusal record</strong><small>Choice, continuous supervision, options and outcome</small><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>`;
      button.addEventListener("click", () => void openModal("community"));
      grid.appendChild(button);
    });
  }

  function addSilButtons() {
    const targets = [
      [document.querySelector(".sil-quick-grid"), "card"],
      [document.querySelector("#sil-shift-panel .sil-action-grid"), "secondary"],
      [document.querySelector("#sil-participants-panel .sil-action-grid"), "secondary"],
    ];
    for (const [host, style] of targets) {
      if (!host || host.querySelector("[data-vehicle-refusal-context='sil']")) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.vehicleRefusalContext = "sil";
      if (style === "secondary") {
        button.className = "secondary";
        button.textContent = "Vehicle refusal support record";
      } else {
        button.innerHTML = `<span>🚙</span><strong>Vehicle refusal</strong><small>Choice, safety controls and signed outcome</small>`;
      }
      button.addEventListener("click", () => void openModal("sil"));
      host.appendChild(button);
    }
  }

  function installEntryButtons() {
    if (!readSession()) return;
    addMainCommunityButton();
    addSilButtons();
  }

  function brisbaneLocalValue(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Australia/Brisbane", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(date).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  }

  function brisbaneLocalToIso(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
    if (!match) throw new Error("Enter a valid Brisbane date and time.");
    const [, year, month, day, hour, minute] = match;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour) - 10, Number(minute))).toISOString();
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat("en-AU", {
      timeZone: "Australia/Brisbane", dateStyle: "medium", timeStyle: "short",
    }).format(new Date(value));
  }

  function optionList(options, selected = "") {
    return options.map((option) => `<option${option === selected ? " selected" : ""}>${esc(option)}</option>`).join("");
  }

  function checkboxGroup(name, options, checked = []) {
    return `<div class="vehicle-checkbox-grid">${options.map((option) => `<label class="vehicle-check"><input type="checkbox" name="${esc(name)}" value="${esc(option)}"${checked.includes(option) ? " checked" : ""}><span>${esc(option)}</span></label>`).join("")}</div>`;
  }

  function formMarkup(context, serviceContext) {
    const evelyn = context.participants.find((participant) => /evelyn/i.test(`${participant.full_name || ""} ${participant.preferred_name || ""}`));
    const participants = context.participants.map((participant) => `<option value="${esc(participant.id)}"${participant.id === evelyn?.id ? " selected" : ""}>${esc(participant.full_name)}</option>`).join("");
    const serviceLabel = serviceContext === "sil" ? "Supported Independent Living" : "Community support";
    return `<form id="vehicle-refusal-form" class="vehicle-form">
      <input type="hidden" name="service_context" value="${esc(serviceContext)}">
      <div class="vehicle-context-pill">${esc(serviceLabel)}</div>
      <p class="vehicle-critical-rule"><strong>Non-negotiable:</strong> Respect Evelyn’s refusal and remain with her. Evelyn must never be left unattended in the vehicle. A replacement worker must physically arrive and accept handover before the current worker leaves.</p>
      <p class="vehicle-guidance">This is a supported decision-making and safety record, not automatically an incident report. If Evelyn was left unattended, harm occurred, or an incident threshold was met, complete the Incident Report as well.</p>

      <fieldset><legend>Participant, time and destination</legend>
        <label>Participant<select name="participant_id" required>${participants}</select></label>
        <div class="vehicle-field-pair">
          <label>Date and time<input name="occurred_at" type="datetime-local" value="${brisbaneLocalValue()}" required></label>
          <label>Destination or activity type<select name="destination_type" required>${optionList(["Shopping or errands", "Appointment", "Social or recreation", "Meal or cafe", "Returning home", "Medication or pharmacy", "Immediate emergency", "Other"], "Shopping or errands")}</select></label>
        </div>
        <label>Planned destination or activity<input name="planned_destination" placeholder="What was planned?" required></label>
        <label>Location when Evelyn refused<input name="location" placeholder="Safe parking location, venue or address"></label>
      </fieldset>

      <fieldset><legend>Evelyn’s choice and communication</legend>
        <p class="vehicle-field-help">Record what Evelyn actually said, showed or did. Do not guess, diagnose or use leading questions.</p>
        ${checkboxGroup("choice_communication", ["Words", "Gesture or body language", "Behaviour or actions", "Communication aid", "Other communication"])}
        <label>Evelyn’s exact words or factual behaviour<textarea name="participant_words" placeholder="For example: Evelyn said ‘no’ and remained seated with her seatbelt on." required></textarea></label>
        <label>Open, non-leading question asked<input name="open_question" placeholder="For example: What would you like to do?"></label>
        <label>Reason Evelyn stated<textarea name="reason_stated" placeholder="Write ‘Not stated’ if Evelyn did not give a reason."></textarea></label>
      </fieldset>

      <fieldset><legend>Information and genuine options</legend>
        <label>Information explained in clear, neutral language<textarea name="information_explained" placeholder="What purpose, timing, benefit or risk was explained without pressure?" required></textarea></label>
        ${checkboxGroup("options_offered", ["Pause and wait", "Quieter or safer location", "Modify the activity", "Kerbside, phone or drive-through service", "Return later or reschedule", "End outing or return home", "Approved replacement worker", "Emergency response", "Other genuine option"])}
        <label>Evelyn’s decision after options were offered<textarea name="participant_decision" required></textarea></label>
      </fieldset>

      <fieldset><legend>Continuous supervision and safety</legend>
        <label>Did the worker remain continuously with Evelyn?<select name="worker_remained" required>${optionList(["Yes — continuous supervision maintained", "No — immediate escalation required"], "Yes — continuous supervision maintained")}</select></label>
        <label>Immediate safety controls<textarea name="immediate_safety_controls" placeholder="Parking, handbrake, temperature, traffic, reassurance, time and active supervision." required></textarea></label>
        <div class="vehicle-field-pair">
          <label>Management contact<select name="management_contact">${optionList(["Not required", "Victoria Kussrow", "Candice Long"], "Not required")}</select></label>
          <label>Time contacted<input name="management_contact_time" type="time"></label>
        </div>
        <label>Management direction or decision<textarea name="management_direction"></textarea></label>
      </fieldset>

      <fieldset><legend>Outcome, health and follow-up</legend>
        <label>Service, pharmacist, clinician or emergency contact<input name="service_clinician_contact" placeholder="Name and role, if contacted"></label>
        <label>Advice received<textarea name="advice_received" placeholder="Record who gave the advice, the time and the exact direction."></textarea></label>
        <label>Outcome<textarea name="outcome" placeholder="What happened and where did Evelyn choose to go or remain?" required></textarea></label>
        <p class="vehicle-field-help">Choose “None” only when there was no health or medication impact.</p>
        ${checkboxGroup("health_medication_impacts", ["None", "Delayed access", "Delayed medication dose", "Missed medication dose", "Health change", "Emergency response"], ["None"])}
        <p class="vehicle-field-help">Select every additional record that must be completed.</p>
        ${checkboxGroup("records_required", ["Shift note", "MAR", "Incident report", "Near miss", "Risk review", "Support plan review", "Emergency response"])}
        <label>Follow-up required<textarea name="follow_up_required" placeholder="Action, responsible person and due time/date"></textarea></label>
      </fieldset>

      <label class="vehicle-check vehicle-declaration"><input type="checkbox" name="declaration" value="true" required><span>I declare that this is a true and factual record of Evelyn’s choice, the support provided, continuous supervision and the outcome.</span></label>
      <label>Your personal six-digit signing PIN<input name="pin" type="password" inputmode="numeric" autocomplete="off" maxlength="6" pattern="[0-9]{6}" required></label>
      <p id="vehicle-form-status" class="vehicle-error hidden" role="alert"></p>
      <div class="vehicle-modal-actions"><button type="button" data-vehicle-close>Close</button><button class="primary" type="submit">PIN sign and save record</button></div>
    </form>`;
  }

  async function saveRecord(form) {
    const data = new FormData(form);
    const value = (name) => String(data.get(name) || "").trim();
    const values = (name) => data.getAll(name).map(String).filter(Boolean);
    const choiceCommunication = values("choice_communication");
    const optionsOffered = values("options_offered");
    const healthImpacts = values("health_medication_impacts");
    const recordsRequired = values("records_required");
    const remained = value("worker_remained") === "Yes — continuous supervision maintained";

    if (!choiceCommunication.length) throw new Error("Record how Evelyn communicated her choice.");
    if (!optionsOffered.length) throw new Error("Record at least one genuine option offered.");
    if (healthImpacts.includes("None") && healthImpacts.length > 1) throw new Error("Choose None or the health and medication impacts, not both.");
    if (!remained && !["Victoria Kussrow", "Candice Long"].includes(value("management_contact"))) throw new Error("Contact Victoria or Candice immediately when continuous supervision was not maintained.");
    if (!remained && !recordsRequired.includes("Incident report")) throw new Error("Select Incident report because Evelyn was left unattended.");
    if (!/^\d{6}$/.test(value("pin"))) throw new Error("Enter your personal six-digit signing PIN.");
    if (value("declaration") !== "true") throw new Error("Confirm the factual record declaration.");

    const managementDirection = [
      value("management_contact_time") ? `Contact time: ${value("management_contact_time")}` : "",
      value("management_direction"),
    ].filter(Boolean).join(" · ");
    await api("/rest/v1/rpc/record_vehicle_refusal", {
      method: "POST",
      body: {
        p_participant_id: value("participant_id"),
        p_service_context: value("service_context"),
        p_occurred_at: brisbaneLocalToIso(value("occurred_at")),
        p_destination_type: value("destination_type"),
        p_planned_destination: value("planned_destination"),
        p_location: value("location") || null,
        p_choice_communication: choiceCommunication,
        p_participant_words: value("participant_words"),
        p_open_question: value("open_question") || null,
        p_reason_stated: value("reason_stated") || "Not stated",
        p_information_explained: value("information_explained"),
        p_options_offered: optionsOffered,
        p_participant_decision: value("participant_decision"),
        p_immediate_safety_controls: value("immediate_safety_controls"),
        p_worker_remained_with_participant: remained,
        p_management_contact: value("management_contact") === "Not required" ? null : value("management_contact"),
        p_management_direction: managementDirection || null,
        p_service_clinician_contact: value("service_clinician_contact") || null,
        p_advice_received: value("advice_received") || null,
        p_outcome: value("outcome"),
        p_health_medication_impacts: healthImpacts,
        p_records_required: recordsRequired,
        p_follow_up_required: value("follow_up_required") || null,
        p_pin: value("pin"),
        p_declaration_confirmed: true,
      },
      headers: { Prefer: "return=representation" },
    });
  }

  function historyCard(record, context) {
    const fields = record.fields || {};
    const participant = context.participants.find((item) => item.id === record.participant_id)?.full_name || "Participant";
    const worker = context.workers.find((item) => item.id === record.staff_id)?.full_name || fields.signed_by || "Florence worker";
    const contextLabel = fields.service_context === "sil" ? "SIL" : "Community support";
    const supervision = fields.worker_remained_with_participant ? "Continuous supervision maintained" : "Supervision breach — management review required";
    return `<article class="vehicle-history-card ${fields.worker_remained_with_participant ? "" : "needs-review"}">
      <header><div><strong>${esc(participant)} · ${esc(fields.destination_type || "Vehicle refusal")}</strong><small>${esc(formatDate(fields.occurred_at || record.created_at))} · ${esc(worker)}</small></div><span>${esc(contextLabel)}</span></header>
      <p><strong>Planned:</strong> ${esc(fields.planned_destination)}</p>
      <p><strong>Choice:</strong> ${esc(fields.participant_words_or_behaviour)}</p>
      <p><strong>Decision:</strong> ${esc(fields.participant_decision)}</p>
      <p><strong>Outcome:</strong> ${esc(fields.outcome)}</p>
      <p class="vehicle-supervision"><strong>${esc(supervision)}</strong></p>
      <footer><span>PIN verified · signed ${esc(formatDate(fields.signed_at || record.created_at))}</span><a href="${esc(new URL(`sil-record.html?id=${record.id}`, location.href).href)}">Open completed record</a></footer>
    </article>`;
  }

  async function renderHistory(host, context, serviceContext) {
    host.innerHTML = '<p class="vehicle-loading">Loading signed records…</p>';
    try {
      const records = await api("/rest/v1/sil_records?record_type=eq.vehicleRefusal&select=id,participant_id,staff_id,title,fields,status,created_at&order=created_at.desc&limit=100");
      const filtered = (records || []).filter((record) => record.fields?.service_context === serviceContext);
      await api("/rest/v1/rpc/record_access_event", {
        method: "POST",
        body: { p_action: "VIEW", p_table_name: "sil_records", p_record_id: null, p_metadata: { view: "vehicle_refusal_history", service_context: serviceContext } },
      }).catch(() => null);
      host.innerHTML = filtered.length ? filtered.map((record) => historyCard(record, context)).join("") : '<div class="vehicle-empty"><strong>No signed vehicle refusal records yet</strong><p>New records for this support area will appear here.</p></div>';
    } catch (error) {
      host.innerHTML = `<p class="vehicle-error" role="alert">${esc(error.message)}</p>`;
    }
  }

  function closeModal() {
    document.querySelector("#florence-vehicle-refusal-modal")?.remove();
  }

  async function openModal(serviceContext) {
    if (document.querySelector("#florence-vehicle-refusal-modal")) return;
    try {
      const context = await loadContext();
      if (!context.participants.length) throw new Error("No assigned active participant is available for this record.");
      const layer = document.createElement("div");
      layer.id = "florence-vehicle-refusal-modal";
      layer.className = "vehicle-modal-layer";
      layer.setAttribute("role", "dialog");
      layer.setAttribute("aria-modal", "true");
      layer.innerHTML = `<button class="vehicle-modal-scrim" data-vehicle-close aria-label="Close vehicle refusal record"></button><section class="vehicle-modal"><button class="vehicle-modal-close" type="button" data-vehicle-close aria-label="Close">×</button><span class="vehicle-modal-icon">${icon()}</span><p class="eyebrow">FLORENCE SECURE SUPPORT RECORD</p><h2>Community access & vehicle refusal</h2><p class="vehicle-modal-subtitle">Record Evelyn’s choice, continuous supervision, options, outcome and required follow-up.</p><div class="vehicle-modal-tabs"><button type="button" class="active" data-vehicle-tab="record">New record</button><button type="button" data-vehicle-tab="history">Signed history</button></div><div data-vehicle-panel="record">${formMarkup(context, serviceContext)}</div><div data-vehicle-panel="history" class="hidden"><div id="vehicle-history-list"></div><div class="vehicle-modal-actions"><button type="button" data-vehicle-close>Close</button></div></div></section>`;
      document.body.appendChild(layer);
      layer.querySelectorAll("[data-vehicle-close]").forEach((button) => button.addEventListener("click", closeModal));
      layer.querySelectorAll("[data-vehicle-tab]").forEach((button) => button.addEventListener("click", () => {
        layer.querySelectorAll("[data-vehicle-tab]").forEach((item) => item.classList.toggle("active", item === button));
        layer.querySelectorAll("[data-vehicle-panel]").forEach((panel) => panel.classList.toggle("hidden", panel.dataset.vehiclePanel !== button.dataset.vehicleTab));
        if (button.dataset.vehicleTab === "history") void renderHistory(layer.querySelector("#vehicle-history-list"), context, serviceContext);
      }));
      const form = layer.querySelector("#vehicle-refusal-form");
      form.addEventListener("change", (event) => {
        if (event.target.name === "health_medication_impacts") {
          const none = form.querySelector("input[name='health_medication_impacts'][value='None']");
          const others = [...form.querySelectorAll("input[name='health_medication_impacts']:not([value='None'])")];
          if (event.target === none && none.checked) others.forEach((input) => { input.checked = false; });
          if (event.target !== none && event.target.checked) none.checked = false;
        }
        if (event.target.name === "worker_remained" && event.target.value.startsWith("No")) {
          form.querySelector("select[name='management_contact']").focus();
        }
      });
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const status = form.querySelector("#vehicle-form-status");
        const submit = form.querySelector("button[type='submit']");
        status.textContent = "";
        status.classList.add("hidden");
        submit.disabled = true;
        submit.textContent = "Checking PIN and saving…";
        try {
          await saveRecord(form);
          form.reset();
          layer.querySelector("[data-vehicle-tab='history']").click();
          const success = document.createElement("p");
          success.className = "vehicle-success";
          success.textContent = "Vehicle refusal support record PIN signed and saved securely.";
          layer.querySelector("[data-vehicle-panel='history']").prepend(success);
        } catch (error) {
          status.textContent = error.message || "Florence could not save this record.";
          status.classList.remove("hidden");
          status.scrollIntoView({ behavior: "smooth", block: "center" });
        } finally {
          submit.disabled = false;
          submit.textContent = "PIN sign and save record";
        }
      });
    } catch (error) {
      const message = document.createElement("div");
      message.className = "vehicle-floating-error";
      message.textContent = error.message || "Florence could not open this record.";
      document.body.appendChild(message);
      setTimeout(() => message.remove(), 4500);
    }
  }

  const observer = new MutationObserver(installEntryButtons);
  function start() {
    observer.observe(document.body, { childList: true, subtree: true });
    installEntryButtons();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
