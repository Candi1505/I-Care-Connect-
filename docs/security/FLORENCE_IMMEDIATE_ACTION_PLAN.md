# Florence Immediate Action Plan

**Owner:** Candice Long  
**Approver:** Victoria Kussrow  
**Status:** Working checklist  
**Last updated:** 1 August 2026

This is the practical order of work before I-Care Connect enters genuine participant health, medication, identity or support information into Florence.

An independent paid penetration test is **deferred because it is not currently affordable**. It must not be recorded as completed. The actions below are the no-cost and low-cost compensating controls required for a careful, staged go-live.

## A. Already completed

- [x] Supabase primary project region confirmed as Sydney, Australia (`ap-southeast-2`).
- [x] Invite-only Florence accounts.
- [x] Individual supervisor, support-worker, family and participant roles.
- [x] Mandatory TOTP authenticator MFA for protected use.
- [x] Participant-scoped worker access through assignment or approved roster window.
- [x] Portal-only family and participant accounts.
- [x] Server-verified signing PIN for MAR and progress notes.
- [x] Server-timestamped clock-in and clock-out.
- [x] Private `florence-private` Storage bucket.
- [x] Forty-four controlled PDFs copied into private Supabase Storage.
- [x] Google Drive links removed from Florence's controlled document library.
- [x] Database row-change auditing and selected access/download/export auditing.
- [x] Retention controls for incident and complaint records.
- [x] Internal static application audit.
- [x] Full isolated PostgreSQL migration and RLS role-boundary smoke test.
- [x] Mary Jane and Sifrol demo data removed from the live project.
- [x] Permanent GitHub quality gate.
- [x] Edge Function invocations configured to prefer Sydney.
- [x] Security architecture, risk assessment and incident-response documents drafted.

## B. Mandatory before genuine participant data

### 1. Move Florence off GitHub Pages

**Reason:** GitHub Pages is suitable for static publishing and testing, but it is not the final approved host for a business login handling passwords and sensitive operations.

- [ ] Create a free Cloudflare account controlled by I-Care Connect.
- [ ] Connect the `Candi1505/I-Care-Connect-` repository to Cloudflare Pages.
- [ ] Deploy from the `main` branch.
- [ ] Confirm the `_headers` file is applied.
- [ ] Use a business-controlled custom domain when available.
- [ ] Keep GitHub Pages only as a temporary test/fallback page, or disable it after cutover.
- [ ] Record the final production URL.

**Evidence:** Cloudflare deployment screenshot, final URL and response-header check.

### 2. Update Supabase URLs and function origins

After the new production host is live:

- [ ] Supabase Authentication -> URL Configuration -> set **Site URL** to the new Florence URL.
- [ ] Add the new password-reset/invitation redirect URL.
- [ ] Keep the GitHub Pages URL temporarily only while transition testing is occurring.
- [ ] Update Edge Function secret `FLORENCE_APP_URL`.
- [ ] Update Edge Function secret `FLORENCE_ALLOWED_ORIGINS`.
- [ ] Test staff-management invitations from the new host.
- [ ] Test Xero status/connect from the new host if Xero will be used.

**Evidence:** screenshots of URL configuration and function secrets with secret values appropriately concealed.

### 3. Confirm platform security settings

- [ ] Supabase Database -> Settings -> enable **SSL Enforcement**.
- [ ] Supabase Security Advisor -> resolve every high or critical finding.
- [ ] Supabase organisation/team -> require MFA for every team member.
- [ ] Confirm every GitHub repository administrator uses 2FA.
- [ ] Add a second trusted Supabase organisation owner for account recovery.
- [ ] Confirm no unknown Supabase, GitHub or Xero users have access.
- [ ] Review Edge Function logs and confirm execution region is Sydney / `ap-southeast-2`.

**Evidence:** dated screenshots and monthly access-review record.

### 4. Establish complete backup and recovery evidence

- [ ] Confirm a current Supabase database backup or restore point.
- [ ] Export every object from `florence-private` to approved encrypted business storage.
- [ ] Store backup credentials/passphrases separately from the files.
- [ ] Create a separate test environment.
- [ ] Restore database and private Storage copies into the test environment.
- [ ] Confirm participants, MAR, notes, incidents, audit logs and private PDFs restore correctly.
- [ ] Record recovery time, issues and corrective actions.
- [ ] Schedule quarterly restore tests.

**Evidence:** completed `FLORENCE_BACKUP_AND_RECOVERY_PROCEDURE.md` test record.

### 5. Complete live role testing using fake information

Use separate real Auth accounts but fake participant information.

- [ ] Supervisor test.
- [ ] Assigned support-worker test.
- [ ] Unassigned support-worker denial test.
- [ ] Family portal test.
- [ ] Participant portal test.
- [ ] Inactive account test.
- [ ] AAL1 / incomplete-MFA denial test.
- [ ] Direct REST abuse-case test where practical.
- [ ] Document every result and correct every high or critical issue.

**Evidence:** signed `FLORENCE_LIVE_UAT_CHECKLIST.md`.

### 6. Prepare participant and worker records

- [ ] Give each participant the updated Florence Privacy and Digital Records Addendum.
- [ ] Obtain and record informed consent before entering information.
- [ ] Record each family/representative portal authorisation and participant link.
- [ ] Have every user sign the Florence User Access and Confidentiality Acknowledgement.
- [ ] Complete worker identity, right-to-work, NDIS screening, required checks and qualification evidence.
- [ ] Complete worker induction and policy acknowledgement.
- [ ] Complete participant-specific briefing before independent support.
- [ ] Complete SIL house induction and competency assessment where applicable.

**Evidence:** participant files and worker files.

### 7. Prepare a Florence downtime pack

- [ ] Current participant emergency contacts.
- [ ] Participant emergency plan.
- [ ] Current medication source document/MAR fallback.
- [ ] Escalation numbers and on-call contacts.
- [ ] Instructions for recording work completed during an outage and entering it after recovery.
- [ ] Paper incident and complaint forms.
- [ ] Printed or offline minimum information stored securely at the service location.
- [ ] Annual downtime/emergency exercise.

**Evidence:** downtime-pack register and emergency test record.

### 8. Review the no-cost security results

- [ ] Review the permanent Florence quality gate.
- [ ] Review CodeQL results.
- [ ] Review the monthly OWASP ZAP passive baseline report.
- [ ] Review Supabase Security Advisor.
- [ ] Review dependency/Dependabot alerts.
- [ ] Enter unresolved findings into the Risk Register or Continuous Improvement Register.
- [ ] Resolve every critical or high finding before go-live.

**Evidence:** screenshots, workflow artifacts and improvement actions.

### 9. Management approval and risk acceptance

- [ ] VJ and Candice review the Security Assurance Pack.
- [ ] Record that an independent security assessment is deferred due cost.
- [ ] Record the controls used to compensate for that gap.
- [ ] Confirm no critical or high issue remains open.
- [ ] Sign the Conditional Go-Live and Residual Risk Acceptance.

**Evidence:** signed `FLORENCE_MANAGEMENT_RISK_ACCEPTANCE.md`.

## C. Safe rollout after mandatory items pass

### Controlled pilot

- [ ] Start with one participant only.
- [ ] Restrict access to VJ, Candice and the minimum necessary trained workers.
- [ ] Keep the approved downtime source information available.
- [ ] Review audit events, errors, MAR exceptions and access daily for the first seven days.
- [ ] Review weekly for the first month.
- [ ] Stop immediately for a participant-access, data-integrity, medication or privacy issue.

### Expansion decision after 30 days

- [ ] Review incidents, near misses, complaints, user feedback and access logs.
- [ ] Confirm monthly Storage backup and one successful restore test.
- [ ] Confirm worker access and training remain current.
- [ ] Confirm no high/critical security issue remains.
- [ ] VJ approves expansion in management meeting minutes.

## D. Ongoing schedule

### Weekly

- [ ] Supabase Security Advisor.
- [ ] Edge Function errors.
- [ ] unusual Auth activity.
- [ ] GitHub security/quality workflow failures.
- [ ] medication exceptions and unresolved incidents.

### Monthly

- [ ] account, role and participant-assignment review.
- [ ] private Storage backup.
- [ ] encrypted Florence archive.
- [ ] ZAP baseline report.
- [ ] audit-event review.
- [ ] policy, credential and training expiry review.

### Quarterly

- [ ] restore test.
- [ ] role-based regression test.
- [ ] cyber/data-breach tabletop exercise.
- [ ] retention and legal-hold review.
- [ ] Security Assurance Pack review.

### After any significant change

- [ ] backup first.
- [ ] pull request and automated quality gate.
- [ ] Security Advisor review.
- [ ] live role regression test with fake information.
- [ ] documented release approval.

## Final decision rule

Florence is not approved for genuine participant information merely because the software opens successfully. Real-data use begins only when every mandatory item in section B is complete, evidence is retained and VJ has signed the conditional go-live decision.
