window.FLORENCE_CONFIG = {
  organisationName: "I-Care Connect",
  demoAppPin: "123456",
  demoMedicationPin: "654321",

  // Add your Supabase project values when ready.
  supabaseUrl: "",
  supabaseAnonKey: "",

  // Xero requires a registered OAuth 2.0 app and a secure backend callback.
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
  ],
  maxDocumentBytes: 8 * 1024 * 1024
};