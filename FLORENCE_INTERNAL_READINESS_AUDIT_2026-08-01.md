# Florence Internal Readiness Audit

> Historical engineering snapshot only. The 44-document result below was superseded on 13 August 2026 by the 97-requirement Core + Module 5A catalogue and separate live-evidence matrix in `FLORENCE_CORE_MODULE_5A_AUDIT_CHECKLIST.md`. It is not evidence that I-Care Connect is currently audit ready.

**Organisation:** I-Care Connect PTY LTD  
**Application:** Florence  
**Audit date:** 1 August 2026  
**Repository:** `Candi1505/I-Care-Connect-`  
**Audit type:** Internal engineering, privacy-boundary and release-readiness review

## Executive result

| Area | Result |
|---|---|
| Static application and repository audit | **PASS — 114 checks** |
| JavaScript syntax | **PASS** |
| Full PostgreSQL migration build | **PASS — base schema and every production migration** |
| Database cleanup and RLS smoke test | **PASS — worker, family and supervisor boundaries exercised** |
| Controlled private document library | **Historical pass — 44-document manifest; superseded and requires management re-verification** |
| Code-level security baseline | **PASS FOR LIVE UAT** |
| Known fake participant and medication cleanup | **PASS in an isolated database; pending one live migration run** |
| Live role-based user acceptance testing | **Not yet completed** |
| Backup and restore test | **Not yet evidenced** |
| Independent privacy/cybersecurity review | **Not yet completed** |
| Approval for real participant information | **NOT YET APPROVED** |

Florence has passed the completed code-level, static and isolated-database release checks. It is suitable to proceed to controlled live user-acceptance testing with fake information after the final migration succeeds in the live Supabase project. It must not yet be treated as independently certified or approved for unrestricted real participant use.

## Scope reviewed

The review covered:

- authentication and mandatory MFA pathways;
- supervisor, support worker, family representative and participant roles;
- participant-scoped database access;
- roster claiming and accept/decline controls;
- medication administration and MAR signing;
- progress-note signing and immutability;
- participant, portal, timeline, incident, complaint, emergency, workforce and governance modules;
- private document storage and the then-current 44-document controlled library;
- staff-management and Xero Edge Function privilege boundaries;
- time and attendance;
- SIL operational records;
- service-worker caching and browser dependency versions;
- audit and retention controls;
- known pre-production test data;
- execution order and compatibility of every Florence database migration;
- representative RLS behaviour for worker, family and supervisor sessions.

## Critical findings corrected in this release

### 1. SIL operational records were stored in browser localStorage

The SIL workspace previously stored house, participant, handover, competency and governance records in the browser. Those records were not suitable production evidence because they were device-local, could be changed outside Florence’s database audit trail and were not protected by Supabase row-level security.

**Correction:** SIL records now use the audited `sil_records` and `sil_provider_profiles` tables. Access requires MFA. Supervisors manage the full register; workers may create only the participant-linked visitor, participant-choice and handover records permitted for their role. Browser hard deletion has been replaced by supervisor archival with retained audit history.

### 2. Family and participant portal accounts could reach clinical modules

The interface previously hid only some staff modules, while the database participant-access helper also allowed linked family and participant accounts to retrieve raw clinical tables.

**Correction:** portal accounts are now portal-only in the interface and the final database policies. They can access their linked participant identity and secure portal conversations, but not raw medication profiles, MAR, progress notes, clinical timeline, incidents, funding, staff compliance files or the worker document library.

### 3. Clock-in and clock-out trusted the worker’s browser time

The earlier time clock inserted and updated timestamps supplied by the browser. A modified client could therefore submit altered clock times.

**Correction:** workers and supervisors now call MFA-protected `clock_in_timesheet` and `clock_out_timesheet` database functions. The database supplies the timestamps, enforces one open timesheet per worker, validates roster-shift linkage and prevents direct worker inserts or clock-field updates.

### 4. Known pre-production test records remained in the live database

The fake participant **Mary Jane** and fake medication **Sifrol** are database records rather than hardcoded application content.

**Correction:** `florence-final-readiness-upgrade.sql` performs a narrowly scoped transactional cleanup. It removes dependent test records and then verifies that neither name remains. The migration stops and rolls back instead of guessing if it detects duplicate matching names, an unexpected Sifrol association, a linked portal account or participant-scoped private documents.

The cleanup was exercised in an isolated PostgreSQL 16 database containing Mary Jane, Sifrol and dependent MAR, progress-note, timeline, incident, complaint, timesheet, travel and invoice records. The target test records were removed, while a separate participant and medication were retained.

### 5. Legacy SIL optional-field flags were not interpreted correctly

Some SIL schema fields used the earlier four-item optional-field format. The renderer treated those fields as required.

**Correction:** the renderer now supports the legacy optional marker correctly while still requiring participant or worker selection where the database record must be linked.

### 6. Browser dependency and cache versions were floating or stale

**Correction:** the browser Supabase client is pinned to version `2.106.2`, and the app, operations, SIL and service-worker cache versions have been advanced together.

## Automated checks completed

The release workflow completed all of the following on the reviewed branch:

### Static and browser checks

- Node syntax checks for `app.js`, `operations.js`, `staff-management.js`, `sil.js` and `service-worker.js`;
- duplicate HTML ID checks;
- application/service-worker version consistency checks;
- exact browser Supabase client pin checks;
- no browser service-role key or service-role credential checks;
- no Google Drive runtime-link checks;
- 44 controlled-document manifest count (historical; now superseded by 97 unique requirements representing 98 sources);
- no SIL `localStorage.getItem` or `localStorage.setItem` use;
- audited SIL database and archival markers;
- portal-only interface markers;
- server-controlled clock-in and clock-out markers;
- removal of direct worker timesheet insert/update policies;
- MFA, server-side MAR, progress-note, shift-claim and shift-response hardening markers;
- Edge Function origin, MFA and supervisor checks;
- known fake-record cleanup and final verification markers;
- repository whitespace/patch checks.

### Database migration and RLS checks

An ephemeral PostgreSQL 16 database was created and the following were executed in production order:

1. Supabase compatibility test layer;
2. `supabase-schema.sql`;
3. `florence-audit-readiness-upgrade.sql`;
4. `florence-operational-controls-upgrade.sql`;
5. `florence-production-hardening-upgrade.sql`;
6. `florence-controlled-library-access-upgrade.sql`;
7. `florence-controlled-library-upload-hotfix.sql`;
8. representative pre-final data seed;
9. `florence-final-readiness-upgrade.sql`.

The database test then confirmed:

- the final migration returned `PASS_FOR_LIVE_UAT`;
- Mary Jane remaining count was zero;
- Sifrol remaining count was zero;
- dependent fake records were removed;
- non-target participant and medication records remained;
- an assigned worker saw the assigned participant and medication;
- database-timestamped administration clock-in and clock-out completed successfully;
- direct worker timesheet, MAR and progress-note inserts were denied;
- a worker could create a permitted participant-choice SIL record but not a supervisor-only SIL record;
- a family portal account saw the linked participant and portal messages but no raw medication, MAR, progress-note, timeline, incident, roster or SIL staff records;
- the supervisor retained organisation oversight.

**Automated result:** `114 static checks passed` and the full database migration/RLS smoke test passed — **PASS FOR LIVE UAT**.

## Final live migration result required

After deployment, `florence-final-readiness-upgrade.sql` must finish successfully in the live Supabase project and return:

- `florence_final_readiness_migration = PASS_FOR_LIVE_UAT`;
- `mary_jane_remaining = 0`;
- `sifrol_remaining = 0`;
- the expected private controlled-document count;
- no unexplained duplicate open timesheets.

A red SQL error is a failed deployment condition. The query must not be repeatedly rerun without reviewing the complete error.

## Live tests still required before real participant information

The following tests require actual authenticated accounts and the live Supabase project and therefore cannot be established by static or isolated-database source review alone.

### Supervisor account

- MFA sign-in and 30-minute idle sign-out;
- participant creation and editing;
- medication creation, ceasing and hold handling;
- roster creation, publication and cancellation;
- staff invitation, role change, deactivation and reactivation;
- at least one active supervisor cannot be removed;
- participant-access assignment and revocation;
- controlled private PDF opening and access-event audit entry;
- incident and complaint review/closure;
- timesheet approval and pay-period export;
- encrypted archive export;
- Xero connect/disconnect and invoice sync, if Xero will be used.

### Assigned support worker account

- sees only the assigned participant or a participant within an active roster window;
- can accept/decline an assigned shift and claim an open shift once;
- cannot alter shift dates, participant, instructions or assigned worker through the API;
- can create a signing PIN;
- can record MAR only with the correct PIN;
- non-administered medication requires a reason;
- can sign a progress note only with declaration and correct PIN;
- direct MAR and progress-note REST inserts are denied;
- can clock in/out with database timestamps;
- can create only permitted participant-linked SIL records;
- sees only the approved worker controlled-document subset.

### Unassigned support worker account

- cannot retrieve the participant through People, medications, MAR, progress notes, timeline, incidents, goals, funding, documents, portal messages or SIL records;
- access disappears after an assignment is revoked and outside any roster window.

### Family representative account

- lands directly in the secure portal after MFA;
- sees only the linked participant’s portal conversations;
- cannot open staff, medication, MAR, progress-note, timeline, incident, funding, roster or controlled-worker-library modules;
- changing a participant or record ID in a request does not reveal another participant.

### Participant portal account

- same portal-only and cross-participant denial tests as the family role;
- information and communication are understandable and appropriate for the participant.

### Recovery and operational controls

- current database backup exists;
- private Storage backup exists;
- a restore has been tested in a separate environment and recorded;
- audit entries exist for sign-in, MFA, sensitive views, downloads, exports, account administration and database changes;
- incidents and complaints create retention-register entries;
- legal hold and minimum-retention disposal blocks work;
- emergency plans and worker training evidence are current;
- staff screening, qualifications, induction, competency and supervision evidence are complete.

## Readiness decision

### Approved now

- merge and deployment of the reviewed code;
- running the final migration;
- controlled live UAT using fake or specially created test information;
- correction of any issue found during that UAT.

### Not approved yet

- entering or migrating real participant health, medication, behavioural, support-plan or identity information;
- relying on Florence as the sole operational record before backup/restore evidence exists;
- representing Florence as independently penetration tested, privacy certified, NDIS audited or legally approved.

## Conditions for real-data go-live

Florence may move from **PASS FOR LIVE UAT** to **approved for controlled real use** only after all of the following are recorded:

1. final migration output is successful and Mary Jane/Sifrol counts are zero;
2. the full supervisor, assigned-worker, unassigned-worker, family and participant test matrix passes;
3. the current staff-management Edge Function supports invitations and all four roles without an origin/CORS error;
4. a database and private-storage backup is current and a restore test has succeeded;
5. an independent privacy/cybersecurity review has been completed and all high or critical findings are resolved;
6. I-Care Connect’s worker screening, induction, competency, emergency, incident, complaint, consent and participant-specific evidence is current;
7. VJ or another authorised Key Management Personnel signs the production go-live decision.

## Audit limitation

This document is an internal technical and operational readiness assessment. It is not an NDIS registration audit opinion, legal advice, an external penetration-test report or an independent privacy certification.
