# Florence Security Assurance Pack

**Organisation:** I-Care Connect PTY LTD  
**Application:** Florence  
**Document owner:** Candice Long  
**Approver:** Victoria Kussrow  
**Version:** 1.0  
**Effective date:** 1 August 2026  
**Review date:** 1 November 2026, and after any significant application or service change  
**Classification:** Confidential - internal governance and audit evidence

## 1. Purpose and management position

This pack documents the architecture, information flows, security controls, responsibilities, known risks and operating procedures for Florence. It supports I-Care Connect's privacy, information-management, risk-management, incident-management, human-resources, emergency-management and continuous-improvement systems.

Florence has undergone internal code review, static security checks and isolated PostgreSQL migration and row-level-security testing. It has not undergone an independent penetration test or external cybersecurity certification.

I-Care Connect has decided that an independent paid cybersecurity assessment is currently unaffordable. The independent review is therefore **deferred**, not represented as completed. This pack records compensating controls, a staged go-live approach and the residual risk that Key Management Personnel must review and accept before real participant information is entered.

Florence must not be described as independently penetration tested, ISO 27001 certified, privacy certified or approved by the NDIS Commission.

## 2. Current assurance status

| Control area | Current status | Evidence / next action |
|---|---|---|
| Supabase database region | Confirmed | `ap-southeast-2`, Sydney, Australia |
| Private Storage origin | Confirmed by project architecture | Same Supabase project; private `florence-private` bucket |
| Edge Function processing region | Implemented in application configuration | Invocations default to `ap-southeast-2`; verify in function logs |
| Invite-only accounts | Implemented | Supervisor-only `staff-management` Edge Function |
| Application MFA | Implemented | TOTP MFA/AAL2 required for sensitive use |
| Supabase organisation MFA | To be confirmed | Enable for every Supabase project owner/team member |
| GitHub account 2FA | To be confirmed | Required for every repository administrator |
| Role-based access | Implemented | Supervisor, support worker, family portal, participant portal |
| Participant-scoped worker access | Implemented | Explicit assignment or permitted roster window |
| Portal least privilege | Implemented | Portal accounts restricted from raw clinical/staff records |
| Private controlled documents | Implemented | 44 PDFs in private Storage with short-lived signed links |
| Server-side MAR/progress-note signing | Implemented | MFA plus personal six-digit signing PIN |
| Server-controlled clock-in/out | Implemented | Database timestamps; direct worker writes removed |
| Audit trails | Implemented | Row-change audit events and selected view/download/export events |
| Internal quality gate | Implemented | JavaScript checks, static audit, database migration/RLS smoke test |
| CodeQL scanning | Added in this release | Review alerts after each run |
| OWASP ZAP baseline scan | Added in this release | Monthly passive scan; review report artifact |
| Database backup | Must be evidenced | Confirm current backup/restore point |
| Private Storage backup | Must be completed | Separate export because database backups exclude file bytes |
| Restore test | Not yet evidenced | Test in a separate environment and record outcome |
| Production web host | Must change before real-data go-live | Move from GitHub Pages to Cloudflare Pages or equivalent approved host |
| Independent cybersecurity review | Deferred due budget | Record risk acceptance and reconsider when budget permits |
| Live role-based UAT | Not yet complete | Complete the controlled test matrix using fake information |

## 3. System architecture overview

### 3.1 Components

1. **Florence browser application / PWA**
   - Static HTML, CSS and JavaScript.
   - Source controlled in GitHub.
   - Currently published using GitHub Pages during development and testing.
   - Planned production host: Cloudflare Pages or another approved static host that permits authenticated business applications and security headers.

2. **Supabase Auth**
   - Email-and-password authentication.
   - Invite-only account creation through a supervisor-protected Edge Function.
   - TOTP authenticator MFA required before the application reads or changes protected records.

3. **Supabase PostgreSQL**
   - Project reference: `pbbsaquwumxyrhqhnobv`.
   - Region: `ap-southeast-2` - Sydney, Australia.
   - Stores participant, roster, medication, MAR, progress-note, portal, incident, complaint, workforce, governance, retention and audit records.
   - Row Level Security and database functions enforce organisation, role and participant boundaries.

4. **Supabase Storage**
   - Private bucket: `florence-private`.
   - Stores controlled policy PDFs, participant records and other approved evidence files.
   - Documents are opened with short-lived signed links.
   - Public buckets are not used for participant or worker information.

5. **Supabase Edge Functions**
   - `staff-management`: invitations, activation, role changes and account administration.
   - `xero-connect`: optional Xero authorisation and invoice integration.
   - Service-role credentials exist only in Edge Function secrets.
   - Browser origins, active supervisor role and MFA/AAL2 are checked before privileged activity.
   - Florence invokes functions in Sydney by default.

6. **Xero**
   - Optional external accounting integration.
   - Only approved invoice information should be transferred.
   - Clinical notes, MAR, incident details and participant support documents must not be sent to Xero.

### 3.2 High-level data flow

```text
Worker / supervisor / portal user device
        |
        | HTTPS + MFA
        v
Approved Florence production host
        |
        | HTTPS using Supabase publishable key and user JWT
        v
Supabase Auth + PostgREST + PostgreSQL (Sydney)
        |                    |
        |                    +--> audit events / retention records
        |
        +--> private Storage (Sydney origin; signed links)
        |
        +--> Edge Functions pinned to Sydney
                     |
                     +--> staff administration
                     +--> optional Xero API
```

### 3.3 Trust boundaries

- The public frontend contains no service-role key, database password or Xero secret.
- The Supabase publishable key is public by design and is safe only because RLS, grants and server-side functions enforce access.
- A valid user password alone is insufficient for protected records; the session must reach AAL2 using the enrolled authenticator.
- Privileged service-role activity occurs only inside Edge Functions after origin, user, MFA, role, active-status and organisation checks.
- Signed document URLs expire and do not make the underlying bucket public.

## 4. Data inventory and classification

| Classification | Examples | Handling expectation |
|---|---|---|
| Restricted participant information | diagnoses, health alerts, medication profiles, MAR, progress notes, incidents, complaints, emergency plans, support plans, risk assessments, NDIS number, private documents | MFA; participant-scoped access; no personal-device downloads; private Storage; audited access; approved retention and disposal |
| Restricted worker information | screening evidence, qualifications, identity/right-to-work evidence, performance and supervision records, signing PIN hash | supervisor or subject access only; private Storage; audited changes |
| Confidential business information | rosters, timesheets, invoices, Xero connection metadata, governance minutes, conflicts and delegations | role-limited access; MFA; secure backup; business retention rules |
| Controlled internal information | approved policies, handbooks, position descriptions and blank forms | workers see only approved frontline subset; complete library supervisor-only |
| Public or low sensitivity | generic Florence branding and non-sensitive public service information | may be published only after management approval |

Florence must not store information merely because it may be useful later. Only information necessary for service delivery, safeguarding, quality, legal or contractual obligations should be collected.

## 5. Access-control model

### 5.1 Roles

| Role | Permitted access | Key restrictions |
|---|---|---|
| Supervisor | Organisation oversight; participant and medication setup; rosters; incidents and complaints; governance; staff administration; controlled library; timesheet approval; audit review | Must use individual account and MFA; cannot view another person's password, authenticator code or signing PIN |
| Support worker | Assigned participant records; permitted roster actions; MAR and progress notes; own timesheets; approved worker resources; limited SIL records | Access limited to explicit assignment or permitted roster window; cannot administer accounts, alter signed records or access unassigned participants |
| Family representative portal | Linked participant identity and secure portal messages/requests | No raw medication, MAR, progress notes, incidents, roster, staff records, governance or worker library |
| Participant portal | Linked participant identity and secure portal messages/requests | Same portal-only boundary; information must be accessible and understandable |
| Edge Function service role | Performs narrowly defined privileged server tasks | Never exposed to browser; invoked only after the function validates origin, user, MFA, active profile, role and organisation |

### 5.2 Account lifecycle

**Invitation**

1. Supervisor confirms the person's identity, role and participant link where applicable.
2. Supervisor sends the invitation through People & access management.
3. Florence creates or links the Auth account and profile.
4. The invited person sets a password, enrols their own authenticator and signs in using their individual account.
5. Support-worker participant access is granted only after role, screening, induction and service need are confirmed.

**Role change**

- Supervisor records the business reason.
- Family or participant roles require a linked participant.
- Florence must retain at least one active supervisor.
- Role and participant access must be reviewed immediately after the change.

**Deactivation / offboarding**

- Deactivate the Florence account on the final working day or immediately after termination, suspension, lost-device report or suspected compromise.
- Revoke participant assignments.
- Remove the person from rosters and future shifts.
- Review outstanding notes, MAR, incidents, timesheets and handovers.
- Remove access to GitHub, Supabase, Xero, email, shared drives and any business device.
- Preserve records; do not delete signed operational evidence merely because employment ended.

## 6. Authentication, MFA and digital signing

- All accounts use individual email addresses and passwords.
- Passwords must be at least ten characters; long unique passphrases are preferred.
- TOTP authenticator MFA is mandatory for every Florence role.
- Protected RLS policies and privileged database functions require an AAL2 session.
- The staff-management and Xero Edge Functions also require AAL2 before using the service role.
- Each worker or supervisor creates a separate six-digit signing PIN used to sign MAR and progress notes.
- The signing PIN is stored only as a password hash and must never be shared.
- Supervisors cannot retrieve passwords, MFA secrets or signing PINs.
- A lost authenticator or device must be reported immediately and treated as an access incident.

## 7. Encryption and secret management

### 7.1 In transit

- Florence and Supabase APIs use HTTPS.
- Supabase HTTP APIs enforce TLS.
- Postgres SSL enforcement must be enabled in the Supabase Database settings for any direct database or pooler connection.
- Database clients used for backup or administration should use certificate verification where supported.

### 7.2 At rest

- The Supabase hosted project encrypts project data at rest.
- The private Storage bucket is not public.
- Florence's organisation archive uses AES-GCM encryption and a passphrase held separately from the archive.
- No service-role key, database password, Xero client secret or private signing secret may be committed to GitHub or added to browser code.

### 7.3 Secrets

Approved secret locations:

- Supabase Edge Function Secrets;
- Supabase project and organisation account controls;
- an approved business password manager;
- an offline sealed recovery record held by authorised Key Management Personnel.

Prohibited locations:

- `config.js` except for the publishable Supabase key;
- email, SMS or chat messages;
- screenshots;
- participant documents;
- personal notes apps;
- GitHub issues or pull requests.

## 8. Logging, audit and monitoring

Florence records:

- database row inserts, updates and deletes for audited tables;
- login and MFA-enrolment events;
- selected sensitive views;
- controlled-document downloads;
- exports;
- account invitations, activation changes and role changes;
- Xero actions;
- retention decisions.

### 8.1 Review schedule

| Frequency | Review |
|---|---|
| Weekly | Supabase Security Advisor alerts; failed Edge Function invocations; unusual Auth events; GitHub security alerts |
| Monthly | Florence Audit History; active accounts; participant assignments; supervisor access; ZAP report; dependency and CodeQL alerts |
| Quarterly | Restore test; role-based UAT; incident and complaint trends; retention register; emergency continuity review |
| After significant change | Full quality gate, RLS smoke tests, live regression checklist and management sign-off |

### 8.2 Alert triggers

Escalate immediately for:

- repeated failed login or MFA attempts;
- access by an inactive or unexpected account;
- an unassigned worker seeing participant information;
- failed or altered audit records;
- service-role secret exposure;
- public Storage or disabled RLS;
- unexplained export or document download;
- data appearing in another organisation or participant account;
- malware, stolen device, phishing or credential disclosure;
- unexplained deletion or corruption.

## 9. Backup and recovery

### 9.1 Required backup components

A complete Florence recovery set has two separate parts:

1. **PostgreSQL database backup**
   - Supabase project backup or approved database dump.
   - Contains database records and Storage metadata.

2. **Private Storage object backup**
   - Separate export of all file bytes in `florence-private`.
   - Required because database backups do not contain the actual Storage objects.

The encrypted Florence archive is useful for business continuity and evidence export, but it is not a complete disaster-recovery backup because it excludes private document file bytes and authentication infrastructure.

### 9.2 Minimum backup schedule

| Item | Frequency | Retention | Owner |
|---|---|---|---|
| Confirm Supabase automated database backup | Weekly | According to Supabase plan | Supervisor |
| Manual database export before major release | Before every migration or structural change | Keep at least three known-good versions | Supervisor |
| Private Storage export | Monthly and before major changes | Keep current plus previous two copies | Supervisor |
| GitHub source repository | Continuous | Git history | Repository owner |
| Encrypted Florence organisation archive | Monthly | Business retention schedule | Supervisor |

### 9.3 Backup location

- Store database and private-Storage backups in an approved encrypted business location.
- Do not use a worker's personal Google Drive, personal iCloud or unencrypted USB drive.
- Keep backup credentials and archive passphrases separate from the backup files.
- Limit backup access to authorised Key Management Personnel.

### 9.4 Restore testing

At least quarterly and after a major migration:

1. Restore into a separate test project or local test environment.
2. Confirm database tables, Auth linkages where applicable, private Storage files and controlled document metadata.
3. Test one supervisor, assigned worker, unassigned worker and portal role using fake information.
4. Confirm audit, MAR, progress-note and document controls still operate.
5. Record start time, completion time, issues, corrective actions and sign-off.
6. Never test restoration by overwriting the live project.

## 10. Cyber and privacy incident response plan

### 10.1 Examples

- lost or stolen phone/laptop;
- password, authenticator or signing PIN disclosure;
- phishing or suspicious login;
- participant information sent to the wrong person;
- worker access continuing after employment ends;
- public Storage object or broken RLS policy;
- malware or ransomware;
- unapproved export, screenshot or download;
- system outage affecting medication or emergency information;
- incorrect or corrupted participant record;
- exposed GitHub, Supabase or Xero secret.

### 10.2 Response roles

- **Incident and privacy lead:** Candice Long.
- **Director / decision authority:** Victoria Kussrow.
- **Technical containment:** authorised Florence/Supabase/GitHub administrator.
- **Participant communication:** authorised Key Management Personnel, in consultation with the participant where appropriate.

### 10.3 Response steps

**1. Contain**

- protect immediate participant safety;
- deactivate affected accounts and revoke sessions;
- revoke participant assignments;
- rotate exposed passwords, tokens and secrets;
- isolate lost or infected devices;
- disable a faulty feature or integration;
- preserve logs and do not erase evidence.

**2. Assess**

- what happened and when;
- which systems, people and participants were affected;
- what information was involved;
- whether information was accessed, altered, lost or disclosed;
- likely harm and whether remedial action can reduce that harm;
- whether external notification or specialist advice is required.

**3. Notify and support**

- notify Victoria and Candice immediately;
- communicate with affected participants in an accessible way where appropriate;
- follow incident, complaint, safeguarding, NDIS Commission and privacy notification requirements that apply to the event;
- contact emergency services first where there is immediate danger;
- document every notification and decision.

**4. Recover**

- restore from a verified backup where required;
- validate access controls and data integrity;
- monitor for recurrence;
- provide affected people with practical support.

**5. Review and improve**

- complete a root-cause review;
- enter actions in the Continuous Improvement Register;
- update policies, training, code or procedures;
- verify actions are completed and effective.

## 11. Focused Florence risk assessment

Risk ratings use likelihood and consequence together. The residual rating assumes the listed controls are operating and evidenced.

| ID | Risk | Inherent | Current / planned controls | Residual | Owner |
|---|---|---:|---|---:|---|
| F-01 | GitHub Pages is used for a production password login | High | Move to Cloudflare Pages or approved host; security headers; update Supabase redirects and Edge Function origins | Low-Medium | Candice |
| F-02 | No independent penetration test | High | Internal review; CodeQL; ZAP passive scan; Security Advisor; staged pilot; management risk acceptance; re-assess when budget permits | Medium | VJ |
| F-03 | Supervisor account compromise | Critical | Individual account; MFA; strong passphrase; no shared credentials; monthly access review; immediate deactivation and session revocation | Medium | VJ/Candice |
| F-04 | Worker accesses an unassigned participant | Critical | RLS; explicit assignment; roster window; portal separation; automated database smoke test; live UAT | Low-Medium | Candice |
| F-05 | RLS regression after code/database change | High | Transactional migrations; permanent PostgreSQL quality gate; live regression test after significant changes | Medium | Candice |
| F-06 | Lost or stolen worker device | High | Device PIN/biometric lock; updated OS; MFA; idle timeout; no document downloads; immediate account deactivation | Medium | Worker/supervisor |
| F-07 | Storage files deleted or unavailable | High | Private bucket; restricted delete; separate monthly Storage backup; quarterly restore test | Medium | Candice |
| F-08 | Database backup exists but cannot be restored | High | Documented restore test in separate environment; quarterly evidence; corrective actions | Medium | Candice |
| F-09 | Ex-worker retains access | High | Same-day deactivation; participant-access revocation; access review; offboarding checklist | Low | Supervisor |
| F-10 | Malicious or vulnerable dependency | High | Pinned browser libraries; CodeQL; Dependabot for Actions; monthly ZAP baseline; review CDN dependency changes | Medium | Candice |
| F-11 | Edge Function processes outside intended region | Medium | Application defaults Edge Function invocations to Sydney; verify response/log region; documented outage exception | Low | Candice |
| F-12 | Participant information is inaccurate or stale | High | participant review; annual/changed-circumstance support-plan review; worker escalation; signed records; corrections by follow-up rather than overwrite | Medium | Support team |
| F-13 | Unauthorised screenshots or personal-device downloads | High | worker declaration; no-download instruction; short-lived links; supervision; audit downloads; disciplinary response | Medium | Supervisor |
| F-14 | Florence outage during medication or emergency support | Critical | downtime pack; current paper emergency contacts and medication source documents; business-continuity process; restore plan | Medium | VJ/Candice |
| F-15 | Audit logs are collected but not reviewed | Medium | weekly/monthly review schedule; management minutes; action register | Low | Candice |
| F-16 | Phishing or false Florence login page | High | approved bookmark; MFA; staff training; custom production host; incident reporting | Medium | All users |
| F-17 | Excess information disclosed to family/participant portal | Critical | portal-only interface and RLS; direct database smoke test; live cross-participant UAT | Low-Medium | Candice |
| F-18 | Backup or export passphrase is lost or stored with the file | High | separate password-manager entry; two authorised custodians; recovery record | Medium | VJ/Candice |

## 12. No-cost security-testing program

The following controls do not replace an independent penetration test, but provide objective and repeatable evidence at no additional consulting cost.

1. **Permanent Florence quality gate**
   - JavaScript syntax.
   - static security controls.
   - full PostgreSQL migration build.
   - RLS role-boundary smoke tests.

2. **GitHub CodeQL**
   - runs for JavaScript/TypeScript on pushes, pull requests and a schedule;
   - alerts are reviewed in the repository Security tab;
   - high or critical alerts block go-live until resolved or formally risk accepted.

3. **OWASP ZAP baseline**
   - monthly passive scan of the public Florence host;
   - does not actively attack the application;
   - report retained as a workflow artifact;
   - new medium/high findings entered into the risk or improvement register.

4. **Supabase Security Advisor**
   - review at least weekly;
   - no unresolved exposed-table, missing-RLS, dangerous-function or sensitive-column finding before go-live.

5. **Manual role and abuse-case testing**
   - assigned worker, unassigned worker, supervisor, family and participant accounts;
   - direct attempts to read another participant;
   - direct unsafe MAR, note, shift and timesheet writes;
   - inactive-account and AAL1 denial;
   - invitation and role-change controls.

6. **Secret review**
   - review repository, Edge Function secrets and configuration after each significant change;
   - rotate any secret that may have been displayed or copied to an unapproved location.

## 13. Device and user operating rules

All Florence users must:

- use an individual account;
- use a device screen lock and current operating-system updates;
- use Florence only through the approved production address or installed PWA;
- never share passwords, MFA codes or signing PINs;
- never save participant documents to a personal device unless specifically authorised;
- never take screenshots of participant, medication, MAR, progress-note or incident information except under a documented approved process;
- sign out on shared or borrowed devices;
- report loss, theft, suspected phishing, unexpected prompts or incorrect access immediately;
- complete induction, privacy, incident, safeguarding and Florence-use training before access is activated.

## 14. Staged go-live model

### Stage 0 - Test only

- Use fake information.
- Complete hosting migration, backups, restore test, live role UAT and management sign-off.
- Do not upload genuine medication charts, health records or identity documents.

### Stage 1 - Controlled pilot

After every mandatory item is signed off:

- one participant only;
- only VJ, Candice and the minimum required trained workers;
- daily review during the first week;
- maintain the approved paper/downtime source documents;
- record every issue in the Continuous Improvement Register;
- stop the pilot immediately for an access-control, data-integrity, medication or privacy issue.

### Stage 2 - Broader controlled use

After at least 30 days of satisfactory pilot evidence:

- management reviews incidents, near misses, access logs, user feedback, backup evidence and outstanding risks;
- any high or critical issue must be resolved before expansion;
- VJ signs the broader-use decision.

## 15. Mandatory actions before real participant information

- [ ] Move Florence production login from GitHub Pages to Cloudflare Pages or another approved host.
- [ ] Apply the provided security headers on the production host.
- [ ] Update Supabase Auth Site URL and redirect allow-list to the new production address.
- [ ] Update `FLORENCE_APP_URL` and `FLORENCE_ALLOWED_ORIGINS` Edge Function secrets.
- [ ] Redeploy both Edge Functions after origin changes if required by the deployment process.
- [ ] Verify staff-management invitations and Xero status from the new host.
- [ ] Verify Edge Function execution shows `ap-southeast-2` in response metadata/logs.
- [ ] Enable Postgres SSL Enforcement.
- [ ] Enforce MFA for every Supabase organisation team member.
- [ ] Confirm GitHub 2FA for every repository administrator.
- [ ] Add a second trusted Supabase organisation owner for recovery.
- [ ] Review Supabase Security Advisor and resolve every high/critical issue.
- [ ] Confirm current database backup.
- [ ] Export the complete `florence-private` bucket to approved encrypted storage.
- [ ] Complete and document a restore test in a separate environment.
- [ ] Complete the full live UAT checklist using fake data.
- [ ] Confirm Mary Jane and Sifrol are absent.
- [ ] Update the participant Privacy Consent information to describe Florence, Australian cloud hosting and portal access.
- [ ] Have every worker sign the Florence User Access and Confidentiality Acknowledgement.
- [ ] Complete each worker's screening, induction, participant-specific briefing and competency evidence.
- [ ] Prepare the Florence downtime pack for medication, emergency and contact information.
- [ ] VJ and Candice sign the conditional go-live and residual-risk acceptance.

## 16. Ongoing control schedule

| Frequency | Action | Evidence |
|---|---|---|
| Daily during pilot | Review errors, MAR exceptions, overdue medication, incidents and access concerns | Pilot log |
| Weekly | Security Advisor, Edge Function errors, Auth anomalies, failed CI/security scans | Security review record |
| Monthly | Account/role/assignment review; Storage backup; encrypted archive; ZAP report; policy/document due dates | Monthly security checklist |
| Quarterly | Restore test; live role regression test; incident/data-breach exercise; retention and audit review | Quarterly assurance report |
| Six-monthly | SIL worker training/competency register and house safeguarding review | Worker and house records |
| Annually | Full Florence risk assessment, architecture review, emergency drill and management go-live reapproval | Annual review minutes |
| After significant change | Quality gate, Security Advisor, role UAT, backup and release approval | Change record |

## 17. Evidence register

| Evidence | Owner | Status / location |
|---|---|---|
| Supabase Sydney region screenshot | Candice | Confirmed |
| Florence internal readiness audit | Candice | Repository |
| Production hardening review | Candice | Repository |
| Database migration/RLS quality-gate results | Candice | GitHub Actions |
| CodeQL results | Candice | GitHub Security tab |
| OWASP ZAP baseline reports | Candice | GitHub Actions artifacts |
| Supabase Security Advisor review | Candice | Screenshot / management minutes |
| SSL enforcement confirmation | Candice | Screenshot |
| Supabase organisation MFA confirmation | VJ | Screenshot |
| Database backup evidence | VJ/Candice | Approved secure location |
| Private Storage backup evidence | Candice | Approved secure location |
| Restore-test record | Candice | Governance records |
| Role-based live UAT checklist | Candice | Governance records |
| Worker Florence acknowledgements | Supervisor | Worker files |
| Participant privacy consent/addendum | Supervisor | Participant files |
| Monthly access review | Supervisor | Governance records |
| Conditional go-live risk acceptance | VJ/Candice | Signed governance record |

## 18. References used to design this pack

- I-Care Connect Privacy and Information Management Policy.
- I-Care Connect Risk Management Policy.
- I-Care Connect Incident Management Policy.
- I-Care Connect Continuous Improvement Policy.
- I-Care Connect Human Resources Management Policy.
- I-Care Connect Emergency and Disaster Management Policy.
- I-Care Connect SIL Practice Governance and Safeguarding documents.
- NDIS Practice Standards - Provider Governance and Operational Management, Information Management.
- Office of the Australian Information Commissioner data-breach guidance.
- Australian Cyber Security Centre small-business guidance and Essential Eight.
- Supabase production, security, backup, Storage, SSL and regional-invocation documentation.
- GitHub Pages usage limits.
- OWASP ZAP baseline-scan documentation.

## 19. Review and approval

This pack must be reviewed whenever:

- Florence changes production host;
- a new integration is added;
- a role or access model changes;
- a high or critical incident occurs;
- Supabase or GitHub security architecture changes materially;
- I-Care Connect's registration scope or participant cohort changes;
- an audit identifies a gap;
- an independent assessment becomes affordable.

**Document owner:** ______________________________  Date: ____ / ____ / ______  
**Director approval:** _____________________________  Date: ____ / ____ / ______
