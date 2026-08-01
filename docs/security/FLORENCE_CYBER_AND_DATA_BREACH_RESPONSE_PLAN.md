# Florence Cybersecurity and Data Breach Response Plan

**Organisation:** I-Care Connect PTY LTD  
**Application:** Florence  
**Incident and privacy lead:** Candice Long  
**Director / decision authority:** Victoria Kussrow  
**Version:** 1.0  
**Review frequency:** Quarterly and after every cyber/privacy incident or exercise

## 1. Purpose

This plan provides a simple, proportionate process for identifying, containing, assessing, notifying, recovering from and learning from a cybersecurity or privacy incident involving Florence.

It works with the I-Care Connect Incident Management Policy, Privacy and Information Management Policy, Business Continuity arrangements, complaints system and Continuous Improvement Register.

## 2. Events covered

Examples include:

- a lost or stolen phone, laptop, authenticator or backup device;
- a shared, exposed or guessed password, MFA code or signing PIN;
- phishing, a false Florence login page or suspicious login;
- an unassigned worker seeing participant information;
- a family or participant account seeing raw clinical or staff information;
- participant information emailed, messaged, exported or downloaded to the wrong person or location;
- a public Storage object, missing RLS policy or exposed database table;
- malware, ransomware or unauthorised browser extension;
- an exposed GitHub, Supabase or Xero secret;
- unexplained data deletion, corruption or alteration;
- audit logs disabled, altered or unavailable;
- an ex-worker retaining access;
- Florence outage affecting medication, emergency or continuity information;
- a backup that is missing, unreadable or cannot be restored.

## 3. Severity guide

| Level | Example | Response |
|---|---|---|
| Critical | ongoing unauthorised access to multiple participants; exposed service-role key; public clinical Storage; destructive compromise; immediate participant safety risk | immediate containment, Director notification, technical shutdown where needed, external advice/notification assessment |
| High | one participant's sensitive information accessed by an unauthorised person; stolen logged-in supervisor device; RLS failure; malicious export | immediate containment and formal incident/data-breach assessment |
| Medium | phishing attempt with no confirmed access; repeated failed logins; incorrect role corrected before data access; temporary monitoring gap | same-day assessment, monitoring and corrective action |
| Low | harmless user mistake with no personal information involved; unsuccessful scan or false positive | record and review proportionately |

## 4. Response team

| Responsibility | Primary | Backup |
|---|---|---|
| Immediate participant safety | Worker on duty / supervisor | Emergency services |
| Incident and privacy coordination | Candice Long | Victoria Kussrow |
| Authorise shutdown, notifications and recovery | Victoria Kussrow | authorised delegate |
| Supabase/GitHub containment | authorised Florence administrator | second authorised owner |
| Participant/support-network communication | authorised Key Management Personnel | delegated supervisor |
| Evidence and chronology | assigned incident recorder | delegated supervisor |

## 5. Immediate reporting

Every worker must report a suspected cyber or privacy incident immediately to Key Management Personnel. Do not wait for proof.

**Internal emergency contact:** ______________________________  
**Secondary contact:** ______________________________________  
**After-hours escalation:** __________________________________

Where there is immediate danger to a person, contact emergency services first.

## 6. Five-phase response

### Phase 1 - Contain

- Protect participant safety and switch to the approved downtime process where needed.
- Deactivate affected Florence accounts.
- Revoke sessions and participant assignments.
- Remove a lost device from business accounts where possible.
- Change compromised passwords.
- Rotate exposed Supabase, GitHub, Xero, email or other secrets.
- Disable a faulty Edge Function, integration, deployment or feature.
- Make a private Storage object private/remove public exposure.
- Stop further exports or data entry where continuing could worsen harm.
- Preserve logs, screenshots and timestamps; do not delete evidence.

### Phase 2 - Assess

Record:

- what happened;
- when it began and when it was discovered;
- who reported it;
- systems/accounts/devices involved;
- participants and workers potentially affected;
- information types involved;
- whether information was viewed, changed, copied, deleted or disclosed;
- whether access is continuing;
- likely consequences and seriousness;
- whether remedial action has prevented likely serious harm;
- whether the event is also an NDIS incident, complaint, safeguarding event, WHS incident or service-continuity incident;
- whether legal, insurer, privacy, police, NDIS Commission or other external notification requires assessment.

### Phase 3 - Notify and support

- Notify Victoria and Candice immediately for critical/high events.
- Communicate with affected participants in accessible language where appropriate.
- Involve a representative or advocate only in accordance with the participant's consent or legal authority.
- Explain what happened, what information was involved, what has been done and what the participant should do.
- Do not make unsupported promises or speculate.
- Follow applicable NDIS incident, privacy/data-breach, police, insurer, contract and other notification requirements.
- Record who decided whether notification was or was not required and why.

### Phase 4 - Recover

- Verify the threat or faulty configuration is removed.
- Restore from a known-good database and private-Storage backup if required.
- Validate users, roles, assignments, MFA, RLS, signed records, audit trails and document access.
- Reconcile downtime records.
- Monitor Auth, Edge Function and audit logs closely after restoration.
- Provide participants and workers with practical support.

### Phase 5 - Review and improve

- Complete root-cause analysis.
- Identify control, training, policy, coding and process failures.
- Enter actions into the Continuous Improvement Register.
- Assign owners and due dates.
- Retest the affected control.
- Update this plan, risk assessment, training or architecture documents.
- Report outcomes to management and affected participants where appropriate.

## 7. Incident chronology

| Date/time | Event / action | Person | Evidence/reference |
|---|---|---|---|
|  |  |  |  |
|  |  |  |  |
|  |  |  |  |
|  |  |  |  |

## 8. Initial assessment record

| Field | Details |
|---|---|
| Incident reference |  |
| Date/time discovered |  |
| Reported by |  |
| Systems/accounts/devices |  |
| Participants/workers affected |  |
| Information involved |  |
| Access/view/change/delete/disclosure |  |
| Immediate safety impact |  |
| Containment completed |  |
| Current severity |  |
| External notification assessment required |  |
| Assigned incident manager |  |

## 9. Containment checklist

- [ ] Immediate participant safety addressed.
- [ ] Affected account deactivated.
- [ ] Sessions revoked.
- [ ] Participant assignments revoked where relevant.
- [ ] Passwords/tokens/secrets rotated.
- [ ] Lost device remotely secured where possible.
- [ ] Faulty deployment/integration disabled.
- [ ] Storage/RLS exposure closed.
- [ ] Logs and evidence preserved.
- [ ] Downtime process activated.
- [ ] Director notified.

## 10. Notification decision record

| Question | Finding |
|---|---|
| Is personal or sensitive information involved? |  |
| Is unauthorised access, disclosure or loss confirmed or suspected? |  |
| Is serious harm likely? |  |
| Has remedial action prevented likely serious harm? |  |
| Is this a reportable NDIS incident or other safeguarding matter? |  |
| Is police/insurer/contractual notification required? |  |
| Was specialist/legal/privacy advice obtained? |  |
| Decision |  |
| Decision maker and date |  |
| Reason |  |

## 11. Recovery validation

- [ ] Production URL and HTTPS verified.
- [ ] Supabase project and region verified.
- [ ] Active users and roles reviewed.
- [ ] All supervisor accounts verified.
- [ ] Participant assignments reviewed.
- [ ] MFA required and working.
- [ ] RLS and role UAT passed.
- [ ] MAR and progress-note signing passed.
- [ ] Private Storage documents remain private and accessible to authorised roles only.
- [ ] Edge Function origin/AAL2 checks passed.
- [ ] Audit events are being written.
- [ ] Backup and restore evidence retained.
- [ ] Downtime records reconciled.
- [ ] Director approves return to normal operations.

## 12. Post-incident review

| Field | Details |
|---|---|
| Root cause |  |
| Why existing controls did/did not work |  |
| Participant impact and support |  |
| Worker impact and support |  |
| Notifications made |  |
| Data restored/corrected |  |
| Improvement actions |  |
| Responsible persons |  |
| Due dates |  |
| Retest result |  |
| Closure decision |  |

## 13. Exercise schedule

At least quarterly, conduct a short tabletop exercise using one scenario:

- stolen supervisor phone;
- phishing and password disclosure;
- worker sees an unassigned participant;
- private PDF link sent to the wrong person;
- Supabase outage during medication round;
- Storage files deleted;
- false role assigned to a family account.

Record participants, decisions, gaps and improvement actions.

**Exercise date:** ____________________  
**Scenario:** _________________________  
**Outcome/actions:** ________________________________________________

## 14. Approval

**Incident/privacy lead:** _________________________  Date: ____ / ____ / ______  
**Director:** _____________________________________  Date: ____ / ____ / ______
