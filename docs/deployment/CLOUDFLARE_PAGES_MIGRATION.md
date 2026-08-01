# Move Florence from GitHub Pages to Cloudflare Pages

**Purpose:** Establish a more appropriate production delivery host for Florence while keeping GitHub as the source-code repository and deployment history.

Cloudflare Pages can host Florence's static files from the existing repository. The participant database and private document origin remain in the Sydney Supabase project.

## Before starting

- Use an I-Care Connect-controlled Cloudflare account.
- Turn on MFA for the Cloudflare account.
- Add VJ and a second trusted administrator using individual accounts where the plan permits.
- Do not share one Cloudflare login.
- Do not enter Supabase service-role, database or Xero secrets into Pages environment variables; Florence's browser requires only the existing publishable Supabase configuration.

## 1. Create the Pages project

1. Sign in to Cloudflare.
2. Open **Workers & Pages**.
3. Select **Create application -> Pages -> Connect to Git**.
4. Authorise access only to the required repository where possible.
5. Select `Candi1505/I-Care-Connect-`.
6. Production branch: `main`.
7. Framework preset: **None**.
8. Build command: leave blank.
9. Build output directory: `/` or the repository root option presented by Cloudflare.
10. Deploy.

## 2. Confirm the deployment

- Open the Cloudflare Pages address.
- Confirm Florence login loads.
- Confirm `index.html`, `sil.html`, manifest and service worker load.
- Confirm no browser console error.
- Confirm the `_headers` file has applied:
  - Content-Security-Policy;
  - X-Frame-Options;
  - X-Content-Type-Options;
  - Referrer-Policy;
  - Permissions-Policy;
  - Strict-Transport-Security;
  - X-Robots-Tag.
- Confirm `index.html`, `sil.html` and `config.js` return `Cache-Control: no-store`.

Record the initial Pages address:

`https://________________________________________________________`

## 3. Add a custom domain

A business-controlled custom domain is strongly preferred.

1. In the Pages project, open **Custom domains**.
2. Add the Florence subdomain, for example:
   - `florence.icareconnect.com.au`, or
   - another approved I-Care Connect domain.
3. Complete the DNS instructions.
4. Wait for the SSL certificate to become active.
5. Confirm the production URL uses HTTPS and does not show a certificate warning.

Approved production URL:

`https://________________________________________________________`

## 4. Update Supabase authentication URLs

In the Supabase project `pbbsaquwumxyrhqhnobv`:

1. Open **Authentication -> URL Configuration**.
2. Set **Site URL** to the approved production URL.
3. Add redirect URLs required for:
   - invitations;
   - password resets;
   - Xero callback flow if applicable.
4. Include the precise path/trailing-slash variants Florence uses.
5. Keep the GitHub Pages URL temporarily during testing only.
6. Remove the GitHub Pages URL after successful cutover unless it remains an explicitly approved test environment.

## 5. Update Edge Function secrets

Open **Edge Function Secrets** and update:

```text
FLORENCE_APP_URL
https://your-approved-florence-host/
```

```text
FLORENCE_ALLOWED_ORIGINS
https://your-approved-florence-host
```

Use the origin only for `FLORENCE_ALLOWED_ORIGINS`: no path or trailing page name.

Keep the GitHub origin only while transition testing is explicitly required. Remove it afterwards.

## 6. Test staff-management

From the new host, using a supervisor MFA session:

- load People & access management;
- confirm the directory loads without CORS/origin errors;
- invite a fake test account;
- change its role;
- deactivate it;
- confirm an AAL1 or unauthorised-origin request is rejected.

Do not invite genuine participant/family accounts until the full live UAT checklist is complete.

## 7. Test Xero

Where Xero will be used:

- confirm status loads;
- confirm the redirect URL registered in Xero matches the new production URL/function callback arrangement;
- connect only the approved I-Care Connect Xero organisation;
- send a fake draft invoice;
- confirm no clinical/support information is included;
- disconnect the test connection if it is not the final account.

## 8. Confirm Sydney Edge Function execution

Florence now asks Supabase to invoke Edge Functions in `ap-southeast-2`.

- invoke `staff-management` from the new host;
- inspect the Edge Function logs or response metadata;
- record the execution region;
- repeat for `xero-connect` if used.

Evidence reference:

`_______________________________________________________________`

## 9. Security review after cutover

- [ ] Supabase Security Advisor has no unresolved high/critical finding.
- [ ] SSL Enforcement is enabled for direct Postgres connections.
- [ ] Supabase team MFA is required.
- [ ] GitHub administrator 2FA is confirmed.
- [ ] Cloudflare administrator MFA is confirmed.
- [ ] CodeQL succeeds or alerts are triaged.
- [ ] OWASP ZAP baseline runs against the new production URL.
- [ ] Live role UAT passes using fake information.
- [ ] Database and Storage backup exists before enabling real use.

## 10. GitHub Pages after cutover

Preferred options:

1. disable GitHub Pages; or
2. replace it with a simple non-login page pointing authorised users to the approved production URL; or
3. retain it only as a clearly labelled fake-data test environment with separate configuration and no real participant information.

Do not operate two indistinguishable production Florence login addresses.

## 11. Rollback

If the Cloudflare deployment fails before real data is used:

- revert DNS/custom-domain routing;
- keep the Supabase URLs/origins matched to the active approved host;
- fix the Pages deployment through a pull request;
- repeat security-header and live role testing.

If a failure occurs after real use begins:

- activate the Florence downtime process;
- do not move back to an unapproved login host merely for convenience;
- restore a known-good Pages deployment;
- investigate and document the incident/change.

## 12. Cutover approval

- [ ] New production URL tested.
- [ ] Security headers verified.
- [ ] Supabase URLs updated.
- [ ] Edge origins updated.
- [ ] invitations/password reset tested.
- [ ] Sydney function region verified.
- [ ] GitHub Pages disabled or clearly separated.
- [ ] UAT complete.

**Completed by:** ______________________________  Date: ____ / ____ / ______  
**Approved by VJ:** ____________________________  Date: ____ / ____ / ______
