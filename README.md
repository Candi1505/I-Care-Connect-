# Florence — reviewed production-hardening package

Florence is I-Care Connect’s Supabase-backed support delivery, SIL operations and compliance application.

This package is a **reviewed hardening release**, not a replacement database build. Follow [`PRODUCTION_SECURITY_SETUP.md`](PRODUCTION_SECURITY_SETUP.md) before entering real participant information.

## Critical database warning

`supabase-schema.sql` in the main Florence repository is a **destructive initial setup/reset script**. It drops and recreates Florence application tables. Do not run it again after entering real participant, roster, medication, note, portal, compliance, invoice or governance data unless an intentional full reset has been approved and backed up.

The file in this package, `florence-production-hardening-upgrade.sql`, is additive and is designed to run after the audit-readiness and operational-control upgrades.

## Files in this package

- `index.html` — updated Florence interface;
- `styles.css` — application styling;
- `app.js` — MFA-gated application, assignment-scoped data loading and controlled shift/MAR/note workflows;
- `operations.js` — audit-readiness and operational modules;
- `staff-management.js` — supervisor account and participant-access management;
- `service-worker.js` — refreshed offline shell cache;
- `florence-production-hardening-upgrade.sql` — non-destructive database and RLS hardening migration;
- `supabase/functions/staff-management/index.ts` — MFA-enforced privileged account administration;
- `supabase/functions/xero-connect/index.ts` — MFA-enforced Xero OAuth and invoice sync;
- `PRODUCTION_SECURITY_SETUP.md` — required deployment and verification sequence;
- `PRODUCTION_HARDENING_REVIEW.md` — review findings, corrections and validation record;
- `SHA256SUMS.txt` — integrity hashes for the reviewed patch files.

The package deliberately does **not** include `config.js` or the destructive base schema. Keep the live repository’s existing public Supabase configuration file. Never place a Supabase service-role secret in GitHub or browser code.

## Roles

- Candice Long — `supervisor`;
- Victoria “VJ” Kussrow — `supervisor`;
- Amanda Buchanan — `staff`;
- Nita Caslick — `staff`;
- authorised representatives — `family`;
- participants — `client`.

Family and client profiles must include the linked participant UUID in `participant_id`.

## Hardening included

- mandatory authenticator-app MFA for sensitive Florence tables;
- MFA checks inside privileged database and Edge Function pathways;
- explicit and roster-window participant access for support workers;
- server-controlled open-shift claiming and accept/decline;
- PIN-signed, server-validated MAR and progress notes;
- immutable browser pathway for signed progress notes;
- assignment-scoped medications, MAR, notes, timeline, incidents, documents, goals, funding and portal records;
- private document policies for metadata and storage objects;
- access, download, encrypted export, sign-in and account-administration audit events;
- retained participant-access history;
- decision-controlled incident and complaint retention register;
- restricted Edge Function origins;
- supervisor-only AES-GCM encrypted organisation archives; browser-based clinical restore is disabled because the archive excludes private document bytes and is not a complete disaster-recovery backup;
- secure supervisor-only Xero operations when the Xero integration is configured.

## Validation completed on this package

- JavaScript syntax checks passed for `app.js`, `operations.js`, `staff-management.js` and `service-worker.js`;
- TypeScript transpilation checks passed for both Edge Functions;
- HTML and service-worker asset versions match;
- no service-role secret value or live Supabase secret is included;
- the family/client portal navigation crash in the uploaded patch was corrected;
- direct unsigned MAR insertion code was removed;
- direct worker roster updates were replaced by controlled RPC calls;
- the SQL migration was revised to fail as one transaction when prerequisites are missing.

A live Supabase test, access-control test matrix, backup restore test and independent privacy/cybersecurity review are still required before production participant data is entered.
