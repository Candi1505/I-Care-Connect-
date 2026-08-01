# Florence — Cloudflare Workers Static Deployment

**Worker name:** `i-care-connect`  
**Production branch:** `main`  
**Hosting model:** Cloudflare Workers Static Assets  
**Status:** configuration-controlled deployment from GitHub

## Why the first green build did not show Florence

The initial Cloudflare project ran the default deploy command `npx wrangler deploy`, but the repository did not yet contain a Wrangler static-assets configuration. A green build therefore confirmed that Cloudflare completed the configured command; it did not prove that the Florence web files had been selected and published.

Florence now includes:

- `wrangler.jsonc`, which identifies the existing `i-care-connect` Worker and serves static assets;
- `.assetsignore`, which denies every repository file by default and explicitly permits only Florence's runtime web assets;
- the existing `_headers` file, which Cloudflare Workers parses to apply security headers;
- the existing `robots.txt`, which prevents search indexing.

This allowlist prevents SQL migrations, internal audit packs, tests, GitHub configuration and governance documents from becoming publicly downloadable web assets.

## Cloudflare build settings

Use these settings under **Workers & Pages → i-care-connect → Settings → Build**:

| Setting | Required value |
|---|---|
| Git repository | `Candi1505/I-Care-Connect-` |
| Production branch | `main` |
| Build command | Leave blank / `None` |
| Deploy command | `npx wrangler deploy` |
| Root directory | `/` |

The Worker name in Cloudflare must remain exactly `i-care-connect`, matching `wrangler.jsonc`.

## Deployment process

1. Merge an approved pull request into `main`.
2. Cloudflare Workers Builds detects the new commit.
3. Wrangler reads `wrangler.jsonc`.
4. Wrangler reads `.assetsignore` and uploads only the approved Florence runtime files.
5. Cloudflare promotes the successful build to the active deployment.
6. The `workers.dev` preview/production URL is tested before changing any Supabase URL or origin settings.

## Runtime files permitted for publication

- `index.html`
- `styles.css`
- `config.js`
- `app.js`
- `operations.js`
- `staff-management.js`
- `sil.html`
- `sil.css`
- `sil-rpc-audit-fix.js`
- `sil.js`
- `service-worker.js`
- `manifest.webmanifest`
- `florence-icon.svg`
- `_headers`
- `robots.txt`

`config.js` contains only the public Supabase publishable key and non-secret browser configuration. Supabase service-role keys and other privileged secrets remain in Supabase Edge Function secrets and are not published.

## First-deployment checks

After Cloudflare shows a successful new build:

1. Open **Overview** and select the `workers.dev` URL.
2. Confirm the Florence sign-in page appears.
3. Confirm the browser shows HTTPS.
4. Open `/sil.html` and confirm unauthenticated users are redirected to Florence sign-in.
5. Confirm a random SQL filename returns the app/404 response rather than a downloadable SQL file.
6. Confirm the response includes the security headers from `_headers`.
7. Keep GitHub Pages available until authenticated Cloudflare testing is complete.

## Supabase cutover — do not do this before the site works

After the Cloudflare URL has passed the unauthenticated checks, update:

- Supabase Authentication Site URL and redirect URLs;
- Edge Function secret `FLORENCE_APP_URL`;
- Edge Function secret `FLORENCE_ALLOWED_ORIGINS`;
- any Xero redirect URL, if Xero will be used.

Then redeploy `staff-management` and `xero-connect` only if their code or secret-loading behaviour requires it, and complete the full role-based live UAT checklist before real participant data is entered.
