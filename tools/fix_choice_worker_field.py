from pathlib import Path

path=Path('sil.js')
source=path.read_text(encoding='utf-8')
old=''' if(name==="worker"){
  const options=directory.staff.map(item=>`<option value="${item.id}">${esc(item.full_name)}</option>`).join("");
  return`<label>${label}${hint}<select name="${name}"${req}><option value="">Select worker…</option>${options}</select></label>`
 }'''
new=''' if(name==="worker"){
  if(!workerRecordTypes.has(recordType))return`<label>${label}<input name="${name}" value="${esc(currentProfile?.full_name||"Signed-in worker")}" readonly required></label>`;
  const options=directory.staff.map(item=>`<option value="${item.id}">${esc(item.full_name)}</option>`).join("");
  return`<label>${label}${hint}<select name="${name}"${req}><option value="">Select worker…</option>${options}</select></label>`
 }'''
if old in source:
 source=source.replace(old,new,1)
elif new not in source:
 raise SystemExit('Could not locate SIL worker field renderer')
old_profile='.select("id,role,active,organisation_id").eq("id",session.user.id).single()'
new_profile='.select("id,full_name,role,active,organisation_id").eq("id",session.user.id).single()'
if old_profile in source:
 source=source.replace(old_profile,new_profile,1)
elif new_profile not in source:
 raise SystemExit('Could not locate SIL profile query')
path.write_text(source,encoding='utf-8')
print('SIL choice-record worker identity corrected.')
