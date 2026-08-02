window.FLORENCE_CONFIG = {
  organisationName: "I-Care Connect",

  supabaseUrl: "https://pbbsaquwumxyrhqhnobv.supabase.co",
  supabaseAnonKey: "sb_publishable_4D2Oc8FJjOXDXgGG7GbzfA_oYRpXSU5",
  functionRegion: "ap-southeast-2",
  pushVapidPublicKey: "BLCcyvo7Z3btgf6mGhl33Hfo8AO3w0z_5CV4R3wGGTESjzzJq93GldinKtexynx2XOKvh3Y1zar6wWTgPmfW4Go",

  storageBucket: "florence-private",
  maxDocumentBytes: 8 * 1024 * 1024,

  xero: {
    clientId: "",
    redirectUri: "",
    tenantId: ""
  },

  acceptedDocumentTypes: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "image/jpeg",
    "image/png",
    "image/heic",
    "text/plain"
  ]
};

// Keep privileged Florence Edge Function processing in the same Sydney region as
// the PostgreSQL database and private Storage origin.
(() => {
  const api = window.supabase;
  if (!api?.createClient || api.__florenceRegionPinned) return;

  const createClient = api.createClient.bind(api);
  api.createClient = (...args) => {
    const client = createClient(...args);
    const functions = client?.functions;
    if (!functions?.invoke || functions.__florenceRegionPinned) return client;

    const invoke = functions.invoke.bind(functions);
    functions.invoke = (functionName, options = {}) => {
      const safeOptions = options && typeof options === "object" ? options : {};
      return invoke(functionName, {
        ...safeOptions,
        region: safeOptions.region || window.FLORENCE_CONFIG.functionRegion
      });
    };
    functions.__florenceRegionPinned = true;
    return client;
  };

  api.__florenceRegionPinned = true;
})();

// Load optional Florence runtime modules directly from the page lifecycle rather
// than depending on service-worker HTML injection. This keeps mobile Home Screen
// installs and ordinary browser sessions on the same feature set.
(() => {
  const modules = [
    "setup-code-display.js?v=20260802-1",
    "portal-participant-label.js?v=20260802-2",
    "push-notifications.js?v=20260802-2",
    "push-registration-verifier.js?v=20260802-1",
    "portal-care-plan.js?v=20260802-1",
    "medication-prn-fix.js?v=20260802-1",
    "regular-medication-tab.js?v=20260802-1",
    "florence-readiness-controls.js?v=20260802-1",
    "remote-s8-verification.js?v=20260802-1"
  ];
  const load = () => {
    for (const src of modules) {
      const path = src.split("?")[0];
      if ([...document.scripts].some(script => (script.getAttribute("src") || "").includes(path))) continue;
      const script = document.createElement("script");
      script.src = src;
      script.defer = true;
      script.dataset.florenceRuntime = path;
      document.head.appendChild(script);
    }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load, { once: true });
  else load();
})();
