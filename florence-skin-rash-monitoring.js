(() => {
  "use strict";

  const SUPABASE_URL = "https://pbbsaquwumxyrhqhnobv.supabase.co";
  const PUBLISHABLE_KEY = "sb_publishable_4D2Oc8FJjOXDXgGG7GbzfA_oYRpXSU5";
  const AUTH_STORAGE_KEY = "florence-auth-session";
  const PRIVATE_BUCKET = "florence-private";
  const DRAFT_KEY = "florence:skin-rash-draft:v1";
  const DRAFT_DB = "florence-skin-rash-drafts";
  const DRAFT_STORE = "progress-photos";
  const MAX_DRAFT_AGE = 2 * 60 * 60 * 1000;
  const MAX_PHOTOS = 5;
  const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
  const ACCEPTED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/heic", "image/heif", "image/webp"]);
  let cachedContext = null;
  let autoReopenAttempted = false;
  let previewUrls = [];

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
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

  async function api(path, { method = "GET", body, headers = {} } = {}) {
    const session = readSession();
    if (!session) throw new Error("Florence is still opening your secure account. Try again in a moment.");
    const response = await fetch(`${SUPABASE_URL}${path}`, {
      method,
      headers: {
        apikey: PUBLISHABLE_KEY,
        Authorization: `Bearer ${session.access_token}`,
        ...(body !== undefined && !(body instanceof Blob) ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : body instanceof Blob ? body : JSON.stringify(body),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(errorBody.message || errorBody.error_description || errorBody.error || "Florence could not complete that secure request.");
    }
    if (response.status === 204) return null;
    const contentType = response.headers.get("content-type") || "";
    return contentType.includes("application/json") ? response.json() : response.text();
  }

  async function loadContext(force = false) {
    if (cachedContext && !force && Date.now() - cachedContext.loadedAt < 60_000) return cachedContext;
    const session = readSession();
    if (!session) throw new Error("Sign in to Florence before opening skin monitoring.");
    const profileQuery = `/rest/v1/profiles?id=eq.${encodeURIComponent(session.user.id)}&select=id,organisation_id,full_name,role,active`;
    const [profileRows, participants, workers] = await Promise.all([
      api(profileQuery),
      api("/rest/v1/participants?select=id,full_name,preferred_name,status&status=eq.Active&order=full_name.asc"),
      api("/rest/v1/profiles?select=id,full_name&active=eq.true&order=full_name.asc"),
    ]);
    const profile = profileRows?.[0];
    if (!profile?.active || !["staff", "supervisor"].includes(profile.role)) {
      throw new Error("Skin monitoring is available to active Florence workers only.");
    }
    cachedContext = { profile, participants: participants || [], workers: workers || [], loadedAt: Date.now() };
    return cachedContext;
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
    if (!match) throw new Error("Enter a valid Brisbane observation date and time.");
    const [, year, month, day, hour, minute] = match;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour) - 10, Number(minute))).toISOString();
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat("en-AU", {
      timeZone: "Australia/Brisbane", dateStyle: "medium", timeStyle: "short",
    }).format(new Date(value));
  }

  function safeFilename(filename) {
    return String(filename || "progress-photo.jpg").replace(/[^a-zA-Z0-9._-]/g, "_");
  }

  function svgIcon() {
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/><path d="M8 12h8M12 8v8"/></svg>';
  }

  function installEntryButtons() {
    if (!readSession()) return;
    document.querySelectorAll(".quick-section").forEach((section) => {
      if (!/what do you need to record/i.test(section.querySelector("h2")?.textContent || "")) return;
      const grid = section.querySelector(".quick-grid");
      if (!grid || grid.querySelector("[data-florence-skin-monitoring]")) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tone-notes";
      button.dataset.florenceSkinMonitoring = "true";
      button.dataset.florenceTone = "notes";
      button.innerHTML = `<span>${svgIcon()}</span><span><strong>Skin/rash check</strong><small>Monitor skin and add progress photos</small></span><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>`;
      button.addEventListener("click", () => void openSkinModal());
      grid.appendChild(button);
    });

    document.querySelectorAll(".module-head").forEach((header) => {
      if (!/client timeline/i.test(header.querySelector("h1")?.textContent || "")) return;
      if (header.querySelector("[data-florence-skin-monitoring]")) return;
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.florenceSkinMonitoring = "true";
      button.innerHTML = `${svgIcon()} Skin/rash check`;
      button.addEventListener("click", () => void openSkinModal());
      header.appendChild(button);
    });
  }

  function checkboxGroup(name, options) {
    return `<div class="skin-checkbox-grid">${options.map((option) => `<label class="check-field"><input type="checkbox" name="${esc(name)}" value="${esc(option)}"><span>${esc(option)}</span></label>`).join("")}</div>`;
  }

  function optionList(options, selected = "") {
    return options.map((option) => `<option${option === selected ? " selected" : ""}>${esc(option)}</option>`).join("");
  }

  function reportForm(context) {
    const evelyn = context.participants.find((participant) => /evelyn/i.test(participant.full_name || participant.preferred_name || ""));
    const participantOptions = context.participants.map((participant) => `<option value="${esc(participant.id)}"${participant.id === evelyn?.id ? " selected" : ""}>${esc(participant.full_name)}</option>`).join("");
    return `<form id="skin-monitoring-form" class="record-form">
      <p class="skin-form-note"><strong>Skin monitoring record — not an incident report.</strong> Use this for routine checks and rash progress. Complete an Incident Report only if a separate incident, injury, emergency or suspected abuse or neglect occurs.</p>
      <label>Participant<select name="participant_id" required>${participantOptions}</select></label>
      <div class="field-pair">
        <label>Date and time observed<input name="observed_at" type="datetime-local" value="${brisbaneLocalValue()}" required></label>
        <label>Type of check<select name="observation_type" required>${optionList(["Rash present", "Follow-up check", "Routine skin check", "Resolved check"], "Rash present")}</select></label>
      </div>
      <fieldset><legend>Body area</legend>${checkboxGroup("body_areas", ["Under abdominal skin fold", "Groin — left", "Groin — right", "Under breast skin fold", "Armpit — left", "Armpit — right", "Inner thigh — left", "Inner thigh — right", "Buttocks", "Sacral / lower back area"])}<label>Other body area<input name="other_body_area" placeholder="Describe another area"></label></fieldset>
      <fieldset><legend>What the skin looked like</legend>${checkboxGroup("appearance", ["Red or inflamed", "Pink or discoloured", "Moist", "Dry or flaky", "Broken or open skin", "Spots, blisters or pustules", "Weeping or discharge", "Odour", "Swollen", "Warm or hot to touch"])}<label>Other appearance<input name="other_appearance" placeholder="Describe any other observation"></label></fieldset>
      <div class="field-pair">
        <label>Progress/status<select name="rash_status" required>${optionList(["Recurring", "First observation", "Improving", "Unchanged", "Worsening", "Resolved"], "Recurring")}</select></label>
        <label>Overall severity<select name="severity" required>${optionList(["Mild", "Moderate", "Severe"], "Mild")}</select></label>
      </div>
      <div class="field-pair">
        <label>Itch score (0–10)<input name="itch_score" type="number" inputmode="numeric" min="0" max="10" value="0" required></label>
        <label>Pain/discomfort score (0–10)<input name="pain_score" type="number" inputmode="numeric" min="0" max="10" value="0" required></label>
      </div>
      <fieldset><legend>Shower and skin care</legend>
        <label>Shower or wash support<select name="shower_support" required>${optionList(["Completed as part of regular routine", "Offered and declined", "Not due at this check", "Not completed — reason recorded"], "Completed as part of regular routine")}</select></label>
        <label>Shower/wash notes<textarea name="shower_notes" placeholder="Record assistance, refusal or why care was not completed"></textarea></label>
        <div class="skin-checkbox-grid"><label class="check-field"><input type="checkbox" name="area_cleansed" value="true"><span>Affected area gently cleansed</span></label><label class="check-field"><input type="checkbox" name="area_dried" value="true"><span>Affected area dried thoroughly</span></label></div>
        <label>Prompt/support not to scratch<select name="scratching_prompt" required>${optionList(["Not scratching — prompt not required", "Prompted and responded", "Prompted — continued scratching", "Participant declined prompt"], "Not scratching — prompt not required")}</select></label>
      </fieldset>
      <fieldset><legend>Treatment or product used</legend>
        <label class="check-field"><input type="checkbox" name="treatment_applied" value="true"><span>Authorised treatment/product was applied</span></label>
        <label>Exact product/cream used<input name="treatment_name" placeholder="For example: OTC antifungal cream or Combine — copy the packet name"></label>
        <p class="skin-field-help">This report records what was actually used. Follow the product label and Evelyn’s current participant instructions or health-professional advice.</p>
        <label>Evelyn’s response or comments<textarea name="participant_response" placeholder="Use the participant’s own words where possible"></textarea></label>
      </fieldset>
      <fieldset><legend>Review and escalation</legend>
        <div class="skin-checkbox-grid skin-red-flags">${checkboxGroup("red_flags", ["Rapidly spreading", "Fever or generally unwell", "Open, broken or bleeding skin", "Weeping, discharge or strong odour", "Hot, swollen or increasing pain"])}</div>
        <label>Who was contacted<select name="clinician_contact" required>${optionList(["Not required", "Pharmacist", "GP", "Nurse", "Other health professional", "Supervisor only"], "Not required")}</select></label>
        <label>Advice received<textarea name="clinical_advice" placeholder="Record who gave the advice, what they advised and when"></textarea></label>
        <label>Action/follow-up required<textarea name="follow_up_required" placeholder="Record monitoring, review or escalation actions and who is responsible"></textarea></label>
        <label>Review due<input name="review_due" type="date"></label>
      </fieldset>
      <fieldset><legend>Progress photos</legend>
        <p class="skin-photo-privacy">Only photograph the affected skin needed for monitoring. Avoid the face, genitals and other identifying features where possible. Record Evelyn’s consent for each set of photos.</p>
        <label class="skin-photo-upload">Attach up to five photos<input name="photos" type="file" accept="image/jpeg,image/png,image/heic,image/heif,image/webp" capture="environment" multiple></label>
        <div id="skin-photo-preview" class="skin-photo-preview" aria-live="polite"></div>
        <label class="check-field"><input type="checkbox" name="photo_consent" value="true"><span>The participant consented to the attached progress photos</span></label>
      </fieldset>
      <label class="check-field skin-declaration"><input type="checkbox" name="declaration" value="true" required><span>I declare that this is a true and factual skin monitoring record.</span></label>
      <label>Your personal six-digit signing PIN<input name="pin" type="password" inputmode="numeric" autocomplete="off" maxlength="6" pattern="[0-9]{6}" required></label>
      <p id="skin-form-status" class="form-error hidden" role="alert"></p>
      <div class="modal-actions"><button type="button" data-skin-close>Close</button><button class="primary" type="submit">Sign and save report</button></div>
    </form>`;
  }

  function openDraftDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DRAFT_DB, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(DRAFT_STORE)) request.result.createObjectStore(DRAFT_STORE, { keyPath: "key" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function draftStore(mode, operation) {
    const database = await openDraftDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(DRAFT_STORE, mode);
      const request = operation(transaction.objectStore(DRAFT_STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => database.close();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  function loadDraft() {
    try {
      const draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null");
      if (!draft || Date.now() - draft.savedAt > MAX_DRAFT_AGE) {
        sessionStorage.removeItem(DRAFT_KEY);
        return null;
      }
      return draft;
    } catch {
      return null;
    }
  }

  function saveDraft(form) {
    const fields = {};
    for (const element of form.elements) {
      if (!element.name || ["pin", "declaration", "photos"].includes(element.name)) continue;
      if (element.type === "checkbox") {
        if (element.name === "body_areas" || element.name === "appearance" || element.name === "red_flags") continue;
        fields[element.name] = element.checked;
      } else fields[element.name] = element.value;
    }
    for (const name of ["body_areas", "appearance", "red_flags"]) fields[name] = new FormData(form).getAll(name);
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ fields, savedAt: Date.now() }));
  }

  async function saveDraftPhotos(fileList) {
    const files = Array.from(fileList || []).map((file) => ({ name: file.name, type: file.type, lastModified: file.lastModified, blob: file }));
    if (!files.length) return draftStore("readwrite", (store) => store.delete("current"));
    return draftStore("readwrite", (store) => store.put({ key: "current", files, expiresAt: Date.now() + MAX_DRAFT_AGE }));
  }

  async function loadDraftPhotos() {
    try {
      const record = await draftStore("readonly", (store) => store.get("current"));
      if (!record || record.expiresAt < Date.now()) return [];
      return record.files || [];
    } catch {
      return [];
    }
  }

  async function clearDraft() {
    sessionStorage.removeItem(DRAFT_KEY);
    try { await draftStore("readwrite", (store) => store.delete("current")); } catch { /* best effort */ }
  }

  async function restoreDraft(form) {
    const draft = loadDraft();
    if (draft?.fields) {
      for (const [name, value] of Object.entries(draft.fields)) {
        if (Array.isArray(value)) {
          form.querySelectorAll(`[name="${CSS.escape(name)}"]`).forEach((input) => { input.checked = value.includes(input.value); });
        } else {
          const input = form.elements.namedItem(name);
          if (!input || ["pin", "declaration"].includes(name)) continue;
          if (input.type === "checkbox") input.checked = Boolean(value);
          else input.value = value ?? "";
        }
      }
    }
    const stored = await loadDraftPhotos();
    const input = form.elements.namedItem("photos");
    if (stored.length && input instanceof HTMLInputElement && typeof DataTransfer !== "undefined") {
      const transfer = new DataTransfer();
      stored.forEach((saved) => transfer.items.add(new File([saved.blob], saved.name, { type: saved.type, lastModified: saved.lastModified })));
      input.files = transfer.files;
      renderPhotoPreview(input.files);
    }
  }

  function renderPhotoPreview(fileList) {
    previewUrls.forEach((url) => URL.revokeObjectURL(url));
    previewUrls = [];
    const host = document.querySelector("#skin-photo-preview");
    if (!host) return;
    const files = Array.from(fileList || []);
    if (!files.length) { host.textContent = "No progress photos attached."; return; }
    host.innerHTML = files.map((file) => {
      const url = URL.createObjectURL(file); previewUrls.push(url);
      return `<figure><img src="${esc(url)}" alt="Selected skin progress photo"><figcaption>${esc(file.name)}</figcaption></figure>`;
    }).join("");
  }

  async function uploadPhoto(file, context, participantId) {
    const path = `${context.profile.organisation_id}/skin-rash-photos/${participantId}/${context.profile.id}/${crypto.randomUUID()}-${safeFilename(file.name)}`;
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    await api(`/storage/v1/object/${PRIVATE_BUCKET}/${encodedPath}`, {
      method: "POST", body: file, headers: { "Content-Type": file.type, "x-upsert": "false" },
    });
    return path;
  }

  async function removeUploadedPhotos(paths) {
    if (!paths.length) return;
    try { await api(`/storage/v1/object/${PRIVATE_BUCKET}`, { method: "DELETE", body: { prefixes: paths } }); } catch { /* unattached files expire from the temporary failure path */ }
  }

  async function saveReport(form, context) {
    const formData = new FormData(form);
    const value = (name) => String(formData.get(name) || "").trim();
    const photos = formData.getAll("photos").filter((file) => file instanceof File && file.size > 0);
    if (photos.length > MAX_PHOTOS) throw new Error("Attach no more than five progress photos.");
    for (const photo of photos) {
      if ((!ACCEPTED_PHOTO_TYPES.has(photo.type) && !/\.(?:jpe?g|png|heic|heif|webp)$/i.test(photo.name)) || !photo.type.startsWith("image/")) throw new Error("Progress photos must be JPEG, PNG, HEIC, HEIF or WebP images.");
      if (photo.size > MAX_PHOTO_BYTES) throw new Error("Each progress photo must be smaller than 8 MB.");
    }
    const bodyAreas = formData.getAll("body_areas").map(String);
    const appearance = formData.getAll("appearance").map(String);
    const redFlags = formData.getAll("red_flags").map(String);
    if (!bodyAreas.length && !value("other_body_area")) throw new Error("Select or describe at least one body area.");
    if (!appearance.length && !value("other_appearance")) throw new Error("Record what the skin looked like.");
    if (value("shower_support") === "Not completed — reason recorded" && !value("shower_notes")) throw new Error("Record why the shower or wash was not completed.");
    if (formData.get("treatment_applied") === "true" && !value("treatment_name")) throw new Error("Record the exact product or cream used.");
    if (redFlags.length && !value("follow_up_required")) throw new Error("Record the action and follow-up for the signs needing review.");
    if (photos.length && formData.get("photo_consent") !== "true") throw new Error("Record Evelyn’s consent before attaching progress photos.");
    if (!/^\d{6}$/.test(value("pin"))) throw new Error("Enter your personal six-digit signing PIN.");
    if (formData.get("declaration") !== "true") throw new Error("Confirm that this skin monitoring report is true and correct.");

    const participantId = value("participant_id");
    const paths = [];
    try {
      for (const photo of photos) paths.push(await uploadPhoto(photo, context, participantId));
      const payload = {
        p_participant_id: participantId,
        p_observed_at: brisbaneLocalToIso(value("observed_at")),
        p_observation_type: value("observation_type"),
        p_body_areas: bodyAreas,
        p_other_body_area: value("other_body_area") || null,
        p_appearance: appearance,
        p_other_appearance: value("other_appearance") || null,
        p_rash_status: value("rash_status"),
        p_severity: value("severity"),
        p_itch_score: Number(value("itch_score")),
        p_pain_score: Number(value("pain_score")),
        p_shower_support: value("shower_support"),
        p_shower_notes: value("shower_notes") || null,
        p_area_cleansed: formData.get("area_cleansed") === "true",
        p_area_dried: formData.get("area_dried") === "true",
        p_scratching_prompt: value("scratching_prompt"),
        p_treatment_applied: formData.get("treatment_applied") === "true",
        p_treatment_name: value("treatment_name") || null,
        p_participant_response: value("participant_response") || null,
        p_clinician_contact: value("clinician_contact"),
        p_clinical_advice: value("clinical_advice") || null,
        p_red_flags: redFlags,
        p_follow_up_required: value("follow_up_required") || null,
        p_review_due: value("review_due") || null,
        p_photo_consent: formData.get("photo_consent") === "true",
        p_photo_paths: paths,
        p_pin: value("pin"),
        p_declaration_confirmed: true,
      };
      await api("/rest/v1/rpc/record_skin_observation", { method: "POST", body: payload, headers: { Prefer: "return=representation" } });
    } catch (error) {
      await removeUploadedPhotos(paths);
      throw error;
    }
  }

  function reportCard(report, context) {
    const participant = context.participants.find((item) => item.id === report.participant_id)?.full_name || "Participant";
    const worker = context.workers.find((item) => item.id === report.reported_by)?.full_name || "Florence worker";
    const areas = [...(report.body_areas || []), report.other_body_area].filter(Boolean).join(", ");
    const appearances = [...(report.appearance || []), report.other_appearance].filter(Boolean).join(", ");
    const care = [report.shower_support, report.area_cleansed && "Area cleansed", report.area_dried && "Area dried", report.treatment_applied && `Product: ${report.treatment_name}`, report.scratching_prompt].filter(Boolean).join(" · ");
    const photos = report.photo_paths?.length || 0;
    return `<article class="skin-history-card">
      <div class="skin-history-head"><div><strong>${esc(participant)}</strong><small>${esc(formatDate(report.observed_at))} · ${esc(worker)}</small></div><span class="status ${report.severity === "Severe" ? "due" : "good"}">${esc(report.rash_status)} · ${esc(report.severity)}</span></div>
      <p><strong>Area:</strong> ${esc(areas)}</p><p><strong>Appearance:</strong> ${esc(appearances)}</p>
      <p><strong>Itch:</strong> ${esc(report.itch_score)}/10 · <strong>Pain/discomfort:</strong> ${esc(report.pain_score)}/10</p>
      <p><strong>Care recorded:</strong> ${esc(care)}</p>
      ${report.participant_response ? `<p><strong>Participant response:</strong> ${esc(report.participant_response)}</p>` : ""}
      ${report.clinical_advice ? `<p><strong>Advice:</strong> ${esc(report.clinical_advice)}</p>` : ""}
      ${report.follow_up_required ? `<p><strong>Follow-up:</strong> ${esc(report.follow_up_required)}</p>` : ""}
      <div class="skin-history-meta"><span>Signed & PIN verified</span>${report.review_due ? `<span>Review due ${esc(new Intl.DateTimeFormat("en-AU", { dateStyle: "medium" }).format(new Date(`${report.review_due}T00:00:00+10:00`)))}</span>` : ""}</div>
      ${photos ? `<button type="button" class="skin-photo-button" data-skin-photo-report="${esc(report.id)}">View ${photos} progress photo${photos === 1 ? "" : "s"} securely</button>` : ""}
      <div class="skin-secure-gallery" data-skin-gallery="${esc(report.id)}"></div>
    </article>`;
  }

  async function renderHistory(host, context) {
    host.innerHTML = '<p class="skin-loading">Loading signed skin monitoring history…</p>';
    try {
      const reports = await api("/rest/v1/skin_observation_reports?select=*&order=observed_at.desc&limit=50");
      await api("/rest/v1/rpc/record_access_event", { method: "POST", body: { p_action: "VIEW", p_table_name: "skin_observation_reports", p_record_id: null, p_metadata: { view: "skin_monitoring_history" } } }).catch(() => null);
      host.innerHTML = reports?.length ? reports.map((report) => reportCard(report, context)).join("") : '<div class="empty-state"><strong>No skin monitoring reports yet</strong><p>New signed reports will appear here in date order.</p></div>';
      host.querySelectorAll("[data-skin-photo-report]").forEach((button) => button.addEventListener("click", () => void showSecurePhotos(button, reports.find((report) => report.id === button.dataset.skinPhotoReport))));
    } catch (error) {
      host.innerHTML = `<p class="form-error" role="alert">${esc(error.message)}</p>`;
    }
  }

  async function showSecurePhotos(button, report) {
    const gallery = document.querySelector(`[data-skin-gallery="${CSS.escape(report?.id || "")}"]`);
    if (!gallery || !report?.photo_paths?.length) return;
    button.disabled = true;
    button.textContent = "Opening securely…";
    try {
      const urls = [];
      for (const path of report.photo_paths) {
        const encodedPath = path.split("/").map(encodeURIComponent).join("/");
        const result = await api(`/storage/v1/object/sign/${PRIVATE_BUCKET}/${encodedPath}`, { method: "POST", body: { expiresIn: 60 } });
        const signedPath = result.signedURL || result.signedUrl;
        urls.push(signedPath.startsWith("http") ? signedPath : `${SUPABASE_URL}/storage/v1${signedPath}`);
      }
      gallery.innerHTML = urls.map((url, index) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer"><img src="${esc(url)}" alt="Private skin progress photo ${index + 1}"></a>`).join("");
      await api("/rest/v1/rpc/record_access_event", { method: "POST", body: { p_action: "DOWNLOAD", p_table_name: "skin_observation_reports", p_record_id: report.id, p_metadata: { photo_count: report.photo_paths.length } } }).catch(() => null);
      button.textContent = "Photos available for 60 seconds";
    } catch (error) {
      button.disabled = false;
      button.textContent = error.message || "Photos could not be opened";
    }
  }

  function closeSkinModal() {
    previewUrls.forEach((url) => URL.revokeObjectURL(url));
    previewUrls = [];
    document.querySelector("#florence-skin-modal")?.remove();
  }

  async function openSkinModal() {
    if (document.querySelector("#florence-skin-modal")) return;
    autoReopenAttempted = true;
    try {
      const context = await loadContext();
      if (!context.participants.length) throw new Error("No assigned active participant is available for a skin monitoring report.");
      const layer = document.createElement("div");
      layer.id = "florence-skin-modal";
      layer.className = "modal-layer";
      layer.setAttribute("role", "dialog");
      layer.setAttribute("aria-modal", "true");
      layer.innerHTML = `<button class="modal-scrim" data-skin-close aria-label="Close skin monitoring"></button><section class="modal record-modal skin-monitoring-modal"><button class="modal-close" type="button" data-skin-close aria-label="Close">×</button><span class="modal-icon">${svgIcon()}</span><p class="eyebrow">FLORENCE SECURE HEALTH RECORD</p><h2>Skin & rash monitoring</h2><div class="skin-modal-tabs"><button type="button" class="active" data-skin-tab="report">New report</button><button type="button" data-skin-tab="history">History & photos</button></div><div data-skin-panel="report">${reportForm(context)}</div><div data-skin-panel="history" class="hidden"><div id="skin-history-list"></div><div class="modal-actions"><button type="button" data-skin-close>Close</button></div></div></section>`;
      document.body.appendChild(layer);
      layer.querySelectorAll("[data-skin-close]").forEach((button) => button.addEventListener("click", closeSkinModal));
      layer.querySelectorAll("[data-skin-tab]").forEach((button) => button.addEventListener("click", () => {
        layer.querySelectorAll("[data-skin-tab]").forEach((item) => item.classList.toggle("active", item === button));
        layer.querySelectorAll("[data-skin-panel]").forEach((panel) => panel.classList.toggle("hidden", panel.dataset.skinPanel !== button.dataset.skinTab));
        if (button.dataset.skinTab === "history") void renderHistory(layer.querySelector("#skin-history-list"), context);
      }));
      const form = layer.querySelector("#skin-monitoring-form");
      await restoreDraft(form);
      renderPhotoPreview(form.elements.namedItem("photos").files);
      form.addEventListener("input", () => saveDraft(form), true);
      form.addEventListener("change", (event) => {
        saveDraft(form);
        if (event.target.matches("input[name='photos']")) {
          const files = event.target.files;
          renderPhotoPreview(files);
          void saveDraftPhotos(files);
        }
      }, true);
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const status = form.querySelector("#skin-form-status");
        const submit = form.querySelector("button[type='submit']");
        status.textContent = ""; status.classList.add("hidden"); submit.disabled = true; submit.textContent = "Saving photos and report…";
        try {
          await saveReport(form, context);
          await clearDraft();
          form.reset();
          cachedContext = null;
          layer.querySelector("[data-skin-tab='history']").click();
          const success = document.createElement("p"); success.className = "skin-success"; success.textContent = "Skin monitoring report signed and saved. The health timeline has also been updated.";
          layer.querySelector("[data-skin-panel='history']").prepend(success);
        } catch (error) {
          status.textContent = error.message || "Florence could not save the skin monitoring report.";
          status.classList.remove("hidden");
          status.scrollIntoView({ behavior: "smooth", block: "center" });
        } finally {
          submit.disabled = false; submit.textContent = "Sign and save report";
        }
      });
    } catch (error) {
      const message = document.createElement("div");
      message.className = "skin-floating-error";
      message.textContent = error.message || "Florence could not open skin monitoring.";
      document.body.appendChild(message);
      setTimeout(() => message.remove(), 4000);
    }
  }

  const observer = new MutationObserver(() => {
    installEntryButtons();
    if (!autoReopenAttempted && loadDraft() && document.querySelector("[data-florence-skin-monitoring]")) {
      autoReopenAttempted = true;
      setTimeout(() => void openSkinModal(), 500);
    }
  });

  function start() {
    observer.observe(document.body, { childList: true, subtree: true });
    installEntryButtons();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
