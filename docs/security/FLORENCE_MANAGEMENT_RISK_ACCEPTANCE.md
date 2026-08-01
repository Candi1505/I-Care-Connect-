# Florence Conditional Go-Live and Residual Risk Acceptance

**Organisation:** I-Care Connect PTY LTD  
**Application:** Florence  
**Decision date:** ____________________  
**Application version / commit:** ____________________  
**Approved production URL:** __________________________________________

## 1. Decision being made

This record documents the decision by I-Care Connect Key Management Personnel about whether Florence may move from fake-data testing to a controlled one-participant production pilot.

It does not certify Florence as risk free. It records the evidence reviewed, outstanding risks, conditions of use and named people accepting responsibility for the decision.

## 2. Independent cybersecurity assessment

- [ ] An independent security assessment or penetration test has been completed and findings are attached.
- [ ] An independent security assessment has **not** been completed because it is currently unaffordable.

Where the second option is selected:

- the assessment is recorded as **deferred**, not completed;
- no statement may claim Florence is independently penetration tested or certified;
- the no-cost compensating controls in the Security Assurance Pack must be operating;
- the initial rollout must be limited and closely monitored;
- an independent review must be reconsidered when funding becomes available, after a serious incident, before a substantial expansion, or when a significant new integration is introduced.

## 3. Evidence reviewed

| Evidence | Reviewed | Date / reference |
|---|---|---|
| Florence Security Assurance Pack | [ ] |  |
| Immediate Action Plan | [ ] |  |
| Internal readiness audit | [ ] |  |
| GitHub static and PostgreSQL quality gate | [ ] |  |
| CodeQL results | [ ] |  |
| OWASP ZAP baseline result | [ ] |  |
| Supabase Security Advisor | [ ] |  |
| Sydney project-region evidence | [ ] |  |
| Edge Function Sydney verification | [ ] |  |
| SSL enforcement evidence | [ ] |  |
| Supabase organisation MFA evidence | [ ] |  |
| GitHub administrator 2FA evidence | [ ] |  |
| Database backup evidence | [ ] |  |
| Private Storage backup evidence | [ ] |  |
| Completed restore-test record | [ ] |  |
| Completed live role UAT checklist | [ ] |  |
| Worker access and training evidence | [ ] |  |
| Participant privacy/consent records | [ ] |  |
| Florence downtime pack | [ ] |  |
| Open incident, complaint and improvement actions | [ ] |  |

## 4. Mandatory preconditions

A controlled pilot cannot be approved unless all statements below are true.

- [ ] Florence is no longer using GitHub Pages as the production password-login host.
- [ ] The production host applies the approved security headers.
- [ ] Supabase authentication and Edge Function origin settings use the production address.
- [ ] The Supabase project is in Sydney (`ap-southeast-2`).
- [ ] Edge Function processing has been verified in Sydney.
- [ ] SSL enforcement is enabled.
- [ ] Every platform administrator uses MFA/2FA.
- [ ] At least two trusted Supabase organisation owners exist.
- [ ] No unknown or unnecessary platform administrator exists.
- [ ] No unresolved critical or high Security Advisor, CodeQL, ZAP, UAT or internal audit issue exists.
- [ ] A current database backup exists.
- [ ] A current complete private Storage backup exists.
- [ ] A separate-environment restore test succeeded.
- [ ] Supervisor, assigned worker, unassigned worker, family and participant role tests passed.
- [ ] Every pilot user has completed access, privacy and Florence training.
- [ ] The pilot participant has provided informed consent or a lawful authorised basis is documented.
- [ ] The downtime pack is current and available.

## 5. Residual risks accepted for a limited pilot

| Risk | Current controls | Residual rating | Accepted by |
|---|---|---|---|
| No paid independent penetration test | internal review; CodeQL; ZAP passive scan; Security Advisor; permanent database/RLS quality gate; staged pilot; rapid incident response | Medium |  |
| Static frontend delivered through a third-party hosting platform | approved production host; HTTPS; CSP/security headers; source-controlled deployment; no browser secrets | Low-Medium |  |
| Staff may misuse authorised access or capture screenshots | least privilege; individual accounts; MFA; audit events; worker declaration; supervision; disciplinary and incident response | Medium |  |
| Supabase, hosting or internet outage | downtime pack; paper/source medication and emergency information; backups; restore procedure | Medium |  |
| Human configuration or role-assignment error | supervisor-only administration; role UAT; monthly access review; audit events; second-person review where feasible | Medium |  |

Add any organisation-specific residual risk:

| Risk | Current controls | Residual rating | Accepted by |
|---|---|---|---|
|  |  |  |  |
|  |  |  |  |

## 6. Pilot conditions

If approved, the pilot is limited to:

- **Participant:** one participant only, documented separately to preserve privacy in this governance record;
- **Users:** VJ, Candice and the minimum necessary trained workers;
- **Duration before review:** 30 days;
- **Data:** only information necessary for safe service delivery and legal/contractual obligations;
- **Monitoring:** daily for the first week, weekly for the remainder of the pilot;
- **Fallback:** current downtime pack and source documents remain available;
- **Stop rule:** stop live use immediately for an access-control, participant-mixing, data-integrity, medication-signing, backup or serious privacy issue.

## 7. Decision

- [ ] **Approved for a controlled one-participant pilot**, subject to every condition in this record.
- [ ] **Not approved**; further actions listed below are required.

### Required actions before approval or expansion

| Action | Owner | Due date | Completed/evidence |
|---|---|---|---|
|  |  |  |  |
|  |  |  |  |
|  |  |  |  |

## 8. Thirty-day review

At the end of the pilot, review:

- access and audit logs;
- incidents, near misses and privacy concerns;
- medication and progress-note integrity;
- participant and worker feedback;
- availability/outages;
- backup and restore evidence;
- security workflow results;
- outstanding risks and improvement actions.

- [ ] Continue limited use.
- [ ] Expand to additional participants.
- [ ] Continue only after corrective actions.
- [ ] Suspend use and return to downtime/manual processes.

## 9. Signatures

By signing, the decision makers confirm that they have reviewed the evidence, understand the limits of the internal assessment, understand that no paid independent penetration test has been completed where that option is selected, and accept responsibility for the documented residual risk and conditions.

**Candice Long - document owner / supervisor**  
Signature: __________________________________  Date: ____ / ____ / ______

**Victoria Kussrow - Director / Key Management Personnel**  
Signature: __________________________________  Date: ____ / ____ / ______

**Second reviewer / authorised delegate (optional)**  
Name: _______________________________________  
Signature: __________________________________  Date: ____ / ____ / ______
