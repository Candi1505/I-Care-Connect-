(() => {
  "use strict";

  const SUPABASE_URL = "https://pbbsaquwumxyrhqhnobv.supabase.co";
  const PUBLISHABLE_KEY = "sb_publishable_4D2Oc8FJjOXDXgGG7GbzfA_oYRpXSU5";
  const AUTH_STORAGE_KEY = "florence-auth-session";
  let readiness = null;
  let loadPromise = null;
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
    if (!session) throw new Error("Sign in to Florence to view your required reading.");
    const response = await fetch(`${SUPABASE_URL}${path}`, {
      ...options,
      headers: { ...headers(session), ...(options.headers || {}) },
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.message || payload?.error || "Florence could not load the required documents.");
    }
    return payload;
  }

  async function currentProfile() {
    const session = readSession();
    if (!session) return null;
    const rows = await request(`/rest/v1/profiles?id=eq.${encodeURIComponent(session.user.id)}&select=id,role,active`);
    const profile = Array.isArray(rows) ? rows[0] : null;
    return profile?.active && ["staff", "supervisor"].includes(profile.role) ? profile : null;
  }

  async function loadReadiness(force = false) {
    if (loadPromise && !force) return loadPromise;
    loadPromise = (async () => {
      const profile = await currentProfile();
      if (!profile) {
        readiness = null;
        return null;
      }
      const rows = await request("/rest/v1/rpc/my_worker_document_readiness", {
        method: "POST",
        body: "{}",
      });
      readiness = Array.isArray(rows) ? rows : [];
      return readiness;
    })().finally(() => {
      loadPromise = null;
    });
    return loadPromise;
  }

  const pendingDocuments = () => (readiness || []).filter(document => !document.ready);
  const completedCount = () => (readiness || []).length - pendingDocuments().length;

  function closeModal() {
    document.querySelector("#worker-reading-modal")?.remove();
    document.body.classList.remove("worker-reading-modal-open");
  }

  function setModalStatus(message, error = false) {
    const element = document.querySelector("#worker-reading-modal [data-worker-reading-status]");
    if (!element) return;
    element.textContent = message;
    element.classList.toggle("error", error);
    element.classList.toggle("hidden", !message);
  }

  function documentRows() {
    if (!readiness?.length) {
      return '<p class="worker-reading-empty">There are no current worker documents assigned to your role.</p>';
    }
    let lastModule = "";
    return readiness.map(document => {
      const module = document.module || "Worker resources";
      const heading = module !== lastModule
        ? `<h3 class="worker-reading-group">${escapeHtml(module)}</h3>`
        : "";
      lastModule = module;
      const opened = Boolean(document.opened_at);
      const ready = Boolean(document.ready);
      const status = ready ? "Acknowledged" : opened ? "Opened — check when read" : "Open and read required";
      return `${heading}
        <article class="worker-reading-item ${ready ? "complete" : "pending"}" data-worker-document="${escapeHtml(document.document_id)}">
          <div class="worker-reading-copy">
            <strong>${escapeHtml(document.title)}</strong>
            <small>Current version ${Number(document.version) || 1}${document.review_date ? ` · Review ${escapeHtml(new Date(`${document.review_date}T00:00:00`).toLocaleDateString("en-AU"))}` : ""}</small>
            <span class="worker-reading-state">${escapeHtml(status)}</span>
          </div>
          <button type="button" class="secondary" data-open-worker-document="${escapeHtml(document.document_id)}">${opened ? "Open again" : "Open document"}</button>
          ${ready ? '<span class="worker-reading-done" aria-label="Completed">Completed</span>' : `
            <label class="worker-reading-check ${opened ? "" : "disabled"}">
              <input type="checkbox" name="worker_document" value="${escapeHtml(document.document_id)}" ${opened ? "" : "disabled"}>
              <span>I have read and understood this document</span>
            </label>`}
        </article>`;
    }).join("");
  }

  function renderModal() {
    closeModal();
    const total = readiness?.length || 0;
    const complete = completedCount();
    const pending = total - complete;
    const modal = document.createElement("div");
    modal.id = "worker-reading-modal";
    modal.className = "worker-reading-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "worker-reading-title");
    modal.innerHTML = `
      <div class="worker-reading-backdrop" data-close-worker-reading></div>
      <section class="worker-reading-card">
        <button type="button" class="worker-reading-close" data-close-worker-reading aria-label="Close">×</button>
        <header>
          <p class="eyebrow">REQUIRED BEFORE YOUR NEXT SHIFT</p>
          <h2 id="worker-reading-title">Worker policies and required reading</h2>
          <p>Open every current document, read it, then check it off. Florence records the exact version and your acknowledgement time.</p>
          <div class="worker-reading-progress" role="status">
            <strong>${complete} of ${total} complete</strong>
            <span>${pending ? `${pending} still required before clock-in` : "All current documents completed"}</span>
          </div>
        </header>
        <form id="worker-reading-form">
          <div class="worker-reading-list">${documentRows()}</div>
          ${pending ? `
            <footer class="worker-reading-sign">
              <p>Only tick documents after you have read the complete current version. You can sign several checked documents with your PIN at once.</p>
              <label>Your personal six-digit signing PIN
                <input name="pin" type="password" inputmode="numeric" autocomplete="off" pattern="[0-9]{6}" maxlength="6" required>
              </label>
              <p class="notice hidden" data-worker-reading-status role="status" aria-live="polite"></p>
              <div class="worker-reading-actions">
                <button type="button" class="secondary" data-close-worker-reading>Close</button>
                <button type="submit" class="primary" data-sign-worker-documents>Sign checked documents</button>
              </div>
            </footer>` : `
            <footer class="worker-reading-sign complete">
              <p><strong>You are up to date.</strong> Florence will ask again automatically when a new document or version is approved.</p>
              <button type="button" class="primary" data-close-worker-reading>Done</button>
            </footer>`}
        </form>
      </section>`;
    document.body.appendChild(modal);
    document.body.classList.add("worker-reading-modal-open");
    modal.querySelectorAll("[data-close-worker-reading]").forEach(button => button.addEventListener("click", closeModal));
    modal.querySelectorAll("[data-open-worker-document]").forEach(button => button.addEventListener("click", () => {
      void openDocument(button.dataset.openWorkerDocument, button);
    }));
    modal.querySelector("#worker-reading-form")?.addEventListener("submit", event => void acknowledgeChecked(event));
    requestAnimationFrame(() => modal.querySelector("[data-open-worker-document], [data-close-worker-reading]")?.focus());
  }

  async function signedDocumentUrl(record) {
    const encodedPath = String(record.storage_path || "").split("/").map(encodeURIComponent).join("/");
    const result = await request(`/storage/v1/object/sign/florence-private/${encodedPath}`, {
      method: "POST",
      body: JSON.stringify({ expiresIn: 300 }),
    });
    const signedPath = result?.signedURL || result?.signedUrl;
    if (!signedPath) throw new Error("Florence could not prepare the private document.");
    return new URL(signedPath, SUPABASE_URL).toString();
  }

  async function openDocument(documentId, button) {
    const record = readiness?.find(item => item.document_id === documentId);
    if (!record) return setModalStatus("The current document could not be found.", true);
    const viewer = window.open("about:blank", "_blank");
    button.disabled = true;
    button.textContent = "Opening…";
    setModalStatus("Recording access and opening the private current version.");
    try {
      await request("/rest/v1/rpc/record_worker_document_open", {
        method: "POST",
        body: JSON.stringify({ p_document_id: documentId }),
      });
      const url = await signedDocumentUrl(record);
      if (viewer) viewer.location.replace(url);
      else {
        const link = document.createElement("a");
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.click();
      }
      await loadReadiness(true);
      renderModal();
      setModalStatus("Document opened. Read the complete document, then return and check it off.");
      renderBanner();
    } catch (error) {
      viewer?.close();
      setModalStatus(error?.message || "Florence could not open this document.", true);
      button.disabled = false;
      button.textContent = record.opened_at ? "Open again" : "Open document";
    }
  }

  async function acknowledgeChecked(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const ids = [...form.querySelectorAll('input[name="worker_document"]:checked')].map(input => input.value);
    const pin = String(new FormData(form).get("pin") || "").replace(/\D/g, "");
    if (!ids.length) return setModalStatus("Check each opened document you have finished reading.", true);
    if (!/^\d{6}$/.test(pin)) return setModalStatus("Enter your complete six-digit signing PIN.", true);
    const button = form.querySelector("[data-sign-worker-documents]");
    button.disabled = true;
    button.textContent = "Signing securely…";
    setModalStatus("Saving your individual document acknowledgements.");
    try {
      const count = await request("/rest/v1/rpc/acknowledge_worker_documents", {
        method: "POST",
        body: JSON.stringify({
          p_document_ids: ids,
          p_pin: pin,
          p_declaration_confirmed: true,
        }),
      });
      await loadReadiness(true);
      renderModal();
      setModalStatus(`${Number(count) || ids.length} document acknowledgement${ids.length === 1 ? "" : "s"} saved.`);
      renderBanner();
    } catch (error) {
      setModalStatus(error?.message || "Florence could not save the acknowledgements.", true);
      button.disabled = false;
      button.textContent = "Sign checked documents";
    }
  }

  function renderBanner() {
    document.querySelector("#worker-reading-banner")?.remove();
    if (!readiness) return;
    const heading = document.querySelector(".module-head");
    if (!heading) return;
    const total = readiness.length;
    const pending = pendingDocuments().length;
    const banner = document.createElement("section");
    banner.id = "worker-reading-banner";
    banner.className = `panel worker-reading-banner ${pending ? "required" : "complete"}`;
    banner.innerHTML = `
      <div>
        <p class="eyebrow">WORKER DOCUMENT READINESS</p>
        <h2>${pending ? "Required reading before your next shift" : "Required reading is up to date"}</h2>
        <p>${pending ? `${pending} of ${total} current worker documents still need to be opened, read and checked off. Clock-in stays locked until all are complete.` : `All ${total} current worker documents are acknowledged. New approved versions will automatically become required.`}</p>
      </div>
      <button type="button" class="${pending ? "primary" : "secondary"}" data-open-worker-reading>${pending ? "Open required reading" : "View acknowledgements"}</button>`;
    heading.insertAdjacentElement("afterend", banner);
    banner.querySelector("[data-open-worker-reading]").addEventListener("click", renderModal);
  }

  function ensureBanner() {
    if (document.querySelector("#worker-reading-banner")) return;
    if (!document.querySelector(".module-head")) return;
    loadReadiness().then(renderBanner).catch(() => {});
  }

  function queueBanner() {
    if (observerQueued) return;
    observerQueued = true;
    requestAnimationFrame(() => {
      observerQueued = false;
      ensureBanner();
    });
  }

  document.addEventListener("click", event => {
    const button = event.target instanceof Element ? event.target.closest("button") : null;
    if (!button || !/^clock in$/i.test(button.textContent?.trim() || "")) return;
    if (pendingDocuments().length) {
      event.preventDefault();
      event.stopImmediatePropagation();
      renderModal();
    }
  }, true);

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", queueBanner, { once: true });
  else queueBanner();
  window.addEventListener("pageshow", () => {
    readiness = null;
    void loadReadiness(true).then(renderBanner).catch(() => {});
  });
  new MutationObserver(queueBanner).observe(document.documentElement, { childList: true, subtree: true });
})();
