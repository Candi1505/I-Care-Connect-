# Florence Core + Module 5A audit checklist

Status: implementation prepared on 13 August 2026; live release remains on hold until the production backup and both required Edge Functions are confirmed.

Regulatory basis checked on 13 August 2026: the NDIS Commission requires registered SIL providers in registration group 0138 to meet the Core Module and the SIL supplementary module. The four SIL standards are Supported decision-making, Safeguarding, Practice governance, and Agreements about tenancy, housing and support arrangements. See `https://www.ndiscommission.gov.au/rules-and-standards/ndis-practice-standards/sil` and `https://www.ndiscommission.gov.au/about-us/ndis-commission-reform-hub/mandatory-registration/mandatory-registration-SIL`.

## What Florence now controls

Florence’s canonical catalogue contains 97 unique controlled-document requirements representing all 98 files in the I-Care Connect reference pack. The source pack contains two versions of the Work Health and Safety Policy; Florence deliberately requires one approved current version so conflicting copies cannot both be treated as controlled.

The catalogue covers 74 unique Core requirements representing 75 Core source files and all 23 Module 5A requirements. Each requirement is classified as Required or Conditional and Worker or Supervisor access. Florence reports documents as Missing, Draft/Needs approval, Current, Review due or Expired.

The controlled library and the live evidence matrix are separate. A blank Incident Report Form, for example, does not prove that the incident register is current or that a sampled incident was reported, investigated, closed and used for improvement.

## Audit preparation workflow

1. Confirm the registered legal entity, key personnel, registration groups, Core and Module 5A scope match the application and every document.
2. In Florence SIL > Provider governance, upload each controlled document or import the complete version 2 ZIP.
3. Enter a real effective date and future review date. A supervisor with MFA must review and approve every worker-facing document. Uploads begin as drafts and are not available to workers until approval.
4. Resolve every Missing, Needs approval, Review due and Expired item. Do not mark the library ready merely because a template has been uploaded.
5. Complete the live audit-evidence matrix. Required areas cannot be marked Not applicable. Add a short note identifying what was sampled and any remaining action.
6. For every Conditional area, record whether I-Care Connect delivers that support. If it applies, complete the relevant policy, participant records, worker competency and operational evidence. If it does not apply, record the reason; do not create fictional evidence.
7. Export the audit checklist CSV and reconcile it against the final audit folder before giving it to the auditor.

## Required live evidence areas

The in-app matrix requires management to verify:

- the submitted NDIS application, self-assessment and Commission correspondence;
- legal entity, ABN, key personnel, organisation structure and current insurances;
- policy register, controlled versions, approvals and superseded-version traceability;
- completed internal audits, corrective actions, management reviews and meeting records;
- populated risk, legislation, conflict-of-interest and continuous-improvement registers;
- complete worker files, screening, qualifications, induction, training, supervision and competency;
- signed current service agreements and participant intake, rights and consent evidence;
- current participant support, risk and emergency plans with participant involvement and reviews;
- service delivery, progress, choice, handover and escalation records;
- incident and complaints registers with sampled reports, correspondence, decisions, notifications, closure and learning;
- emergency exercises, debriefs and completed improvements;
- Module 5A supported decision-making, communication, house safeguarding, compatibility, household consultation, visitor/privacy rights and housing/support separation;
- Module 5A worker matching, house induction, participant-specific competency, practice observations, supervision, handovers, roster continuity and emergency staffing.

## Conditional evidence decision

Management must make and record an honest applicability decision for medication, mealtime management, participant money/property, regulated waste and tenancy/SDA evidence. A participant’s tenancy or occupancy agreement may be relevant audit evidence, but it is not an I-Care Connect controlled template unless I-Care Connect is legally the housing provider. Florence’s Module 5A policy and conflict review must show that participants can exercise choice about supports without inappropriate pressure or loss of housing.

## Content checks before approval

Do not approve a document solely because its filename matches the catalogue. Confirm that it:

- uses I-Care Connect’s legal name, ABN, roles and real processes;
- matches the submitted self-assessment and the way Florence is actually used;
- has an owner, approver, version, effective date and review date;
- contains no `XXX`, sample provider, plan-management, support-coordination or unrelated SDA wording;
- does not promise response times, training or controls the organisation cannot evidence;
- does not treat a risk acknowledgement or indemnity as a waiver of NDIS duties;
- keeps invoicing based on the signed Service Agreement, using current NDIS pricing only as the applicable reference or cap;
- includes accessible participant information and correct NDIS Commission/external complaint pathways;
- has been made available to the workers who need it and is supported by training or competency evidence where required.

The Participant Information Booklet, its Easy Read version and the Participant Money and Property Policy require correction for confirmed unused-service, template-instruction and plan-management language before approval. The Policy Register and Worker Register must be narrowed to I-Care Connect’s real scope and roles. The Risk Indemnity Form must be reframed as dignity-of-risk and safeguard evidence rather than an attempted waiver or transfer of provider responsibility.

## Release and assurance boundary

The migration file is `florence-complete-audit-library-upgrade.sql`. It is additive, preserves earlier document versions and applies MFA, RLS, approval, audit-trail and private-storage controls. The migration must not be applied, merged or deployed until the agreed backup and Edge Function hold is cleared.

Florence can organise evidence and prevent obvious completeness mistakes. It cannot guarantee audit certification. Final readiness requires management verification against real operations, sampled records and the auditor’s scope.
