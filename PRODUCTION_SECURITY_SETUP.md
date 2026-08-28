# Florence production security setup

Florence must remain **test-data-only** until this deployment is complete, the access tests pass and an independent privacy/cybersecurity review has been completed.

This reviewed package hardens both the browser app and its privileged Supabase pathways. The SQL migration alone is not enough: the two Edge Functions in this package must also be deployed.

## Before changing production

1. Create an approved Supabase database backup and a private-storage backup, then record the date, person completing them and storage location. The browser’s encrypted archive is an additional audit/export copy, not a complete disaster-recovery backup.
2. Confirm a database and private-storage restore test has previously succeeded, or perform one in a separate test project.
3. Confirm these earlier non-destructive migrations have already run successfully:
   - `florence-audit-readiness-upgrade.sql`
   - `florence-operational-controls-upgrade.sql`
4. Confirm the live site is using HTTPS and only the public Supabase publishable key is present in `config.js`.
5. Schedule a short maintenance window. The old app and new security policies should not be left running as a mixed version.

## Safe deployment order

1. Deploy the updated `staff-management` Edge Function from:
   - `supabase/functions/staff-management/index.ts`
2. Deploy the updated `xero-connect` Edge Function from:
   - `supabase/functions/xero-connect/index.ts`
3. Confirm the Edge Function secrets are configured:
   - `FLORENCE_APP_URL` — Florence’s exact live HTTPS URL;
   - `FLORENCE_ALLOWED_ORIGINS` — optional comma-separated list of allowed Florence origins; when omitted, the origin from `FLORENCE_APP_URL` is used;
   - existing Xero secrets for `xero-connect`: `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, `XERO_REDIRECT_URI`, and `XERO_SALES_ACCOUNT_CODE`.
4. Deploy the updated Florence web files. Do **not** overwrite `config.js` with a template or place a service-role key in browser code.
5. Immediately run `florence-production-hardening-upgrade.sql` in Supabase SQL Editor.
6. Confirm the SQL transaction finishes successfully. An error rolls back the migration rather than leaving a partial hardening release.
7. Sign out of Florence completely, refresh the website and sign back in.

## What the migration enforces

- verified authenticator-app MFA before sensitive tables can be read or changed;
- participant access limited to supervisors, the linked family/participant portal account, an explicit support-worker assignment, or a current rostered shift window;
- no direct browser insert into MAR or signed progress notes;
- PIN, MFA, active-worker and participant-access checks inside the privileged medication and progress-note functions;
- controlled RPCs for open-shift claiming and shift accept/decline, preventing workers from changing roster dates, participants or instructions;
- MFA enforcement inside the staff-management and Xero Edge Functions before they use the Supabase service role;
- MFA and participant boundaries for private document reads, with MFA-supervisor controls for upload, replacement and deletion;
- access-event auditing and retained assignment history;
- a decision-controlled retention register with no automatic record deletion;
- a corrected open-shift notification pathway that never creates a notification with a null recipient.

## First sign-in and MFA

Every active supervisor, support worker, family representative and participant portal account must enrol an authenticator and verify a six-digit code before Florence opens sensitive data.

During first-time enrolment Florence must support both approved setup routes: scanning the QR code from a second device, or opening the authenticator / entering the one-time setup key on the same phone. The setup key is shown only for the current enrolment, is never stored by Florence, and must never be photographed, messaged or recorded as support evidence.

Record evidence of MFA enrolment without recording the QR code, setup secret or one-time codes. Supervisors must never ask workers for their Florence password, authenticator setup secret or signing PIN.

## Participant-access setup

1. Sign in as a supervisor with MFA.
2. Open **People & access management**.
3. For each support worker, tick only the participants they currently support.
4. Do not give a permanent assignment merely to cover one shift. A published rostered shift provides time-limited access from 12 hours before its start until 12 hours after its finish.
5. Revoke an ongoing assignment when the worker no longer supports that participant. Florence retains the historical assignment rather than deleting it.

## Required access tests

Use fake records in a test participant account.

### Support worker

- assigned participant appears;
- unassigned participant is not returned in People, medications, MAR, progress notes, timeline, incidents, goals, funding, documents or portal records;
- removing the ongoing assignment removes access outside any current roster window;
- a published assigned shift grants temporary access in the defined window;
- an open shift can be claimed once only;
- accept/decline works, but the worker cannot alter the shift’s participant, dates, type, instructions or assigned worker through the API;
- a direct REST insert into `mar_entries` or `progress_notes` is denied;
- MAR and progress-note creation succeeds only with the worker’s correct six-digit signing PIN;
- a non-administered medication outcome is rejected unless a reason is recorded.

### Family or participant portal

- the portal opens after MFA;
- only the linked participant is visible;
- staff-only navigation is hidden;
- the portal does not crash while hiding restricted navigation;
- another participant’s record cannot be retrieved by changing a request ID.

### Supervisor

- People & access management requires MFA;
- account invitations, role changes, deactivation and reactivation are written to audit activity;
- at least one active supervisor must remain;
- a supervisor without an AAL2 session cannot invoke staff-management or Xero operations;
- participant documents open only through short-lived signed URLs;
- a failed compliance metadata insert removes the newly uploaded orphan file;
- Xero connection, disconnection and invoice sync remain supervisor-only.

## Audit and retention checks

1. Confirm audit activity records sign-ins, MFA enrolment, sensitive views, downloads, exports, account administration and database changes.
2. Confirm new incidents and complaints create retention-register entries.
3. Confirm existing incidents and complaints have been backfilled.
4. Confirm the seven-year minimum is calculated from the incident occurrence or complaint received date.
5. Confirm a record under legal hold cannot be approved for disposal.
6. Confirm disposal cannot be approved before the minimum retention date and requires a documented supervisor decision.
7. Do not delete source records automatically when a retention review becomes due.

## Important scope notes

- The Supabase project’s selected region does not by itself prove that every backup, email, log, analytics service or integration remains in Australia. Verify each service separately before sending it participant information.
- App-store publication does not determine privacy, security or NDIS compliance. The same controls apply to an internal web app.
- This hardening package reduces identified technical risks; it is not an NDIS audit opinion, legal advice, penetration-test report or independent security certification.
- Keep Florence test-data-only until cross-participant denial testing, backup restoration and independent review evidence have been completed and retained.

## Rollout evidence to retain

- pre-deployment backup and restore-test result;
- migration success output, date and person completing it;
- deployed Edge Function versions and secret checklist;
- MFA enrolment confirmation for every active account;
- supervisor-signed participant-access review;
- screenshots or test records proving cross-participant access is denied;
- denied direct MAR, progress-note and shift-update tests;
- sample audit entries for sign-in, view, download, export and account administration;
- retention-register sample and legal-hold test;
- independent review report and remediation record.
