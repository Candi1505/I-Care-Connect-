# Florence Live User-Acceptance and Security Checklist

**Environment:** Live Florence application with fake test information only  
**Supabase project:** `pbbsaquwumxyrhqhnobv`  
**Test lead:** Candice Long  
**Approver:** Victoria Kussrow  
**Test date:** ____________________  
**Application version / commit:** ____________________

## Rules for this test

- Use separate Auth accounts for each role.
- Use fake names, medication, health and NDIS information.
- Do not use Mary Jane or Sifrol; those known demo records have been removed.
- Record screenshots without displaying passwords, MFA setup secrets, signing PINs or genuine personal information.
- A failed access-control, medication-signing, record-integrity or portal-isolation test is a go-live blocker.
- Record each defect in the Continuous Improvement Register and retest after correction.

Status values: **Pass / Fail / Not tested / Not applicable**.

## 1. Environment and deployment

| Test | Expected result | Status | Evidence / notes |
|---|---|---|---|
| Production URL uses the approved host | Florence loads only from the approved address |  |  |
| HTTPS | Browser displays a valid secure connection |  |  |
| Security headers | CSP, frame denial, no-sniff, referrer and permissions headers are present |  |  |
| Sydney project | Supabase project region is `ap-southeast-2` |  |  |
| Sydney functions | Edge Function response/log records Sydney execution |  |  |
| Service worker update | Current app assets load after deployment; no old cached error |  |  |
| No fake live data | Mary Jane and Sifrol are absent |  |  |
| Private library | 44 private controlled PDFs are available |  |  |

## 2. Supervisor account

| Test | Expected result | Status | Evidence / notes |
|---|---|---|---|
| Password sign-in | Correct password proceeds to MFA; incorrect password denied |  |  |
| MFA required | Protected application does not open at AAL1 |  |  |
| Authenticator verification | Current six-digit code accepted; expired/incorrect code denied |  |  |
| Idle timeout | Session signs out after the configured inactivity period |  |  |
| Participant creation | Supervisor can create a fake participant |  |  |
| Optional fields | Participant can be saved without information not yet available |  |  |
| Participant update | Authorised corrections save and audit correctly |  |  |
| Medication creation | Regular, PRN and Schedule 8 labels save only for a permitted participant |  |  |
| Medication hold/cease | Held or ceased medication cannot be administered incorrectly |  |  |
| Roster creation | Draft and published shifts save correctly |  |  |
| Open shift | Open shift broadcasts without a null-recipient error |  |  |
| Staff invitation | Invitation works from the approved production origin |  |  |
| Four roles | Staff, supervisor, family and participant roles are available |  |  |
| Portal link | Family/client role requires a participant |  |  |
| Last supervisor protection | Florence refuses to deactivate/demote the final active supervisor |  |  |
| Participant assignment | Supervisor can grant and revoke worker access |  |  |
| Private PDF | Controlled PDF opens using a short-lived private link |  |  |
| Incident closure | Supervisor can review and close an incident with outcome/actions |  |  |
| Complaint resolution | Supervisor can document outcome and resolution |  |  |
| Timesheet approval | Submitted worker timesheet can be approved |  |  |
| Governance | Conflict, minutes and delegation records save and audit |  |  |
| Encrypted archive | Archive downloads/shares only after passphrase entry |  |  |
| Xero status | Status/connect/disconnect works or is clearly marked not configured |  |  |
| Audit history | Supervisor can review relevant audit events |  |  |

## 3. Assigned support-worker account

| Test | Expected result | Status | Evidence / notes |
|---|---|---|---|
| MFA | Worker cannot enter protected app without MFA |  |  |
| Assigned participant | Worker sees only the assigned fake participant |  |  |
| Assigned medication | Worker sees medication only for authorised participant |  |  |
| Assigned shift response | Worker can accept or decline their published shift |  |  |
| Open shift claim | Worker can claim an open shift once |  |  |
| Shift tampering | Worker cannot alter participant, dates, instructions or assigned worker through a direct request |  |  |
| Signing PIN setup | Worker can create their own six-digit PIN |  |  |
| Correct MAR PIN | Correct PIN signs MAR |  |  |
| Incorrect MAR PIN | Incorrect PIN is denied |  |  |
| Non-administered reason | Refused, withheld or missed outcome requires a reason |  |  |
| Ceased/on-hold medication | Florence refuses inappropriate administration |  |  |
| Progress-note declaration | Note requires true-and-correct declaration |  |  |
| Progress-note PIN | Correct personal PIN required |  |  |
| Signed note immutability | Worker cannot overwrite a completed signed note |  |  |
| Direct MAR insert | Direct browser/REST insert is denied |  |  |
| Direct note insert | Direct browser/REST insert is denied |  |  |
| Clock in | Database records current server time |  |  |
| One open time record | Second clock-in is denied while already clocked in |  |  |
| Admin work | `Administration / office work` is available |  |  |
| Clock out | Break validation works; timesheet becomes Submitted |  |  |
| SIL records | Worker can create only permitted participant-linked visitor, choice and handover records |  |  |
| Supervisor-only SIL | Worker cannot create house, governance, training or competency records |  |  |
| Worker document subset | Worker sees only approved frontline controlled documents |  |  |
| Provider governance | Complete provider-governance library is hidden |  |  |

## 4. Unassigned support-worker account

Use a worker with no participant assignment and no active/recent roster window.

| Test | Expected result | Status | Evidence / notes |
|---|---|---|---|
| People | Target participant is not returned |  |  |
| Medication | Target medication is not returned |  |  |
| MAR | Target MAR is not returned |  |  |
| Progress notes | Target notes are not returned |  |  |
| Timeline | Target timeline is not returned |  |  |
| Incidents | Target incidents are not returned |  |  |
| Goals/funding | Target goal/funding records are not returned |  |  |
| Documents | Participant documents cannot be listed or opened |  |  |
| Portal | Target portal threads/messages are not returned |  |  |
| SIL | Target SIL records are not returned |  |  |
| ID substitution | Changing a participant/record ID does not reveal data |  |  |
| Revocation | Access disappears immediately after assignment revocation |  |  |
| Roster expiry | Temporary access disappears outside the permitted roster window |  |  |

## 5. Family representative portal

| Test | Expected result | Status | Evidence / notes |
|---|---|---|---|
| MFA | Portal requires the user's own authenticator |  |  |
| Landing page | User lands directly in Portal |  |  |
| Linked participant | Only the linked participant identity is available |  |  |
| Portal threads | User sees only linked participant threads |  |  |
| New request | User can send a request/message |  |  |
| Complaint/feedback | Complaint creates the appropriate complaint record |  |  |
| Clinical modules | Medication, MAR, notes, timeline and incidents are not available |  |  |
| Workforce/governance | Roster, staff, timesheets, governance and controlled worker library are not available |  |  |
| Cross-participant ID | Another participant's ID returns no information |  |  |
| Deactivation | Deactivated portal user cannot sign in |  |  |

## 6. Participant portal

| Test | Expected result | Status | Evidence / notes |
|---|---|---|---|
| MFA and landing | User enters only their secure portal |  |  |
| Understandable language | Information is clear and accessible for the participant |  |  |
| Own portal information | Only linked participant messages/requests are available |  |  |
| Choice/support | Participant can raise a question, request or feedback item |  |  |
| No clinical/staff access | Raw clinical, roster, staff and governance data are unavailable |  |  |
| Cross-participant ID | Another participant's ID returns no information |  |  |

## 7. Account administration and recovery

| Test | Expected result | Status | Evidence / notes |
|---|---|---|---|
| Inactive account | Inactive worker denied |  |  |
| Banned account | Suspended account denied |  |  |
| Password reset | Approved redirect returns to production Florence |  |  |
| Lost authenticator process | Identity is verified before MFA reset/re-enrolment |  |  |
| Offboarding | Deactivation and assignment revocation take effect |  |  |
| Unknown origin | Staff-management and Xero reject an unapproved browser origin |  |  |
| AAL1 Edge Function | Privileged Edge Functions reject AAL1 session |  |  |

## 8. Backup and recovery

| Test | Expected result | Status | Evidence / notes |
|---|---|---|---|
| Database backup | Current backup exists |  |  |
| Storage backup | Complete private bucket object export exists |  |  |
| Separate storage | Credentials/passphrase are not stored with backup |  |  |
| Test restore | Separate environment restore succeeds |  |  |
| Private PDFs | Restored private PDFs open |  |  |
| Record integrity | MAR, notes, incidents and audit history are intact |  |  |
| Recovery timing | Recovery time and issues are documented |  |  |

## 9. Security and monitoring

| Test | Expected result | Status | Evidence / notes |
|---|---|---|---|
| SSL enforcement | Enabled |  |  |
| Supabase organisation MFA | Enabled for all team members |  |  |
| GitHub 2FA | Enabled for all repository administrators |  |  |
| Security Advisor | No unresolved high/critical finding |  |  |
| CodeQL | Workflow succeeds or findings are triaged |  |  |
| ZAP baseline | Passive scan reviewed |  |  |
| Secrets | No service-role, database or Xero secret in browser/repository |  |  |
| Logs | Edge, Auth, audit and CI failures have a named reviewer |  |  |

## 10. Go-live decision

### Blocking defects

| Reference | Description | Owner | Required action | Retest date | Closed |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
|  |  |  |  |  |  |
|  |  |  |  |  |  |

### Result

- [ ] **PASS FOR CONTROLLED ONE-PARTICIPANT PILOT** - all mandatory tests passed and no high/critical defect remains.
- [ ] **FAIL / GO-LIVE DEFERRED** - one or more mandatory tests failed or were not completed.

**Test lead:** ______________________________  Date: ____ / ____ / ______  
**Director approval:** __________________________  Date: ____ / ____ / ______
