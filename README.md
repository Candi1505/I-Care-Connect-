# Florence Live Trial

Florence uses Supabase authentication and the clean **Florence Database V1** schema.

## Important database warning

`supabase-schema.sql` is a **destructive initial setup/reset script**.

It drops and recreates Florence application tables. Do not run it again after entering real participant, roster, medication, note, portal, compliance or invoice data unless you intentionally want to reset Florence.

Supabase Authentication users are not deleted by the script, but their Florence profile rows must be recreated after a reset.

## Roles

- Candice Long — `supervisor`
- Victoria “VJ” Kussrow — `supervisor`
- Amanda Buchanan — `staff`
- Nita Caslick — `staff`
- Authorised representatives — `family`
- Participants — `client`

Family and client profiles must include the participant UUID in `participant_id`.

## Repository files

- `index.html`
- `styles.css`
- `app.js`
- `config.js`
- `supabase-schema.sql`
- `README.md`

## Current live-trial features

- secure Supabase email/password sign-in;
- supervisor, staff, family and client workspaces;
- participant creation and profiles;
- supervisor-controlled rostering;
- staff shift acceptance and decline;
- medication profiles and six-digit medication PIN verification;
- MAR history;
- progress notes;
- client timeline;
- family/client portal messages and requests;
- private document storage;
- compliance evidence register;
- supervisor-only invoicing;
- Xero connection placeholder.

## Security

Only the public Supabase publishable key belongs in `config.js`.

Never place a Supabase service-role secret in GitHub or browser code.
