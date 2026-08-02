window.FLORENCE_CONFIG = {
  organisationName: "I-Care Connect",

  supabaseUrl: "https://pbbsaquwumxyrhqhnobv.supabase.co",
  supabaseAnonKey: "sb_publishable_4D2Oc8FJjOXDXgGG7GbzfA_oYRpXSU5",
  functionRegion: "ap-southeast-2",
  pushVapidPublicKey: "BCDGKAl9z7iB38nlV19HFEaj8k-v-4B-" +
    "nFMLTqGWYS6sKG39imwkxBcsbcA663HETK2F2OSDDfY87Ay3JnOQSmg",

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
// the PostgreSQL database and keep sessions persistent across ordinary reloads.
(() => {
  const api = window.supabase;
  if (!api?.createClient || api.__florenceRegionPinned) return;

  const createClient = api.createClient.bind(api);
  api.createClient = (url, key, options = {}) => {
    const supplied = options && typeof options === "object" ? options : {};
    const suppliedAuth = supplied.auth && typeof supplied.auth === "object" ? supplied.auth : {};
    const client = createClient(url, key, {
      ...supplied,
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.localStorage,
        storageKey: "florence-auth-session",
        ...suppliedAuth
      }
    });
    const functions = client?.functions;
    if (!functions?.invoke || functions.__florenceRegionPinned) return client;

    const invoke = functions.invoke.bind(functions);
    functions.invoke = (functionName, invokeOptions = {}) => {
      const safeOptions = invokeOptions && typeof invokeOptions === "object" ? invokeOptions : {};
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
    "push-device-controls-v3.js",
    "setup-code-display.js?v=20260802-1",
    "portal-participant-label.js?v=20260802-2",
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
