# Florence Xero connection setup

Florence is prepared for Xero through a Supabase Edge Function. Do not place a Xero client secret in `config.js` or any public GitHub file.

## What VJ needs to do

1. Sign in at [Xero Developer](https://developer.xero.com/app/manage).
2. Create an OAuth 2.0 **Web app** named **Florence – I-Care Connect**.
3. Add this redirect URI exactly:
   `https://pbbsaquwumxyrhqhnobv.supabase.co/functions/v1/xero-connect?action=callback`
4. In the Supabase SQL Editor, run `xero-connection-schema.sql`.
5. Deploy the function:
   `supabase functions deploy xero-connect --no-verify-jwt`
   The callback must be reachable without a user JWT; the function validates the one-time OAuth state itself.
6. Add these Supabase Edge Function secrets:
   - `XERO_CLIENT_ID` — from VJ's Xero app
   - `XERO_CLIENT_SECRET` — from VJ's Xero app
   - `XERO_REDIRECT_URI` — the exact URI above
   - `FLORENCE_APP_URL` — `https://candi1505.github.io/I-Care-Connect-/`
   - `XERO_SALES_ACCOUNT_CODE` — the Xero revenue account code VJ/accountant wants invoices posted to
7. In Florence, open **Invoicing & Xero** and tap **Connect Xero**.
8. VJ signs into Xero and selects the I-Care Connect organisation.

## Prepared functionality

- Secure OAuth 2.0 authorisation-code connection
- Refresh-token rotation
- Connected-organisation status
- Disconnect control
- Draft Florence invoice transfer to Xero
- Xero invoice ID written back to Florence

Before real billing, VJ or the accountant should confirm the sales account code, tax treatment and invoice wording.
