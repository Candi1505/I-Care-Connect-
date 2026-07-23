window.FLORENCE_CONFIG = {
  organisationName: "I-Care Connect",

  // Paste these two PUBLIC browser values from:
  // Supabase → Project Settings → API
  supabaseUrl: "",
  supabaseAnonKey: "",

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