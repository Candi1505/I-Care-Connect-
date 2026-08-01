# Cloudflare SIL redirect diagnostic and resolution

**Reported:** 1 August 2026  
**Production host:** `https://i-care-connect.candi1505.workers.dev/`  
**Status:** Corrected in reviewed release; live Cloudflare deployment confirmation pending

## Reported behaviour

After the Supabase authentication and Edge Function origin cutover, a signed-in supervisor reported that opening the SIL workspace or controlled private-document pathway returned to Florence Home rather than opening the requested resource.

## Root causes

1. Cloudflare Workers Static Assets was configured with `not_found_handling: single-page-application`. Florence is a multi-page application with both `index.html` and `sil.html`; an unmatched SIL route could therefore receive the Home application shell.
2. The SIL page redirected every authentication, authorisation, database-load and controlled-library-load failure to `index.html`. Because the user already had a valid Florence session, `index.html` immediately opened the Home dashboard and hid the actual failure.
3. The SIL page checked MFA assurance without first refreshing the current session.
4. The private PDF workflow created its new browser tab only after asynchronous audit and signed-link requests. Safari or iPhone popup protection could block that delayed tab.
5. A temporary Supabase RPC compatibility shim was still being used for SIL audit calls.
6. The service worker used the Home document as a fallback for any failed same-origin request, which could also conceal a missing page.

## Corrections

- Florence is explicitly configured as a multi-page static application using Cloudflare HTML routing and no SPA not-found fallback.
- `/sil.html` and canonical `/sil` must return the actual SIL document.
- blocked internal files, including SQL migrations, must return HTTP 404 rather than the Home application shell.
- the SIL page refreshes the Supabase session before checking AAL2.
- an AAL1 or signed-out user is sent through Florence's normal sign-in/MFA gate and returned to SIL after verification.
- an authorised user now sees a safe, visible SIL startup error instead of being silently redirected to Home.
- private PDFs pre-open a browser target during the user's tap before requesting the two-minute signed Storage URL.
- SIL audit calls use ordinary awaited RPC handling; the temporary RPC monkey-patch has been removed.
- the service worker returns only an exact cached response or a 503 offline response and no longer substitutes Home for an unrelated failed request.
- asset and service-worker versions were advanced to clear the incorrectly cached route.

## Automated validation

The reviewed release passed:

- JavaScript syntax checks;
- **122 Florence static security and readiness checks**;
- Cloudflare deny-by-default public-asset allowlist audit with 14 runtime files;
- Wrangler deployment dry run;
- local Cloudflare route smoke test confirming:
  - `/` returns the Florence Home document;
  - `/sil.html` returns the SIL document;
  - `/sil` returns the SIL document;
  - a production SQL migration path returns HTTP 404 and does not return Home;
- the complete PostgreSQL migration and role-boundary smoke test;
- GitHub CodeQL JavaScript/TypeScript analysis.

## Live confirmation required

After the reviewed change is merged and Cloudflare publishes the new `main` commit:

1. close all Florence tabs so the previous service-worker route is released;
2. reopen the Workers URL and sign in;
3. open **Controlled policies, handbooks & SIL resources**;
4. confirm the SIL workspace opens rather than Home;
5. open at least two private PDFs;
6. if a start-up problem remains, retain and report the visible error shown by the SIL page rather than repeatedly refreshing.

No SQL migration, document re-import, MFA re-enrolment or Edge Function redeployment is required for this routing correction.
