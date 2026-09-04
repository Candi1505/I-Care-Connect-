(() => {
  const FORM_CONFIG = {
    "Community & social support record": {
      dateName: "supported_at",
      narrativeName: "support_provided",
      dateLabel: "When did the support actually happen?",
    },
    "Community support daily handover": {
      dateName: "occurred_at",
      narrativeName: "health_wellbeing",
      dateLabel: "When did this handover period actually occur?",
    },
    "Daily client choices": {
      dateName: "occurred_at",
      narrativeName: "outcome",
      dateLabel: "When was the choice actually made?",
    },
    "Community support expenditure": {
      dateName: "purchased_at",
      narrativeName: "description",
      dateLabel: "When did the purchase actually happen?",
    },
    "Participant transport & mileage": {
      dateName: "travelled_at",
      narrativeName: "notes",
      dateLabel: "When did the journey actually happen?",
    },
    "Visitor / contractor log": {
      dateName: "arrival_at",
      narrativeName: "notes",
      dateLabel: "When did the visit actually begin?",
    },
    "Progress note": {
      dateName: "service_occurred_at",
      narrativeName: "content",
      dateLabel: "When did the support or event actually happen?",
      injectDate: true,
      alwaysRecordTiming: true,
    },
    "Incident report": {
      dateName: "occurred_at",
      narrativeName: "description",
      dateLabel: "When did the incident actually happen?",
    },
    "Timeline event": {
      dateName: "occurred_at",
      narrativeName: "description",
      dateLabel: "When did the event actually happen?",
    },
  };

  const TIMING_START = "Florence record timing";
  const TIMING_END = "End Florence record timing";
  const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

  function localDateTimeValue(date = new Date()) {
    const offset = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  }

  function formatBrisbane(date) {
    return new Intl.DateTimeFormat("en-AU", {
      timeZone: "Australia/Brisbane",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  function isEarlierCalendarDay(date, now) {
    const selectedDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return selectedDay < today;
  }

  function removeExistingTimingBlock(value) {
    const escapedStart = TIMING_START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedEnd = TIMING_END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`${escapedStart}[\\s\\S]*?${escapedEnd}\\s*`, "g");
    return String(value || "").replace(pattern, "").trim();
  }

  function timingBlock(eventDate, now, reason, isLate) {
    const lines = [
      TIMING_START,
      `Actual support/event time: ${formatBrisbane(eventDate)}`,
      `Submitted to Florence: ${formatBrisbane(now)}`,
    ];

    if (isLate) {
      lines.push("Entry type: Late entry");
      lines.push(`Reason: ${reason.trim()}`);
    } else {
      lines.push("Entry type: Same-day entry");
    }

    lines.push(TIMING_END);
    return lines.join("\n");
  }

  function createDateField(config) {
    const label = document.createElement("label");
    label.className = "late-entry-date-field";
    label.textContent = config.dateLabel;

    const input = document.createElement("input");
    input.name = config.dateName;
    input.type = "datetime-local";
    input.required = true;
    input.value = localDateTimeValue();
    label.append(input);

    return { label, input };
  }

  function createPanel(config, dateInput) {
    const panel = document.createElement("section");
    panel.className = "late-entry-panel";
    panel.dataset.florenceLateEntryPanel = "true";

    const heading = document.createElement("strong");
    heading.textContent = "Actual date and Florence audit time";

    const help = document.createElement("p");
    help.textContent =
      "Choose when the support or event really happened. Florence will still keep the genuine submission time and, where PIN signing applies, the signing time.";

    const status = document.createElement("span");
    status.className = "late-entry-status";
    status.setAttribute("role", "status");

    const reasonLabel = document.createElement("label");
    reasonLabel.className = "late-entry-reason";
    reasonLabel.hidden = true;
    reasonLabel.textContent = "Why is this being entered late?";

    const reason = document.createElement("textarea");
    reason.name = "late_entry_reason";
    reason.rows = 3;
    reason.placeholder =
      "For example: I forgot to complete the form at the time of support.";
    reasonLabel.append(reason);

    panel.append(heading, help, status, reasonLabel);

    function update() {
      const now = new Date();
      const eventDate = dateInput.value ? new Date(dateInput.value) : null;
      const validDate = eventDate && !Number.isNaN(eventDate.getTime());
      const isFuture = validDate && eventDate.getTime() > now.getTime() + 60_000;
      const isLate =
        validDate &&
        !isFuture &&
        (isEarlierCalendarDay(eventDate, now) ||
          now.getTime() - eventDate.getTime() > TWELVE_HOURS_MS);

      dateInput.max = localDateTimeValue(now);
      dateInput.setCustomValidity(
        isFuture ? "Choose a date and time that has already happened." : "",
      );

      reasonLabel.hidden = !isLate;
      reason.required = Boolean(isLate);
      if (!isLate) reason.setCustomValidity("");
      panel.classList.toggle("is-late", Boolean(isLate));
      status.textContent = isLate
        ? "Late entry — a brief reason is required."
        : "Same-day entry — the selected time and genuine submission time will both be preserved.";

      return { eventDate, isLate, validDate };
    }

    dateInput.addEventListener("input", update);
    dateInput.addEventListener("change", update);
    update();

    return { panel, reason, update };
  }

  function enhanceForm(form) {
    if (form.dataset.florenceLateEntryReady === "true") return;

    const modal = form.closest(".record-modal");
    const title = modal?.querySelector("h2")?.textContent?.trim();
    const config = title ? FORM_CONFIG[title] : null;
    if (!config) return;

    let dateInput = form.querySelector(`input[name="${config.dateName}"]`);
    let insertionPoint = null;

    if (!dateInput && config.injectDate) {
      const created = createDateField(config);
      dateInput = created.input;
      insertionPoint = form.querySelector("label");
      insertionPoint?.after(created.label);
      insertionPoint = created.label;
    }

    if (!dateInput) return;

    if (!dateInput.value) dateInput.value = localDateTimeValue();
    dateInput.required = true;
    dateInput.setAttribute("aria-describedby", "florence-late-entry-guidance");

    const dateLabel = dateInput.closest("label");
    if (dateLabel && !config.injectDate) {
      const labelText = Array.from(dateLabel.childNodes).find(
        (node) => node.nodeType === Node.TEXT_NODE,
      );
      if (labelText) labelText.textContent = config.dateLabel;
    }

    const controls = createPanel(config, dateInput);
    controls.panel.id = "florence-late-entry-guidance";

    if (!insertionPoint) {
      insertionPoint = dateInput.closest(".field-pair") || dateLabel;
    }
    insertionPoint?.after(controls.panel);

    form.dataset.florenceLateEntryReady = "true";
    form.__florenceLateEntry = { config, dateInput, ...controls };
  }

  function prepareSubmission(form) {
    const state = form.__florenceLateEntry;
    if (!state) return true;

    const { config, dateInput, reason, update } = state;
    const { eventDate, isLate, validDate } = update();
    if (!validDate || !eventDate || dateInput.validationMessage) {
      dateInput.reportValidity();
      return false;
    }

    if (isLate && !reason.value.trim()) {
      reason.setCustomValidity("Explain briefly why this form is being entered late.");
      reason.reportValidity();
      return false;
    }
    reason.setCustomValidity("");

    if (!isLate && !config.alwaysRecordTiming) return true;

    const narrative = form.elements.namedItem(config.narrativeName);
    if (!(narrative instanceof HTMLTextAreaElement || narrative instanceof HTMLInputElement)) {
      return true;
    }

    const cleanNarrative = removeExistingTimingBlock(narrative.value);
    const block = timingBlock(eventDate, new Date(), reason.value, isLate);
    narrative.value = `${block}\n\n${cleanNarrative}`.trim();
    narrative.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }

  document.addEventListener(
    "submit",
    (event) => {
      const form = event.target;
      if (form instanceof HTMLFormElement && !prepareSubmission(form)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );

  const observer = new MutationObserver(() => {
    document.querySelectorAll(".record-modal form.record-form").forEach(enhanceForm);
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.querySelectorAll(".record-modal form.record-form").forEach(enhanceForm);
})();
