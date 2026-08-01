window.FLORENCE_CONFIG = {
  organisationName: "I-Care Connect",

  supabaseUrl: "https://pbbsaquwumxyrhqhnobv.supabase.co",
  supabaseAnonKey: "sb_publishable_4D2Oc8FJjOXDXgGG7GbzfA_oYRpXSU5",
  functionRegion: "ap-southeast-2",

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
// the PostgreSQL database and private Storage origin. The browser Supabase bundle
// accepts the AWS region string used by the functions client. This wrapper applies
// it consistently to staff-management, Xero and future Florence functions unless a
// call deliberately supplies a different region for an outage response.
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
