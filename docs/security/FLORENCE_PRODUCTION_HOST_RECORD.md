# Florence Production Host Record

**Recorded:** 1 August 2026  
**Organisation:** I-Care Connect PTY LTD  
**Application:** Florence  

## Approved Cloudflare host

- **Cloudflare Worker:** `i-care-connect`
- **Current Workers URL:** `https://i-care-connect.candi1505.workers.dev/`
- **Git repository:** `Candi1505/I-Care-Connect-`
- **Production branch:** `main`
- **Deployment model:** Cloudflare Workers Static Assets through Wrangler
- **Deploy command:** `npx wrangler deploy`
- **Build command:** None
- **Repository root:** `/`

## Backend and processing region

- **Supabase project:** I-Care Connect Hub
- **Project reference:** `pbbsaquwumxyrhqhnobv`
- **Primary project region:** `ap-southeast-2` — Oceania (Sydney)
- **Browser Edge Function invocation region:** `ap-southeast-2`

## Verification completed

- Cloudflare successfully published the allowlisted Florence runtime assets.
- The HTTPS Workers URL displays the Florence sign-in page.
- Florence's internal SQL migrations, tests, security documents and repository configuration are excluded from public static assets.
- The Florence production quality gate and CodeQL scan passed for the Cloudflare deployment configuration.

## Cutover still required

Before this URL is approved for real participant information:

1. Set the Supabase Authentication Site URL to the Workers URL.
2. Add the exact Workers URL to the Supabase Auth redirect allowlist.
3. Set `FLORENCE_APP_URL` to the Workers URL.
4. Set `FLORENCE_ALLOWED_ORIGINS` to the Workers origin without a trailing slash.
5. Test supervisor sign-in, password reset, account invitation and People & access management.
6. Test assigned worker, unassigned worker, family and participant portal access using fake information.
7. Complete database and private-Storage backup and restore evidence.
8. Remove or clearly separate the old GitHub Pages login after successful cutover.
9. Record management approval before a controlled one-participant pilot.

## Status

**Current status:** Cloudflare host operational; Supabase authentication/origin cutover and live role UAT pending.  
**Real participant data:** Not approved until the remaining cutover and go-live controls are completed and signed.
