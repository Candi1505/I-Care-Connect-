# Florence 10.0 — Audit Ready Foundation

This build adds the major operational areas requested for I-Care Connect.

## Included and functional in the browser

- Supervisor and support-worker role views
- Supervisor-created draft or published shifts
- Published shifts assigned to an intended staff member
- Staff acceptance and decline workflow
- Detailed participant profiles
- PDF care-plan upload on each participant profile
- Compliance Centre for staff, participants and organisation evidence
- PDF, DOC, DOCX, XLS, XLSX, JPG, PNG, HEIC and TXT uploads
- Expiry and review-date alerts
- No restrictive-practices module
- Medication profiles and MAR
- Six-digit medication PIN confirmation after administration
- Easy progress-note form with useful note categories
- Invoice creation
- Xero configuration and export-ready invoice workflow
- JSON backup export

## Demo access

App PIN: `123456`

Medication PIN: `654321`

Choose Supervisor/Admin to create and publish shifts. Choose Support Worker to test staff acceptance.

## Files to upload to GitHub

Upload every file from this folder to the root of:

`Candi1505/I-Care-Connect-`

The required files are:

- index.html
- styles.css
- app.js
- config.js
- supabase-schema.sql
- README.md

## Important production limits

This build is a functional front-end foundation. It uses local browser storage so the screens and workflows can be tested immediately.

Do not use it for real participant, medication or compliance records until:

1. Supabase authentication is connected.
2. Organisation-scoped Row Level Security policies are installed and tested.
3. Compliance and care-plan files are placed in private Supabase Storage buckets.
4. Six-digit medication PINs are securely hashed and verified server-side.
5. Audit logging, backups and access reviews are completed.
6. Xero OAuth is handled through a secure backend.

## Xero

A real Xero connection cannot safely run only in public browser JavaScript. Register an OAuth 2.0 app in Xero, then add the public client configuration in `config.js` and implement a protected backend callback/token store.

Until that is connected, Florence can create invoice records and export each invoice as CSV.
