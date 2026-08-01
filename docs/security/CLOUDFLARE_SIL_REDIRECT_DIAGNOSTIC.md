# Cloudflare SIL redirect diagnostic

**Reported:** 1 August 2026  
**Production host:** `https://i-care-connect.candi1505.workers.dev/`

After the Supabase authentication and Edge Function origin cutover, a signed-in supervisor reported that opening the SIL workspace or controlled private PDF pathway returned to Florence Home rather than opening the requested resource.

The current SIL page redirects every authentication, authorisation, database-load and controlled-library-load failure to `index.html`. Because the user already has a valid Florence session, `index.html` immediately opens the Home dashboard. This masks the underlying cause and makes an operational error appear to be ordinary navigation.

Required correction:

1. verify that Cloudflare serves `sil.html` as the separate SIL document rather than the SPA fallback;
2. remove SPA fallback routing because Florence is a multi-page static application;
3. refresh the authenticated session before checking AAL2 on the SIL page;
4. return an AAL1 user through Florence's MFA gate and back to SIL;
5. show a safe, visible SIL start-up error instead of silently redirecting a signed-in user;
6. open private PDFs through a pre-opened browser tab and use an ordinary awaited audit RPC rather than a compatibility shim;
7. add automated route and static checks to prevent recurrence.
