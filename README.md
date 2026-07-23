# Florence 10.1 Live Trial Setup

This release removes the role dropdown and local demo identity. Every person signs in with their own Supabase email and password.

## Roles

- Candice Long — `supervisor`
- Victoria “VJ” Kussrow — `supervisor`
- Amanda Buchanan — `staff`
- Nita Caslick — `staff`

## 1. Run the SQL

Open Supabase → SQL Editor → New query.

Paste and run the complete `supabase-schema.sql` file.

## 2. Create the four Auth users

Open Supabase → Authentication → Users → Add user.

Create one user for each person using their real email address and a temporary password:

- Candice Long
- Victoria Kussrow
- Amanda Buchanan
- Nita Caslick

Select the option that marks the email as confirmed if Supabase displays it.

Copy each user’s UUID.

## 3. Create the organisation and profiles

Run this first:

```sql
insert into public.organisations(name)
values ('I-Care Connect')
on conflict(name) do update set name=excluded.name
returning id;
```

Copy the organisation UUID returned.

Then replace every placeholder below and run it:

```sql
insert into public.profiles
(id, organisation_id, full_name, email, role, medication_pin_hash)
values
('CANDICE_AUTH_UUID', 'ORGANISATION_UUID', 'Candice Long', 'CANDICE_EMAIL', 'supervisor', crypt('CANDICE_6_DIGIT_PIN', gen_salt('bf'))),
('VJ_AUTH_UUID',       'ORGANISATION_UUID', 'Victoria Kussrow', 'VJ_EMAIL', 'supervisor', crypt('VJ_6_DIGIT_PIN', gen_salt('bf'))),
('AMANDA_AUTH_UUID',   'ORGANISATION_UUID', 'Amanda Buchanan', 'AMANDA_EMAIL', 'staff', crypt('AMANDA_6_DIGIT_PIN', gen_salt('bf'))),
('NITA_AUTH_UUID',     'ORGANISATION_UUID', 'Nita Caslick', 'NITA_EMAIL', 'staff', crypt('NITA_6_DIGIT_PIN', gen_salt('bf')));
```

Each medication PIN must be six digits and should be known only to that staff member.

## 4. Configure the website

Open `config.js`.

Paste the Project URL and anon/publishable key from Supabase → Project Settings → API:

```js
supabaseUrl: "https://YOUR-PROJECT.supabase.co",
supabaseAnonKey: "YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY",
```

Never paste the Supabase service-role secret into GitHub or browser code.

## 5. Upload the six web files

Upload these files to the root of the GitHub repo:

- index.html
- styles.css
- app.js
- config.js
- supabase-schema.sql
- README.md

## Trial behaviour

- Candice and VJ see supervisor controls.
- Amanda and Nita see only shifts assigned to their own Auth user.
- Shift acceptance and decline save in Supabase.
- Progress notes save centrally.
- Medication administration verifies the signed-in worker’s six-digit PIN server-side.
- Care plans and compliance evidence upload to the private `florence-private` Storage bucket.


## Florence 10.2 additions

### Family and client portal

Family members and clients can have their own Supabase Auth account.

Use role:

- `family` for an authorised family or representative portal account
- `client` for the participant's own portal account

Each family/client profile must include the participant UUID it belongs to:

```sql
insert into public.profiles
(id, organisation_id, full_name, email, role, participant_id)
values
('AUTH_USER_UUID', 'ORGANISATION_UUID', 'Family Member Name', 'EMAIL_ADDRESS', 'family', 'PARTICIPANT_UUID');
```

Family and client users can:

- open messages;
- make support, roster or appointment requests;
- submit information updates;
- reply to conversations linked to their participant.

They cannot see another participant's portal conversations.

### Client timeline

The client timeline records significant events without forcing every entry into a formal incident report.

Examples include:

- falls;
- behaviour observations;
- medication mishaps;
- health changes;
- hospital visits;
- appointments;
- family updates;
- other significant events.

Each entry records the date and time, event type, severity, description, actions taken, follow-up and the staff member who entered it.

Run the updated `supabase-schema.sql` again. The statements use `if not exists` and safe policy replacement for the new tables.


## Florence App V1 database compatibility update

- Matches the clean Florence Database V1 schema.
- Uses explicit Supabase foreign-key relationships.
- Supports supervisor, staff, family and client workspaces.
- Restricts medication actions to staff and supervisors.
- Gives family/client accounts read access only to their linked participant.
- Updates the medication RPC call to the V1 function signature.
