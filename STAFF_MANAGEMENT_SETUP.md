# Florence staff management activation

This release lets supervisors invite and manage workers inside Florence. Workers privately set their own password and six-digit signing PIN.

## Activate once

1. Open the I-Care Connect Supabase project.
2. Open **SQL Editor**, create a new query and run `florence-staff-management-upgrade.sql`.
3. Open **Edge Functions** and deploy the function folder `supabase/functions/staff-management`.
4. Add the Edge Function secret `FLORENCE_APP_URL` using Florence’s live website address.
5. Sign out of Florence, sign back in and refresh.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are supplied automatically to deployed Supabase Edge Functions. Never place the service-role key in `config.js` or browser code.

## Verify safely

1. Sign in as a supervisor and open **Staff management**.
2. Invite a test worker using an email address you control.
3. Confirm the invitation arrives and the worker can set a password.
4. Sign in as the test worker and open **My account & PIN**.
5. Create a six-digit PIN and confirm it signs a fake progress note.
6. Deactivate the test worker and confirm access is blocked.
7. Reactivate the worker and confirm access returns.

Use fake participant and medication information during testing.
