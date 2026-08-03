(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const bridge = () => window.FlorenceBridge;
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[character]));
  const displayDate = value => value
    ? new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value))
    : "Not recorded";
  const displayDateTime = value => value
    ? new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value))
    : "";

  let activeParticipantId = "";
  let activeTab = "overview";
  let participants = [];
  let currentFile = null;
  let mounting = false;

  function empty(message) {
    return `<div class="empty">${escapeHtml(message)}</div>`;
  }

  function field(label, value) {
    return `<article class="pf-field"><h4>${escapeHtml(label)}</h4><p>${value ? escapeHtml(value).replace(/\n/g, "<br>") : "Not recorded"}</p></article>`;
  }

  function badge(text, kind = "good") {
    return `<span class="badge ${kind}">${escapeHtml(text)}</span>`;
  }

  function openView(view) {
    const button = $$(`[data-view="${view}"]`).find(element => !element.classList.contains("hidden"));
    if (button) button.click();
  }

  async function loadFile(participant) {
    const database = bridge().db;
    const participantId = participant.id;
    const [medications, notes, timeline, documents, incidents, shifts] = await Promise.all([
      database.from("medications")
        .select("id,medication_name,dose,route,administration_time,medication_type,instructions,active,ceased_at,hold_from,hold_until,prn_indication,max_prn_dose")
        .eq("participant_id", participantId)
        .order("administration_time"),
      database.from("progress_notes")
        .select("id,category,content,status,recorded_at")
        .eq("participant_id", participantId)
        .order("recorded_at", { ascending: false })
        .limit(10),
      database.from("client_timeline")
        .select("id,event_type,severity,occurred_at,title,description,action_taken,follow_up")
        .eq("participant_id", participantId)
        .order("occurred_at", { ascending: false })
        .limit(15),
      database.from("compliance_documents")
        .select("id,title,category,review_date,version,uploaded_at")
        .eq("scope", "Participant")
        .eq("subject_id", participantId)
        .order("uploaded_at", { ascending: false }),
      database.from("incidents")
        .select("id,category,severity,status,occurred_at,description")
        .eq("participant_id", participantId)
        .order("occurred_at", { ascending: false })
        .limit(10),
      database.from("shifts")
        .select("id,starts_at,ends_at,status,response,shift_type")
        .eq("participant_id", participantId)
        .gte("ends_at", new Date().toISOString())
        .order("starts_at")
        .limit(5)
    ]);

    return {
      participant,
      medications: medications.data || [],
      notes: notes.data || [],
      timeline: timeline.data || [],
      documents: documents.data || [],
      incidents: incidents.data || [],
      shifts: shifts.data || []
    };
  }

  function hero(file) {
    const participant = file.participant;
    const name = participant.preferred_name || participant.full_name || "Participant";
    const warnings = [
      participant.allergies ? `Allergies: ${participant.allergies}` : "",
      participant.risks_and_safeguards ? `Risks and safeguards: ${participant.risks_and_safeguards}` : ""
    ].filter(Boolean);

    return `
      <section class="pf-hero">
        <div>
          <p class="eyebrow">Participant file</p>
          <h2>${escapeHtml(name)}</h2>
          <p>${escapeHtml(participant.full_name || name)}${participant.date_of_birth ? ` · DOB ${escapeHtml(displayDate(participant.date_of_birth))}` : ""}</p>
        </div>
        <div class="pf-badges">
          ${badge(participant.status || "Active", String(participant.status).toLowerCase() === "active" ? "good" : "amber")}
          ${participant.care_plan_approved_at ? badge("Care plan approved", "good") : badge("Care plan pending", "amber")}
        </div>
      </section>
      ${warnings.length ? `<div class="pf-warning">${warnings.map(escapeHtml).join("<br>")}</div>` : ""}
    `;
  }

  function overview(file) {
    const participant = file.participant;
    const activeMedications = file.medications.filter(item => item.active && !item.ceased_at);
    const regularCount = activeMedications.filter(item => String(item.medication_type).toLowerCase() !== "prn").length;
    const prnCount = activeMedications.filter(item => String(item.medication_type).toLowerCase() === "prn").length;
    const openIncidents = file.incidents.filter(item => String(item.status).toLowerCase() !== "closed").length;
    const nextShift = file.shifts[0];

    return `
      <div class="pf-stats">
        <article><strong>${activeMedications.length}</strong><span>Active medications</span></article>
        <article><strong>${prnCount}</strong><span>PRN medications</span></article>
        <article><strong>${file.notes.length}</strong><span>Recent notes</span></article>
        <article><strong>${file.documents.length}</strong><span>Documents</span></article>
      </div>
      <div class="pf-grid pf-two">
        <article class="panel">
          <div class="panel-head"><div><p class="eyebrow">Care essentials</p><h3>What workers need to know</h3></div></div>
          <div class="pf-grid">
            ${field("Communication needs", participant.communication_needs)}
            ${field("Preferences", participant.preferences)}
            ${field("Diagnoses", participant.diagnoses)}
            ${field("Allergies", participant.allergies)}
            ${field("Risks and safeguards", participant.risks_and_safeguards)}
            ${field("Goals", participant.goals)}
          </div>
        </article>
        <article class="panel">
          <div class="panel-head"><div><p class="eyebrow">At a glance</p><h3>Current picture</h3></div></div>
          <div class="pf-row"><strong>Regular medications</strong><span>${regularCount}</span></div>
          <div class="pf-row"><strong>Open incidents</strong><span>${openIncidents}</span></div>
          <div class="pf-row"><strong>Next shift</strong><span>${nextShift ? escapeHtml(displayDateTime(nextShift.starts_at)) : "None scheduled"}</span></div>
          <div class="pf-row"><strong>Care plan review</strong><span>${escapeHtml(displayDate(participant.care_plan_review_date))}</span></div>
          <div class="pf-row"><strong>Emergency contact</strong><span>${escapeHtml(participant.emergency_contact || "Not recorded")}</span></div>
        </article>
      </div>
    `;
  }

  function medications(file) {
    const items = file.medications.filter(item => item.active && !item.ceased_at);
    if (!items.length) return empty("No active medications are recorded for this participant.");

    return `
      <div class="pf-actionbar">
        <p>Medication profiles are shown here for quick reference. Use Medication & MAR to administer and sign.</p>
        <button type="button" class="secondary" data-pf-open="medications">Open MAR</button>
      </div>
      <div class="pf-medications">
        ${items.map(item => `
          <article class="pf-medication">
            <div class="panel-head">
              <div><h3>${escapeHtml(item.medication_name)}</h3><p>${escapeHtml(item.dose)} · ${escapeHtml(item.route)}${item.administration_time ? ` · ${escapeHtml(String(item.administration_time).slice(0, 5))}` : ""}</p></div>
              ${badge(item.medication_type || "Regular", String(item.medication_type).toLowerCase() === "prn" ? "amber" : "good")}
            </div>
            ${item.prn_indication ? `<p><strong>PRN indication:</strong> ${escapeHtml(item.prn_indication)}</p>` : ""}
            ${item.max_prn_dose ? `<p><strong>Maximum/limits:</strong> ${escapeHtml(item.max_prn_dose)}</p>` : ""}
            ${item.instructions ? `<p><strong>Instructions:</strong> ${escapeHtml(item.instructions)}</p>` : ""}
          </article>
        `).join("")}
      </div>
    `;
  }

  function carePlan(file) {
    const participant = file.participant;
    return `
      <div class="pf-actionbar">
        <div><strong>Care plan version ${Number(participant.care_plan_version || 1)}</strong><p>Effective ${escapeHtml(displayDate(participant.care_plan_effective_from))} · Review ${escapeHtml(displayDate(participant.care_plan_review_date))}</p></div>
        ${participant.care_plan_approved_at ? badge(`Approved ${displayDate(participant.care_plan_approved_at)}`, "good") : badge("Approval pending", "amber")}
      </div>
      <div class="pf-grid">
        ${field("Communication needs", participant.communication_needs)}
        ${field("Diagnoses", participant.diagnoses)}
        ${field("Allergies", participant.allergies)}
        ${field("Goals", participant.goals)}
        ${field("Preferences", participant.preferences)}
        ${field("Risks and safeguards", participant.risks_and_safeguards)}
      </div>
    `;
  }

  function health(file) {
    const participant = file.participant;
    return `<div class="pf-grid">
      ${field("Full legal name", participant.full_name)}
      ${field("Preferred name", participant.preferred_name)}
      ${field("Date of birth", participant.date_of_birth ? displayDate(participant.date_of_birth) : "")}
      ${field("NDIS number", participant.ndis_number)}
      ${field("Address", participant.address)}
      ${field("Phone", participant.phone)}
      ${field("Emergency contact", participant.emergency_contact)}
      ${field("Guardian or nominee", participant.guardian_nominee)}
      ${field("GP", participant.gp)}
      ${field("Pharmacy", participant.pharmacy)}
    </div>`;
  }

  function history(file) {
    const notes = file.notes.map(item => `<article class="pf-history"><h3>${escapeHtml(item.category || "Progress note")}</h3><p class="record-meta">${escapeHtml(displayDateTime(item.recorded_at))}</p><p>${escapeHtml(item.content)}</p></article>`).join("");
    const timelineItems = file.timeline.map(item => `<article class="pf-history"><h3>${escapeHtml(item.title || item.event_type)}</h3><p class="record-meta">${escapeHtml(displayDateTime(item.occurred_at))} · ${escapeHtml(item.event_type || "Event")}</p><p>${escapeHtml(item.description)}</p>${item.action_taken ? `<p><strong>Action:</strong> ${escapeHtml(item.action_taken)}</p>` : ""}${item.follow_up ? `<p><strong>Follow-up:</strong> ${escapeHtml(item.follow_up)}</p>` : ""}</article>`).join("");
    return `
      <div class="pf-actionbar"><p>Recent records are grouped here for quick review.</p><div class="actions"><button type="button" class="secondary" data-pf-open="notes">Open progress notes</button><button type="button" class="secondary" data-pf-open="timeline">Open timeline</button></div></div>
      <div class="pf-grid pf-two"><section><h3>Recent progress notes</h3>${notes || empty("No progress notes recorded.")}</section><section><h3>Timeline</h3>${timelineItems || empty("No timeline events recorded.")}</section></div>
    `;
  }

  function documents(file) {
    if (!file.documents.length) return empty("No participant documents are currently listed in the compliance register.");
    return `<div class="pf-documents">${file.documents.map(item => `<article><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.category || "Document")} · Version ${Number(item.version || 1)}${item.review_date ? ` · Review ${escapeHtml(displayDate(item.review_date))}` : ""}</p></div>${badge("Recorded", "good")}</article>`).join("")}</div>`;
  }

  function tabContent(file) {
    if (activeTab === "medications") return medications(file);
    if (activeTab === "care-plan") return carePlan(file);
    if (activeTab === "health") return health(file);
    if (activeTab === "history") return history(file);
    if (activeTab === "documents") return documents(file);
    return overview(file);
  }

  function renderCurrentFile() {
    const content = $("#participant-file-content");
    if (!content || !currentFile) return;
    const tabs = [
      ["overview", "At a glance"],
      ["medications", "Medications"],
      ["care-plan", "Care plan"],
      ["health", "Health & contacts"],
      ["history", "Notes & timeline"],
      ["documents", "Documents"]
    ];
    content.innerHTML = hero(currentFile) + `
      <nav class="pf-tabs">${tabs.map(([id, label]) => `<button type="button" data-pf-tab="${id}" class="${activeTab === id ? "active" : ""}">${label}</button>`).join("")}</nav>
      <div class="pf-content">${tabContent(currentFile)}</div>
    `;
  }

  async function chooseParticipant(participantId) {
    const content = $("#participant-file-content");
    const participant = participants.find(item => item.id === participantId);
    if (!content || !participant) return;
    activeParticipantId = participantId;
    content.innerHTML = empty("Loading participant file…");
    try {
      currentFile = await loadFile(participant);
      renderCurrentFile();
    } catch (error) {
      content.innerHTML = empty(error?.message || "Florence could not load this participant file.");
    }
  }

  async function mount() {
    if (mounting) return;
    const appBridge = bridge();
    const view = $("#participants-view");
    if (!appBridge?.db || !appBridge?.profile || !view) return;
    mounting = true;

    try {
      let shell = $("#participant-file-panel");
      if (!shell) {
        shell = document.createElement("section");
        shell.id = "participant-file-panel";
        shell.className = "pf-shell";
        shell.innerHTML = `
          <div class="pf-toolbar">
            <div><p class="eyebrow">Participant overview</p><h2>Participant file</h2><p>Medication, care information and recent records together in one place.</p></div>
            <label>Choose participant<select id="participant-file-select"><option value="">Loading participants…</option></select></label>
          </div>
          <div id="participant-file-content">${empty("Choose a participant to open their file.")}</div>
        `;
        const heading = view.querySelector(".page-head");
        if (heading) heading.insertAdjacentElement("afterend", shell);
        else view.prepend(shell);
      }

      const { data, error } = await appBridge.db.from("participants").select("*").order("full_name");
      if (error) throw error;
      participants = data || [];
      const select = $("#participant-file-select");
      if (!select) return;
      select.innerHTML = participants.length
        ? participants.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.preferred_name || item.full_name)}</option>`).join("")
        : '<option value="">No participants available</option>';
      select.onchange = () => {
        activeTab = "overview";
        void chooseParticipant(select.value);
      };

      if (participants.length) {
        if (!activeParticipantId || !participants.some(item => item.id === activeParticipantId)) activeParticipantId = participants[0].id;
        select.value = activeParticipantId;
        await chooseParticipant(activeParticipantId);
      }
    } catch (error) {
      const content = $("#participant-file-content");
      if (content) content.innerHTML = empty(error?.message || "Florence could not load participant files.");
    } finally {
      mounting = false;
    }
  }

  document.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target : null;
    const tab = target?.closest("[data-pf-tab]");
    if (tab) {
      activeTab = tab.dataset.pfTab;
      renderCurrentFile();
      return;
    }
    const destination = target?.closest("[data-pf-open]");
    if (destination) {
      openView(destination.dataset.pfOpen);
      return;
    }
    if (target?.closest('[data-view="participants"]')) setTimeout(() => void mount(), 80);
  });

  const style = document.createElement("style");
  style.textContent = `
    .pf-shell{margin:0 0 24px}.pf-toolbar{display:flex;justify-content:space-between;align-items:end;gap:16px;padding:20px;border:1px solid rgba(95,143,114,.25);border-radius:24px;background:linear-gradient(135deg,#f6fbf7,#edf6ef);margin-bottom:18px}.pf-toolbar h2,.pf-toolbar p{margin-bottom:4px}.pf-toolbar label{min-width:220px}.pf-toolbar select{width:100%}.pf-hero{display:flex;justify-content:space-between;gap:16px;align-items:center;padding:20px;border-radius:22px;background:#315d46;color:#fff}.pf-hero .eyebrow,.pf-hero p{color:rgba(255,255,255,.82)}.pf-hero h2{color:#fff;margin:2px 0}.pf-badges{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.pf-warning{margin:12px 0;padding:14px 16px;border-radius:16px;background:#fff1df;border-left:5px solid #c78a37}.pf-tabs{display:flex;gap:8px;overflow-x:auto;padding:14px 0}.pf-tabs button{white-space:nowrap;border:1px solid rgba(95,143,114,.25);background:#fff;color:#315d46;border-radius:999px;padding:10px 14px;font-weight:700}.pf-tabs button.active{background:#5f8f72;color:#fff}.pf-content{padding-bottom:12px}.pf-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px}.pf-stats article{padding:16px;border-radius:18px;background:#f4f8f5;border:1px solid rgba(95,143,114,.18)}.pf-stats strong{display:block;font-size:1.55rem;color:#315d46}.pf-stats span{font-size:.9rem;color:#65736b}.pf-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px}.pf-two{grid-template-columns:repeat(2,minmax(0,1fr))}.pf-field,.pf-medication,.pf-history{padding:15px;border-radius:17px;background:#f8fbf8;border:1px solid rgba(95,143,114,.2)}.pf-field h4,.pf-field p{margin:0}.pf-field h4{color:#315d46;margin-bottom:7px}.pf-row{display:flex;justify-content:space-between;gap:14px;padding:12px 0;border-bottom:1px solid rgba(95,143,114,.17)}.pf-row span{text-align:right}.pf-actionbar{display:flex;justify-content:space-between;gap:14px;align-items:center;padding:14px 16px;border-radius:17px;background:#eef6f0;margin-bottom:14px}.pf-actionbar p{margin:0}.pf-medications{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}.pf-medication h3{margin:0}.pf-documents{display:grid;gap:10px}.pf-documents article{display:flex;justify-content:space-between;gap:12px;padding:15px;border-radius:16px;background:#f8fbf8;border:1px solid rgba(95,143,114,.2)}.pf-documents p{margin:4px 0 0}@media(max-width:720px){.pf-toolbar,.pf-hero,.pf-actionbar{align-items:stretch;flex-direction:column}.pf-toolbar label{min-width:0}.pf-two,.pf-stats{grid-template-columns:1fr}.pf-badges{justify-content:flex-start}}
  `;
  document.head.appendChild(style);

  function startPolling() {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (bridge()?.db && bridge()?.profile && $("#participants-view")) {
        clearInterval(timer);
        void mount();
      } else if (attempts >= 240) {
        clearInterval(timer);
      }
    }, 250);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startPolling, { once: true });
  else startPolling();
  window.addEventListener("florence:ready", () => void mount());
  window.addEventListener("pageshow", () => void mount());
})();