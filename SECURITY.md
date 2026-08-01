# Florence Security Policy

Florence is an invite-only internal application used by I-Care Connect. Security and privacy reports are taken seriously.

## Supported version

Only the current `main` branch and the approved production deployment are supported. Older downloaded copies, test builds and abandoned branches must not be used with participant information.

## Report a vulnerability privately

Do **not** open a public GitHub issue containing:

- participant or worker information;
- screenshots of Florence records;
- passwords, MFA setup details, signing PINs or reset links;
- Supabase, GitHub, Cloudflare, email or Xero secrets;
- instructions that would expose live records;
- private document links.

Report the concern directly to authorised I-Care Connect Key Management Personnel using the current internal security/incident contact method.

Include, where safe:

- what happened;
- the Florence page or feature involved;
- date/time and device/browser;
- whether any participant information was visible;
- exact error text with secrets and personal information removed;
- steps required to reproduce using fake information only.

## Response expectations

I-Care Connect will:

1. acknowledge and triage the report;
2. protect participant safety and contain access where required;
3. preserve evidence and assess privacy, NDIS, incident and notification obligations;
4. correct and test the issue through the repository quality gate;
5. record improvement actions;
6. communicate appropriately with affected people.

## Security controls

The current application uses:

- individual invite-only accounts;
- TOTP authenticator MFA;
- participant-scoped Row Level Security;
- supervisor-protected Edge Functions;
- server-verified signing PINs;
- private Storage and expiring signed document links;
- audit and retention records;
- server-controlled clock timestamps;
- automated static and PostgreSQL/RLS tests;
- CodeQL and OWASP ZAP baseline workflows;
- a documented backup, recovery and data-breach process.

These controls do not constitute an independent penetration-test or certification.

## Safe testing

- Use fake information only.
- Do not attempt to access another person's account or records.
- Do not run destructive or high-volume scanning against the live service.
- Do not download or retain information encountered accidentally.
- Stop testing and report immediately if personal information becomes visible.
