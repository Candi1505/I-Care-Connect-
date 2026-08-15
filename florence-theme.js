(() => {
  "use strict";

  const toneMap = {
    home: "home",
    people: "people",
    roster: "roster",
    mar: "mar",
    portal: "portal",
    more: "more",
    "client timeline": "notes",
    "progress note": "notes",
    "progress notes": "notes",
    medication: "mar",
    incident: "safety",
    "incidents & complaints": "safety",
    "compliance centre": "compliance",
    "domestic duties": "people",
    "sil delivery": "sil",
    "timesheets & deputy": "roster",
    "transport & mileage": "roster",
    "participant goal": "portal",
    "goals & funding": "portal",
    "backup & auditor export": "compliance",
    workers: "people",
    "my security": "sil"
  };

  const viewMap = {
    people: "people",
    roster: "roster",
    "medication & mar": "mar",
    mar: "mar",
    portal: "portal",
    "all tools": "more",
    more: "more",
    "client timeline": "notes",
    "progress notes": "notes",
    "incidents & complaints": "safety",
    "compliance centre": "compliance",
    "domestic duties": "people",
    "sil delivery": "sil",
    "timesheets & deputy": "roster",
    "transport & mileage": "roster",
    "goals & funding": "portal",
    "backup & auditor export": "compliance",
    workers: "people",
    "my security": "sil"
  };

  const toolGroups = [
    { key: "daily", label: "Daily records", tag: "MOST USED", order: 10 },
    { key: "safety", label: "Safety", tag: "IMPORTANT", order: 20 },
    { key: "quality", label: "Compliance & audit", tag: "QUALITY", order: 30 },
    { key: "time", label: "Time & movement", tag: "DAILY OPERATIONS", order: 40 },
    { key: "people", label: "People & household", tag: "SERVICE SUPPORT", order: 50 },
    { key: "sil", label: "SIL & access", tag: "SUPPORTED LIVING", order: 60 },
    { key: "goals", label: "Goals & funding", tag: "PARTICIPANT OUTCOMES", order: 70 }
  ];

  const toolOrder = {
    "progress notes": ["daily", 11],
    "client timeline": ["daily", 12],
    "incidents & complaints": ["safety", 21],
    "compliance centre": ["quality", 31],
    "backup & auditor export": ["quality", 32],
    "timesheets & deputy": ["time", 41],
    "transport & mileage": ["time", 42],
    workers: ["people", 51],
    "domestic duties": ["people", 52],
    "sil delivery": ["sil", 61],
    "my security": ["sil", 62],
    "goals & funding": ["goals", 71]
  };

  const text = element => String(element?.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();

  function toneFor(label) {
    const key = Object.keys(toneMap).find(candidate => label.includes(candidate));
    return key ? toneMap[key] : "home";
  }

  function decorateNavigation() {
    document.querySelectorAll(".bottom-nav button, .side-nav button, .side-section button").forEach(button => {
      button.dataset.florenceTone = toneFor(text(button));
    });
  }

  function decorateHome() {
    document.querySelectorAll(".stat-grid .stat").forEach((card, index) => {
      card.dataset.florenceTone = ["roster", "mar", "notes", "compliance"][index] || "home";
    });

    document.querySelectorAll(".quick-grid button").forEach(button => {
      if (!button.dataset.florenceTone) {
        button.dataset.florenceTone = toneFor(text(button));
      }
    });
  }

  function decorateTools() {
    if (document.querySelector(".tool-groups")) {
      document.querySelectorAll(".flo-tool-heading").forEach(heading => heading.remove());
      return;
    }

    const grid = document.querySelector(".tool-grid");
    if (!grid || text(document.querySelector(".module-head h1")) !== "all florence tools") return;

    grid.classList.add("flo-grouped-tools");
    const buttons = [...grid.querySelectorAll(":scope > button")];
    buttons.forEach(button => {
      const label = text(button.querySelector("strong")) || text(button);
      const key = Object.keys(toolOrder).find(candidate => label.includes(candidate));
      if (!key) return;
      const [group, order] = toolOrder[key];
      button.dataset.florenceTone = toneFor(label);
      button.dataset.florenceGroup = group;
      button.style.order = String(order);
    });

    toolGroups.forEach(group => {
      let heading = grid.querySelector(`[data-florence-heading="${group.key}"]`);
      if (!heading) {
        heading = document.createElement("div");
        heading.className = "flo-tool-heading";
        heading.dataset.florenceHeading = group.key;
        heading.innerHTML = `<strong>${group.label}</strong><span>${group.tag}</span>`;
        grid.appendChild(heading);
      }
      heading.style.order = String(group.order);
    });
  }

  function currentView() {
    if (document.querySelector(".welcome")) return "home";
    const active = document.querySelector(".bottom-nav button.active, .side-nav button.active, .side-section button.active");
    const activeText = text(active);
    const activeKey = Object.keys(viewMap).find(candidate => activeText.includes(candidate));
    if (activeKey) return viewMap[activeKey];
    const title = text(document.querySelector(".module-head h1"));
    const titleKey = Object.keys(viewMap).find(candidate => title.includes(candidate));
    return titleKey ? viewMap[titleKey] : "home";
  }

  function applyTheme() {
    document.body.dataset.florenceView = currentView();
    decorateNavigation();
    decorateHome();
    decorateTools();
  }

  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      applyTheme();
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", schedule, { once: true });
  } else {
    schedule();
  }

  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("click", schedule, true);
})();
