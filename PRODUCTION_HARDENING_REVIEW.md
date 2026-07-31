# Florence production-hardening review record

Review date: 31 July 2026  
Scope: uploaded Florence production-hardening patch, current `Candi1505/I-Care-Connect-` main-branch structure and the privileged Supabase pathways used by the patch.

## High-risk issues corrected

### 1. Family and participant portal startup crash

The uploaded `app.js` called `.forEach()` on the result of `querySelector()`. Portal users would reach this line when Florence hid staff-only navigation, causing startup to stop. The selector now uses `querySelectorAll()` through Florence’s `$$` helper.

### 2. Direct unsigned MAR pathway

A stale click handler could insert directly into `mar_entries` with `pin_verified:false`. The handler was removed. The migration removes the direct MAR insert policy, and medication outcomes must now pass through the server-side signing function.

### 3. Direct progress-note inserts and post-signature edits

The earlier RLS policies allowed direct progress-note inserts and browser updates. The reviewed migration removes those pathways. Signed notes are created through the PIN/MFA/access-checked server function and are not overwritten through the browser.

### 4. Privileged database functions could bypass MFA and participant access

The existing medication, progress-note and signing-PIN functions used `SECURITY DEFINER`. That is appropriate only when the function performs every security check itself. The reviewed definitions now require an AAL2 session, an active staff profile, the correct signing PIN where applicable and current participant access.

### 5. Worker shift updates were broader than the interface suggested

The old worker update policy allowed an assigned worker to update the whole shift row, not only its response. The reviewed migration removes worker direct-update policies. `claim_open_shift` and `respond_to_shift` change only the permitted fields after verifying MFA and the worker’s identity.

### 6. Edge Functions used the service role without checking MFA

The staff-management and Xero functions verified the user and role but did not verify the JWT assurance level. Both reviewed functions require `aal2` before privileged service-role activity and restrict browser origins to Florence’s configured origin.

### 7. Private document write policies did not require MFA

The reviewed storage insert, update and delete policies require both an AAL2 session and an active supervisor in the current organisation. Read access also follows Florence’s document metadata and participant boundary.

### 8. Open-shift notification could target a null recipient

Published open shifts have no assigned worker. The previous notification trigger could attempt to insert a notification with a null recipient. The reviewed trigger broadcasts open shifts to active support workers and sends assigned-shift notifications only when a recipient exists.

### 9. Migration rerun and partial-application risks

Retention policies are now dropped before recreation, control-table grants are explicit, prerequisite objects are checked at the start and the whole migration runs in one transaction. A prerequisite failure rolls the migration back.

### 10. The browser “backup” was incomplete and unencrypted

The original export wrote participant and clinical data to plain JSON and did not include private document file bytes. Its browser upsert restore also conflicted with immutable signed records. The reviewed app creates a supervisor-only AES-GCM encrypted archive with a separately held passphrase, identifies the excluded document files, and disables browser clinical restore. Disaster recovery must use the tested Supabase database and private-storage restore procedure.

## Additional resilience corrections

- duplicate application entry caused by simultaneous login and auth-state events is guarded;
- application boot now waits until the operational and staff-management modules have registered their ready listeners;
- inactive or unusable sessions are cleared so the sign-in screen remains usable;
- failed document metadata creation removes the orphaned uploaded file;
- every non-administered medication-round outcome sends a reason to the server;
- participant access assignments validate the participant, worker and supervisors against the same organisation;
- access revocation is retained instead of hard-deleted;
- retention disposal is blocked during legal hold, before the minimum date or without a documented decision;
- Xero callback completion re-checks that the initiating supervisor remains active and authorised.

## Validation performed

- Node syntax parsing for all browser JavaScript;
- TypeScript parser/transpilation validation for both Edge Functions;
- asset-reference and service-worker cache consistency checks;
- cross-file search for direct `mar_entries` and `progress_notes` inserts;
- cross-file search for old direct support-worker shift updates;
- static secret-pattern scan;
- comparison with the current repository’s base, audit-readiness, operational-control, staff-management and Xero pathways.

## Validation still required in Supabase

- execute the migration against a non-production copy of the current database;
- test supervisor, support-worker, family and participant accounts with AAL1 and AAL2 sessions;
- test every RLS boundary with direct REST requests as well as the interface;
- deploy both Edge Functions and verify rejected AAL1 and unapproved-origin requests;
- verify the old and new migration history in the live Supabase project;
- complete backup restoration and independent privacy/cybersecurity testing.

This review is a technical hardening record, not a compliance certification, legal opinion or penetration-test report.
