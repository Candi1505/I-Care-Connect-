-- Seed an ephemeral database with both the known fake records and retained test records.

insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-000000000001','supervisor@example.test'),
 ('00000000-0000-0000-0000-000000000002','worker@example.test'),
 ('00000000-0000-0000-0000-000000000003','family@example.test')
on conflict do nothing;

insert into public.organisations(id,name,abn,email)
values('20000000-0000-0000-0000-000000000001','I-Care Connect Test','55 699 493 457','test@example.test');

insert into public.participants(
 id,organisation_id,full_name,preferred_name,status
) values
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Mary Jane','Mary','Active'),
 ('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','Retained Test Participant','Retained','Active');

insert into public.profiles(
 id,organisation_id,participant_id,full_name,email,role,active
) values
 ('00000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',null,'Test Supervisor','supervisor@example.test','supervisor',true),
 ('00000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001',null,'Test Worker','worker@example.test','staff',true),
 ('00000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','Test Family','family@example.test','family',true);

insert into public.participant_access_assignments(
 id,organisation_id,participant_id,staff_id,granted_by,reason
) values(
 '21000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
 '10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002',
 '00000000-0000-0000-0000-000000000001','Smoke-test assignment'
);

insert into public.medications(
 id,organisation_id,participant_id,medication_name,dose,route,administration_time,medication_type,active,created_by
) values
 ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Sifrol','1 tablet','Oral','08:00','Regular',true,'00000000-0000-0000-0000-000000000001'),
 ('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','Retained Test Medication','1 tablet','Oral','09:00','Regular',true,'00000000-0000-0000-0000-000000000001');

insert into public.shifts(
 id,organisation_id,participant_id,assigned_staff_id,starts_at,ends_at,shift_type,status,response,created_by
) values
 ('40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',now()-interval '1 hour',now()+interval '7 hours','Test support','Published','Accepted','00000000-0000-0000-0000-000000000001'),
 ('40000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002',now()-interval '1 hour',now()+interval '7 hours','Retained support','Published','Accepted','00000000-0000-0000-0000-000000000001');

insert into public.mar_entries(
 id,organisation_id,medication_id,participant_id,staff_id,status,pin_verified,notes
) values(
 '50000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','Administered',true,'Fake MAR dependency'
);

insert into public.progress_notes(
 id,organisation_id,participant_id,staff_id,category,content,status,declaration_confirmed,pin_verified,signed_at
) values(
 '51000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','Test','Fake Mary Jane note','Final',true,true,now()),
 ('51000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','Test','Retained participant note','Final',true,true,now());

insert into public.client_timeline(
 id,organisation_id,participant_id,event_type,severity,occurred_at,title,description,created_by
) values(
 '52000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Other','Low',now(),'Fake timeline','Dependency cleanup test','00000000-0000-0000-0000-000000000002'
);

insert into public.incidents(
 id,organisation_id,participant_id,reported_by,occurred_at,category,severity,description,immediate_actions
) values(
 '53000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',now(),'Test','Low','Fake incident','No action'),
 ('53000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002',now(),'Test','Low','Retained incident','No action');

insert into public.complaints(
 id,organisation_id,participant_id,submitted_by,complainant_name,channel,subject,details
) values(
 '54000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','Test complainant','Internal','Fake complaint','Dependency cleanup test');

insert into public.timesheets(
 id,organisation_id,staff_id,shift_id,clock_in,clock_out,break_minutes,notes,status
) values(
 '55000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000001',now()-interval '2 hours',now()-interval '1 hour',0,'Work type: Participant support','Submitted'
);

insert into public.travel_expenses(
 id,organisation_id,staff_id,participant_id,shift_id,expense_date,expense_type,description
) values(
 '56000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',current_date,'Test travel','Dependency cleanup test'
);

insert into public.invoices(
 id,organisation_id,participant_id,invoice_number,description,hours,rate,invoice_date,created_by
) values(
 '57000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','TEST-MARY','Fake invoice',1,1,current_date,'00000000-0000-0000-0000-000000000001'
);

insert into public.portal_threads(
 id,organisation_id,participant_id,thread_type,subject,created_by
) values(
 '58000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','Message','Retained portal thread','00000000-0000-0000-0000-000000000003'
);

insert into public.portal_messages(
 id,organisation_id,thread_id,sender_id,message
) values(
 '59000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','58000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','Retained portal message'
);
