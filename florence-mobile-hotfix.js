(() => {
  "use strict";

  const DRAFT_KEY = "florence:expenditure-draft:v1";
  const DB_NAME = "florence-temporary-drafts";
  const STORE_NAME = "receipt-files";
  const MAX_DRAFT_AGE = 2 * 60 * 60 * 1000;
  const NO_ROSTER_SHIFT_ID = "00000000-0000-0000-0000-000000000000";
  const expenditureTitles = new Map([
    ["Community support expenditure", "community"],
    ["SIL expenditure", "sil"],
  ]);
  let drawerScrollY = 0;
  let drawerWasOpen = false;
  let pendingSubmitKind = null;
  let restoringFiles = false;
  let reopenInProgress = false;

  function getExpenditureForm() {
    const form = document.querySelector("form.record-form input[name='receipts']")?.form;
    if (!form) return null;
    const title = form.closest(".record-modal")?.querySelector("h2")?.textContent?.trim();
    const kind = expenditureTitles.get(title);
    if (!kind) return null;
    configureCurrencyInputs(form);
    return { form, kind };
  }

  function configureCurrencyInputs(form) {
    const currencyFields = [
      ["amount", "0.01"],
      ["cash_balance_after", "0"],
    ];
    for (const [name, minimum] of currencyFields) {
      const input = form.elements.namedItem(name);
      if (!(input instanceof HTMLInputElement)) continue;
      input.step = "0.01";
      input.min = minimum;
      input.inputMode = "decimal";
    }
  }

  function configureDomesticChecklist() {
    const forms = document.querySelectorAll("form.record-form");
    for (const form of forms) {
      const title = form.closest(".record-modal")?.querySelector("h2")?.textContent?.trim();
      if (title !== "Domestic duties checklist") continue;
      const shiftSelect = form.elements.namedItem("shift_id");
      if (!(shiftSelect instanceof HTMLSelectElement)) continue;

      shiftSelect.required = false;
      const firstOption = shiftSelect.options[0];
      if (firstOption) {
        firstOption.value = NO_ROSTER_SHIFT_ID;
        firstOption.textContent = "No roster shift — supervisor record";
      }

      const label = shiftSelect.closest("label");
      if (label && !label.querySelector(".domestic-shift-help")) {
        const help = document.createElement("small");
        help.className = "domestic-shift-help";
        help.textContent = "Workers choose an accepted domestic shift. Supervisors can save a verified checklist when no roster shift exists.";
        shiftSelect.insertAdjacentElement("afterend", help);
      }
    }
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

  function saveDraft(form, kind) {
    const fields = {};
    for (const element of form.elements) {
      if (!element.name || ["pin", "declaration", "receipts"].includes(element.name)) continue;
      if (element.type === "checkbox" || element.type === "radio") {
        fields[element.name] = element.checked;
      } else {
        fields[element.name] = element.value;
      }
    }
    try {
      const hasReceipts = Boolean(form.querySelector("input[name='receipts']")?.files?.length);
      const previous = loadDraft();
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
        kind,
        fields,
        hasReceipts: hasReceipts || (previous?.kind === kind && previous.hasReceipts),
        savedAt: Date.now(),
      }));
    } catch {
      // Draft protection is best effort on browsers with storage disabled.
    }
  }

  function clearDraft(kind) {
    try {
      const draft = loadDraft();
      if (!kind || !draft || draft.kind === kind) sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      // Ignore storage restrictions.
    }
    if (kind) void deleteStoredFiles(kind);
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) return reject(new Error("IndexedDB unavailable"));
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME, { keyPath: "kind" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function withStore(mode, action) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      const request = action(store);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => db.close();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async function storeFiles(kind, fileList) {
    const files = Array.from(fileList || []).map((file) => ({
      name: file.name,
      type: file.type,
      lastModified: file.lastModified,
      blob: file,
    }));
    if (!files.length) return deleteStoredFiles(kind);
    await withStore("readwrite", (store) =>
      store.put({ kind, files, expiresAt: Date.now() + MAX_DRAFT_AGE }),
    );
  }

  async function getStoredFiles(kind) {
    try {
      const record = await withStore("readonly", (store) => store.get(kind));
      if (!record || record.expiresAt < Date.now()) {
        await deleteStoredFiles(kind);
        return [];
      }
      return record.files || [];
    } catch {
      return [];
    }
  }

  async function deleteStoredFiles(kind) {
    try {
      await withStore("readwrite", (store) => store.delete(kind));
    } catch {
      // Ignore browsers that block IndexedDB.
    }
  }

  function setReceiptStatus(form, message) {
    const upload = form.querySelector(".receipt-upload");
    if (!upload) return;
    let status = upload.parentElement?.querySelector(".receipt-draft-status");
    if (!status) {
      status = document.createElement("p");
      status.className = "receipt-draft-status";
      status.setAttribute("role", "status");
      upload.insertAdjacentElement("afterend", status);
    }
    status.textContent = message;
  }

  async function restoreFiles(form, kind) {
    const input = form.querySelector("input[name='receipts']");
    if (!input || input.files?.length || typeof DataTransfer === "undefined") return false;
    const stored = await getStoredFiles(kind);
    if (!stored.length) return false;
    try {
      const transfer = new DataTransfer();
      for (const saved of stored) {
        transfer.items.add(new File([saved.blob], saved.name, {
          type: saved.type,
          lastModified: saved.lastModified,
        }));
      }
      input.files = transfer.files;
      setReceiptStatus(form, `${transfer.files.length} receipt file${transfer.files.length === 1 ? "" : "s"} restored. Your form is ready to continue.`);
      return transfer.files.length > 0;
    } catch {
      setReceiptStatus(form, "Your form details were restored. Please reattach the receipt photo before saving.");
      return false;
    }
  }

  async function restoreDraft(form, kind) {
    const draft = loadDraft();
    if (draft?.kind === kind) {
      for (const [name, value] of Object.entries(draft.fields || {})) {
        const element = form.elements.namedItem(name);
        if (!element || ["pin", "declaration", "receipts"].includes(name)) continue;
        if (element.type === "checkbox" || element.type === "radio") element.checked = Boolean(value);
        else element.value = value;
      }
    }
    await restoreFiles(form, kind);
  }

  function reopenDraftIfNeeded() {
    const draft = loadDraft();
    if (!draft || getExpenditureForm() || reopenInProgress) return;
    const wanted = draft.kind === "community" ? ["community spending", "record community spending"] : ["sil spending", "record sil spending"];
    const buttons = Array.from(document.querySelectorAll("button"));
    const match = buttons.find((button) => {
      const text = button.textContent?.trim().toLowerCase() || "";
      return wanted.some((label) => text.includes(label));
    });
    if (match) {
      reopenInProgress = true;
      match.click();
      window.setTimeout(() => { reopenInProgress = false; }, 2000);
    }
  }

  function syncDrawerLock() {
    const open = Boolean(document.querySelector(".sidebar.open"));
    if (open === drawerWasOpen) return;
    drawerWasOpen = open;
    if (open) {
      drawerScrollY = window.scrollY;
      document.documentElement.classList.add("florence-drawer-open");
      document.body.classList.add("florence-drawer-open");
      document.body.style.top = `-${drawerScrollY}px`;
    } else {
      document.documentElement.classList.remove("florence-drawer-open");
      document.body.classList.remove("florence-drawer-open");
      document.body.style.removeProperty("top");
      window.scrollTo(0, drawerScrollY);
    }
  }

  function installImageFallback(image) {
    if (image.dataset.fallbackInstalled) return;
    image.dataset.fallbackInstalled = "true";
    const showFallback = () => {
      if (image.nextElementSibling?.classList.contains("first-aid-image-fallback")) return;
      image.hidden = true;
      const fallback = document.createElement("div");
      fallback.className = "first-aid-image-fallback";
      fallback.textContent = "Illustration temporarily unavailable. Follow the written first-aid steps below and call 000 in an emergency.";
      image.insertAdjacentElement("afterend", fallback);
    };
    image.addEventListener("error", showFallback, { once: true });
    if (image.complete && image.naturalWidth === 0) showFallback();
  }

  const observer = new MutationObserver(() => {
    syncDrawerLock();
    configureDomesticChecklist();
    document.querySelectorAll("img.first-aid-illustration").forEach(installImageFallback);
    const current = getExpenditureForm();
    if (current && !current.form.dataset.draftRestored) {
      current.form.dataset.draftRestored = "true";
      void restoreDraft(current.form, current.kind);
    }
    if (!current && pendingSubmitKind) {
      clearDraft(pendingSubmitKind);
      pendingSubmitKind = null;
    }
    if (!current) reopenDraftIfNeeded();
  });

  document.addEventListener("input", (event) => {
    const current = getExpenditureForm();
    if (current && current.form.contains(event.target)) saveDraft(current.form, current.kind);
  }, true);

  document.addEventListener("change", (event) => {
    const current = getExpenditureForm();
    if (!current || !current.form.contains(event.target)) return;
    saveDraft(current.form, current.kind);
    if (event.target.matches("input[name='receipts']")) {
      const count = event.target.files?.length || 0;
      if (count) setReceiptStatus(current.form, `Protecting ${count} receipt file${count === 1 ? "" : "s"} while you finish this form…`);
      void storeFiles(current.kind, event.target.files).then(() => {
        if (count) setReceiptStatus(current.form, `${count} receipt file${count === 1 ? "" : "s"} attached and protected until this record saves.`);
      });
    }
  }, true);

  document.addEventListener("submit", (event) => {
    const current = getExpenditureForm();
    if (!current || event.target !== current.form || restoringFiles) return;
    saveDraft(current.form, current.kind);
    const receiptInput = current.form.querySelector("input[name='receipts']");
    const draft = loadDraft();
    if (!receiptInput?.files?.length && draft?.kind === current.kind && draft.hasReceipts) {
      event.preventDefault();
      event.stopImmediatePropagation();
      restoringFiles = true;
      const submitter = event.submitter;
      void restoreFiles(current.form, current.kind).then((restored) => {
        restoringFiles = false;
        if (restored) current.form.requestSubmit(submitter || undefined);
        else setReceiptStatus(current.form, "Please reattach the receipt photo before saving. Your other form details are still protected.");
      });
      return;
    }
    pendingSubmitKind = current.kind;
  }, true);

  document.addEventListener("click", (event) => {
    const current = getExpenditureForm();
    if (!current) return;
    const button = event.target.closest("button");
    if (!button) return;
    if (button.classList.contains("modal-close") || button.classList.contains("modal-scrim") || button.textContent?.trim() === "Cancel") {
      clearDraft(current.kind);
    }
  }, true);

  window.addEventListener("pagehide", () => {
    const current = getExpenditureForm();
    if (current) saveDraft(current.form, current.kind);
  });

  document.addEventListener("DOMContentLoaded", () => {
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
    syncDrawerLock();
    configureDomesticChecklist();
    document.querySelectorAll("img.first-aid-illustration").forEach(installImageFallback);
    window.setTimeout(reopenDraftIfNeeded, 900);
  });
})();
