# Florence Backup and Recovery Procedure

**Owner:** Candice Long  
**Approver:** Victoria Kussrow  
**Version:** 1.0  
**Review frequency:** Quarterly and after a significant database, Storage or hosting change

## 1. Purpose

This procedure ensures that I-Care Connect can recover Florence after accidental deletion, corruption, account compromise, platform outage, failed migration or other disruption.

A complete Florence recovery set requires both:

1. a PostgreSQL database backup; and
2. a separate copy of the actual files held in the private `florence-private` Storage bucket.

The browser encrypted archive is not a complete disaster-recovery backup because it excludes private Storage file bytes and authentication infrastructure.

## 2. Roles

- **Backup operator:** Candice Long or another specifically authorised supervisor.
- **Recovery decision authority:** Victoria Kussrow.
- **Second authorised custodian:** ______________________________.
- **Technical support contact:** ______________________________.

Only authorised Key Management Personnel may possess complete database or private-Storage backups.

## 3. Backup schedule

| Backup | Frequency | Additional trigger | Minimum copies |
|---|---|---|---:|
| Supabase automated backup/restore point confirmation | Weekly | Before any migration | Current plus platform retention |
| Manual database export | Monthly | Before structural SQL or major release | Current plus previous two |
| `florence-private` Storage export | Monthly | Before Storage policy, library or migration change | Current plus previous two |
| Encrypted Florence organisation archive | Monthly | Before audit/export exercise | Current plus previous two |
| GitHub source | Continuous | Every approved merge | Repository history |

## 4. Approved backup location

Backups must be kept in an approved I-Care Connect business location that is:

- encrypted;
- accessible only to authorised Key Management Personnel;
- protected by MFA where cloud based;
- not a worker's personal Google Drive, personal iCloud, personal Dropbox or general phone storage;
- not an unencrypted USB drive;
- separate from the passwords/passphrases needed to open it.

**Approved location:** ____________________________________________  
**Backup access holders:** ________________________________________

## 5. Database backup procedure

### Before a significant change

1. Open the correct Supabase project: `pbbsaquwumxyrhqhnobv`.
2. Confirm the project name is **I-Care Connect Hub** and region is **Oceania (Sydney), ap-southeast-2**.
3. Open Database backups and confirm a current restore point.
4. Where the plan permits a manual download/export, create one before proceeding.
5. Record the backup date, type and reference below.
6. Do not run destructive base-schema scripts against the live project.

### Backup record

| Date/time | Operator | Backup type/reference | Change protected | Secure location | Verified |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
|  |  |  |  |  |  |

## 6. Private Storage backup procedure

The database backup records Storage metadata but does not contain the actual object bytes. Export all objects separately.

1. Open Supabase Storage -> `florence-private`.
2. Confirm the bucket is private.
3. Export/download every object and preserve its full path beneath the organisation UUID.
4. Include:
   - forty-four controlled library PDFs;
   - participant plans and evidence;
   - staff evidence;
   - other compliance documents.
5. Store the exported folder/archive in the approved encrypted backup location.
6. Generate or retain a file list with sizes and, where practical, SHA-256 checksums.
7. Confirm the number of exported objects matches the bucket listing.
8. Record the result below.

### Storage backup record

| Date/time | Operator | Object count | Total size | Checksum/file list | Secure location | Verified |
|---|---|---:|---:|---|---|---|
|  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |

## 7. Encrypted organisation archive

1. Sign in as a supervisor using MFA.
2. Select **Export encrypted archive**.
3. Use a unique strong passphrase.
4. Store the archive in the approved backup location.
5. Store the passphrase separately in the approved password manager or sealed recovery record.
6. Never email the archive and passphrase together.
7. Record that document file bytes are excluded.

## 8. Restore-test environment

Restore testing must not overwrite the live project.

**Test environment:** _____________________________________________  
**Test project/location:** _________________________________________

The test environment must use fake or safely copied/restricted data according to management approval. Access must be limited to the people conducting the test.

## 9. Quarterly restore test

### Preparation

- [ ] Management approval obtained.
- [ ] Current database backup identified.
- [ ] Matching private Storage backup identified.
- [ ] Test environment is separate from production.
- [ ] People conducting the test understand confidentiality obligations.
- [ ] Start time recorded.

### Database restoration

- [ ] Restore/import the database into the test environment.
- [ ] Confirm required extensions, tables, functions, triggers and RLS policies exist.
- [ ] Confirm profiles and organisation links are coherent.
- [ ] Confirm no production secret was placed in source code or test documents.

### Storage restoration

- [ ] Recreate or confirm the private bucket.
- [ ] Restore all objects using their original paths.
- [ ] Confirm controlled-library metadata points to restored objects.
- [ ] Open a sample of controlled PDFs using a short-lived signed link.
- [ ] Open a sample participant document using an authorised test role.

### Functional validation

- [ ] Supervisor can sign in with MFA.
- [ ] Assigned worker sees the assigned fake participant.
- [ ] Unassigned worker cannot see that participant.
- [ ] Family/participant portal remains portal-only.
- [ ] MAR signing requires the correct personal PIN.
- [ ] Progress-note signing requires declaration and PIN.
- [ ] Signed records are retained and not directly editable.
- [ ] Incident and complaint records retain audit/retention information.
- [ ] Time clock functions use database timestamps.
- [ ] Private documents remain inaccessible without authorisation.
- [ ] Audit events can be reviewed.

### Completion

- [ ] Finish time recorded.
- [ ] Recovery time objective achieved or variance explained.
- [ ] Missing/corrupt records documented.
- [ ] Corrective actions entered into the Continuous Improvement Register.
- [ ] Test environment securely retained or destroyed as approved.
- [ ] VJ reviews and signs the test record.

## 10. Restore-test record

| Field | Result |
|---|---|
| Test date |  |
| Backup date used |  |
| Storage backup date used |  |
| Test operator(s) |  |
| Start time |  |
| Finish time |  |
| Total recovery time |  |
| Database result |  |
| Storage result |  |
| Role/RLS result |  |
| MAR/note integrity result |  |
| Audit/retention result |  |
| Defects found |  |
| Corrective actions |  |
| Retest required |  |

**Operator signature:** __________________________  Date: ____ / ____ / ______  
**Director approval:** ___________________________  Date: ____ / ____ / ______

## 11. Emergency recovery procedure

1. Protect immediate participant safety and use the approved downtime pack.
2. Stop writes to Florence where continuing could worsen corruption or disclosure.
3. Preserve logs and evidence.
4. Notify Victoria and Candice.
5. Identify the last known-good database and Storage backups.
6. Restore into a separate environment first where time and safety permit.
7. Validate record integrity and access controls.
8. Authorise production recovery.
9. Reconcile paper/downtime records into Florence using signed, dated follow-up entries.
10. Conduct incident, privacy and root-cause reviews.

## 12. Failure conditions

Florence is not considered recoverable where:

- only a database backup exists but private file bytes are missing;
- only a browser archive exists;
- the passphrase is unavailable;
- the backup has never been restored and tested;
- restored role or participant boundaries are not verified;
- a backup is stored only in a personal account or unencrypted device.

Any failure condition must be recorded as a high business-continuity risk and treated before broader live use.
