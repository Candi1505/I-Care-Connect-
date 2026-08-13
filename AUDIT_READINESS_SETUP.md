# Florence audit-readiness release

This release adds software controls that support I-Care Connect's audit evidence. It does not replace organisational policies, worker training, management review or independent audit advice.

> Release hold: do not run SQL, merge or deploy the current audit-library work until a recoverable production backup and both required Edge Functions have been confirmed. The complete Core + Module 5A process is in `FLORENCE_CORE_MODULE_5A_AUDIT_CHECKLIST.md`.

## Activate the release

1. Open the I-Care Connect Supabase project.
2. Open **SQL Editor** and create a new query.
3. Copy and run `florence-audit-readiness-upgrade.sql`.
4. Copy and run `florence-operational-controls-upgrade.sql`.
5. After the backup and Edge Function hold is cleared, run `florence-complete-audit-library-upgrade.sql`.
6. Run `florence-portal-complaints-upgrade.sql` before deploying the Complaints tab.
7. Redeploy `supabase/functions/staff-management` so family and participant invitations are available.
8. Sign out of Florence and sign in again.
9. Open each new workspace and complete the verification checklist below, including the full in-app audit evidence matrix.

The migration is non-destructive and does not delete existing Florence records.

## Verification checklist

### Roles and access
- Supervisor can see Safety, Workforce, Outcomes and Governance.
- Support worker can report incidents and medication errors, clock in/out, submit leave, availability and expenses, and record goals.
- Participant/family accounts cannot see internal safety, workforce, governance or finance areas.
- Participant and family portals can submit a complaint from the dedicated **Complaints** tab and see only their own private complaint conversation.
- Supervisor can invite a family representative or participant and link the account to the correct participant.
- Support workers can open the controlled position descriptions in the SIL library.

### Operational governance
- Set the first day of a known fortnightly pay period in Roster.
- Confirm the supervisor roster displays 14 days.
- Record a no-conflict declaration from a worker account.
- Record and review a disclosed conflict.
- Save management and staff meeting minutes.
- Record a delegation with authority limits and effective dates.
- Confirm progress notes and other historical records remain visible after changing months.

### Incident and complaint management
- Submit a test incident and confirm a supervisor notification appears.
- Close it with a review and corrective action.
- Submit a portal complaint and confirm it appears in the complaints register.
- Confirm every active supervisor receives the new-complaint notification.
- Reply as a supervisor, move the complaint through **Acknowledged**, **In review** and **Resolved**, and confirm the complainant can see each reply.
- Reply again from the complainant account after resolution and confirm Florence requests further review.

### Medication
- Confirm allergies remain visible in participant records.
- Add PRN indication and maximum dose to a test medication.
- Add hold/ceased dates.
- Record a medication error.
- Record a Schedule 8 stock transaction with a different staff member as witness.
- Confirm MAR PIN signing still works.

### Workforce
- Clock in and clock out.
- Approve the submitted timesheet as supervisor.
- Export approved timesheets to CSV.
- Submit availability, leave and travel/expense entries.

### Roster
- Create recurring shifts.
- Confirm an overlapping assigned shift is rejected.
- Publish an open shift and claim it from a worker account.
- Cancel a test shift and record a reason.
- Confirm handover information appears on the shift card.

### Governance and security
- Create an emergency and continuity plan for each participant.
- Enter all staff credentials and expiry dates.
- Enable supervisor MFA and sign in again to verify the challenge.
- Confirm audit activity records changes.
- Confirm Florence signs out after 30 minutes without activity.
- Export a Florence backup and store it securely.
- Test import only in a safe test organisation before using it for disaster recovery.

### Funding and finance
- Enter current participant plan dates and funding information.
- Enter NDIS support items only after checking the applicable pricing arrangements.
- Complete the separate `XERO_SETUP.md` process.
- Send a test draft invoice and have VJ/accountant verify the account code, tax treatment and wording.

## Still requires organisational action

- Maintain current policies and procedures.
- Train workers in incident, complaint, medication, emergency and privacy processes.
- Review alerts and registers routinely.
- Test emergency and disaster plans.
- Complete internal audits and corrective actions.
- Confirm reportable incidents directly with the NDIS Commission when required.
- Obtain auditor or compliance adviser confirmation that configuration matches I-Care Connect's registration groups and delivered supports.
