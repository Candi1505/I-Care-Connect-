# Florence live Core + Module 5A audit gap report

Checked: 13 August 2026 (read-only checks against Supabase project `pbbsaquwumxyrhqhnobv`).

## Result

Florence is not yet audit-ready. The application and database changes needed to track the full evidence set are prepared and pass local verification, but production currently has the earlier 44-document pack only. Those 44 records have no review dates. Fifty-three unique controlled requirements are not in the live library, and several live evidence registers are empty or have not been configured.

No production SQL, merge or deployment was performed. The agreed release hold remains in place until a recoverable production backup is confirmed. The connected project is `ACTIVE_HEALTHY` in Sydney. The live `staff-management` and `xero-connect` Edge Functions are active; this does not by itself confirm that the backup requirement has been met or that end-to-end release UAT is complete.

## Current production inventory

- 44 organisation controlled-library records, all version 1 and all without review dates.
- 1 participant care-plan document with a 3 August 2027 review date.
- 14 SIL operational records.
- 0 SIL provider-profile records.
- 0 staff credential records.
- 0 emergency-plan table records.
- 0 complaint records.
- 0 conflict-declaration records.
- 0 management/staff meeting-minute records.
- 0 delegation records.

A zero complaint count may be factually correct, but the complaints process, accessible pathway, register and evidence that nil activity was reviewed still need to be demonstrated. Likewise, a blank template is not evidence that worker, participant or governance controls are operating.

## Google Drive source-pack quality check

The connected reference folders contain the expected 75 Core and 23 Module 5A source files. All 98 files were readable, but the pack must not yet be converted into an approved Florence ZIP. Targeted and automated content checks confirmed these material issues:

- Participant Information Booklet still contains template directions such as “Only include…” and lists support coordination, recovery coaching, plan management, SDA, nursing, behaviour support, home modifications, therapeutic supports and other services outside the stated SIL scope.
- Participant Information Booklet (Easy Read) repeats the same long service list and template directions, so it is not yet a tailored Easy Read participant document.
- Participant Money and Property Policy states that I-Care Connect offers comprehensive plan-management services and describes a Plan Management team. That conflicts with the SIL-only scope and the separate service-agreement approach.
- Policy Register includes unrelated or unsupported policies such as SDA enrolment, specialised support coordination, specialist behaviour support, support coordination, tenancy management, tracheostomy, ventilator and other high-intensity supports. The register must contain only approved documents that genuinely apply to I-Care Connect.
- Worker Register includes support coordinator and implementing-behaviour-support worker roles. It must be tailored to roles actually engaged and registered, with current worker evidence.
- Risk Indemnity Form says participation is “entirely at my own risk” and refers to accepting an indemnity. It must be reframed as a dignity-of-risk discussion and agreed safeguards, without attempting to waive I-Care Connect’s duty of care, NDIS obligations or Australian Consumer Law responsibilities.

Some search hits are legitimate context rather than errors—for example, a participant may use a plan manager as a payment intermediary, an NDIS incident form may include SDA as a location type, and SIL documents may need to recognise an external behaviour support plan. Each flagged document still requires a human scope and accuracy check before approval.

## Missing controlled requirements

### Core — required

- SIL Business Plan
- Participant Information Booklet
- Participant Information Booklet — Easy Read
- Feedback and Complaints Summary
- Worker Register
- Internal Audit Schedule
- Conflict of Interest Declaration
- Training and Development Register
- Continuous Improvement Register
- Conflict of Interest Register
- WHS Risk Management Matrix
- Incident Management Register
- Continuous Improvement Plan
- Business Continuity, Emergency Response and Disaster Management Plan
- Hazard Identification Checklist
- Management Meeting Agenda and Minutes
- Home Risk Assessment Checklist
- Risk Management Register
- Pre-Employment Form
- Participant Satisfaction Survey
- Emergency Test Register
- Delegation of Authority
- Legislation Register
- Policy Register
- Governing Personnel Skills and Performance Review
- NDIS Reportable Incident Form — 5-Day Notification
- Feedback and Complaints Register
- Service Agreement — Without Plan Management
- Position Description — Principal
- Position Description — Disability Support Worker

### Core — conditional on supports delivered

- Participant Cash Reconciliation Register
- Waste Management Register
- Emergency Waste Management Plan
- Waste Management Policy
- Mealtime Risk Assessment Checklist
- Mealtime Management Plan
- Medication Consent Form
- Management of Medication Policy
- Mealtime Management Policy
- Participant Money and Property Policy
- Medication Competency Assessment
- Medication Incident Report Form
- Medication Plan and Administration Form
- Risk Indemnity Form
- Participant Money and Property Declaration
- Medicine Register

### Module 5A — required

- SIL Tenancy, Housing and Support Arrangements Policy
- SIL House Safeguarding Assessment
- SIL Co-Tenant Compatibility and Risk Review
- SIL Visitor and Private Space Guidance
- SIL House Rules and Shared Space Consultation Record
- SIL House Meeting and Participant Consultation Record
- SIL Conflict of Interest Review — Housing and Support Overlap

## Prepared Florence controls

The local release adds:

- a 97-requirement catalogue representing all 98 source references, with the duplicate WHS source controlled as one approved policy;
- Required/Conditional and Worker/Supervisor classifications;
- missing, draft, management-review, approved, review-due and expired statuses;
- individual PDF upload and version retention;
- MFA-protected supervisor approval and an approval transaction guard;
- worker access only to approved, unexpired frontline documents;
- supervisor-only organisation evidence;
- 29 live-evidence checks with notes and management status;
- an audit checklist CSV export;
- RLS and audit trails for evidence checks and approvals.

## Security and release observations

The current Supabase security advisor returned no error-level findings, 23 warning-level findings and 12 informational findings. The warnings are limited to two broad linter types: signed-in access to `SECURITY DEFINER` RPCs and RLS-enabled tables with no policies. Some are intentional (for example, secured application RPCs or deny-all internal tables), but each needs a documented disposition rather than being ignored. Performance-advisor findings are a separate optimisation backlog and are not proof of audit-document completeness.

## Mandatory next actions

1. Confirm a recoverable production backup and record where it is stored and how restore was tested.
2. Confirm the two release-critical Edge Functions by agreed name and complete end-to-end UAT, even though the live function list currently shows `staff-management` and `xero-connect` active.
3. Review the SQL migration and apply it only after the release hold is cleared.
4. Upload the 53 missing controlled requirements from the approved pack.
5. Review the content of all 97 controlled requirements, add effective/review dates and approve them in Florence. The existing 44 will intentionally become Needs review until this is done.
6. Complete every required live-evidence check and make an honest applicability decision for each conditional area.
7. Populate worker, participant and governance evidence; test worker and supervisor access; export and reconcile the final checklist.
8. Have management and the external auditor confirm that documents match real I-Care Connect operations. Florence cannot certify the organisation by itself.
