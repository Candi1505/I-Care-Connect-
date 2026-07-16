
index.html
from pathlib import Path

html = r'''<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#003A70">
  <title>I-Care Connect Hub</title>

  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>

  <style>
    :root {
      --navy: #003A70;
      --blue: #218BC4;
      --purple: #8247A4;
      --soft: #F7F5F2;
      --green: #248A55;
      --amber: #D78A00;
      --red: #C43D3D;
    }

    body {
      margin: 0;
      background: var(--soft);
      color: #263238;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .safe-top { padding-top: max(16px, env(safe-area-inset-top)); }
    .safe-bottom { padding-bottom: max(86px, calc(env(safe-area-inset-bottom) + 74px)); }
    .hidden-panel { display: none !important; }

    .nav-button {
      color: #6B7280;
      border-radius: 14px;
    }

    .nav-button.active {
      color: var(--navy);
      background: #EAF4FA;
      font-weight: 700;
    }

    .status-pill {
      display: inline-flex;
      border-radius: 999px;
      padding: 4px 9px;
      font-size: 12px;
      font-weight: 700;
    }

    .accepted { background: #E1F5E9; color: var(--green); }
    .pending { background: #FFF1D4; color: #8B5700; }
    .declined { background: #FDE5E5; color: var(--red); }
    .in-progress { background: #E4F1FA; color: var(--navy); }

    input, select, textarea {
      color: #263238;
      background: white;
    }

    button:active { transform: scale(.99); }
  </style>
</head>

<body>
  <main class="max-w-md mx-auto min-h-screen bg-[#F7F5F2] safe-bottom">
    <header class="safe-top px-5 pb-5 text-white bg-gradient-to-br from-[#003A70] to-[#218BC4]">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-3xl font-bold">I-Care Connect</h1>
          <p class="text-blue-100 text-sm mt-1">Connecting care, creating independence</p>
        </div>
        <button type="button" id="notifications-button"
                class="w-11 h-11 rounded-full bg-white/15 text-xl">
          🔔
        </button>
      </div>
    </header>

    <!-- HOME -->
    <section id="home-panel" class="p-4">
      <div class="mb-4">
        <h2 class="text-2xl font-bold text-[#003A70]">Good afternoon, Candice</h2>
        <p class="text-zinc-500 text-sm">Supervisor overview</p>
      </div>

      <div class="bg-white rounded-3xl border border-zinc-200 shadow-sm p-5 mb-4">
        <div class="flex items-center justify-between mb-3">
          <div>
            <p class="text-xs font-bold text-[#218BC4] uppercase tracking-wide">Current shift</p>
            <h3 class="text-xl font-bold text-[#003A70]">Evelyn Tait</h3>
            <p class="text-zinc-500 text-sm">8:00 am–8:00 pm</p>
          </div>
          <span class="status-pill in-progress">On shift</span>
        </div>

        <button type="button" data-open="clients"
                class="w-full bg-[#218BC4] text-white rounded-2xl py-3 font-semibold">
          Open client
        </button>
      </div>

      <div class="bg-white rounded-3xl border border-zinc-200 shadow-sm p-5 mb-4">
        <h3 class="font-bold text-[#003A70] mb-3">Medications at a glance</h3>

        <div class="grid grid-cols-2 gap-3 mb-3">
          <div class="rounded-2xl border border-amber-200 bg-amber-50 p-3">
            <p class="text-2xl font-bold text-amber-700">3</p>
            <p class="text-sm text-amber-800">Due today</p>
          </div>

          <div class="rounded-2xl border border-green-200 bg-green-50 p-3">
            <p class="text-2xl font-bold text-green-700">1</p>
            <p class="text-sm text-green-800">Administered</p>
          </div>
        </div>

        <button type="button" data-open="meds"
                class="w-full bg-[#003A70] text-white rounded-2xl py-3 font-semibold">
          Open medication record
        </button>
      </div>

      <div class="bg-white rounded-3xl border-l-4 border-[#8247A4] shadow-sm p-5 mb-4">
        <h3 class="font-bold text-[#003A70] mb-3">Supervisor attention</h3>

        <div class="space-y-2 text-sm">
          <button type="button" data-open="roster"
                  class="w-full flex justify-between border border-zinc-200 rounded-2xl p-3 bg-white">
            <span>Shift awaiting acceptance</span>
            <strong class="text-amber-700">1</strong>
          </button>

          <button type="button" data-open="notes"
                  class="w-full flex justify-between border border-zinc-200 rounded-2xl p-3 bg-white">
            <span>Progress notes outstanding</span>
            <strong class="text-red-600">1</strong>
          </button>

          <div class="flex justify-between border border-zinc-200 rounded-2xl p-3">
            <span>Compliance items expiring</span>
            <strong class="text-[#8247A4]">3</strong>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <button type="button" data-open="notes"
                class="bg-[#218BC4] text-white rounded-2xl py-4 font-semibold">
          Write progress note
        </button>

        <button type="button" data-open="roster"
                class="bg-[#8247A4] text-white rounded-2xl py-4 font-semibold">
          Manage roster
        </button>
      </div>
    </section>

    <!-- ROSTER -->
    <section id="roster-panel" class="p-4 hidden-panel">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="text-2xl font-bold text-[#003A70]">Roster</h2>
          <p class="text-zinc-500 text-sm">Create, publish and monitor shifts</p>
        </div>

        <button type="button" id="show-shift-form"
                class="bg-[#8247A4] text-white rounded-2xl px-4 py-3 font-semibold">
          + Shift
        </button>
      </div>

      <div id="shift-form" class="bg-white rounded-3xl border border-zinc-200 shadow-sm p-5 mb-4 hidden-panel">
        <h3 class="font-bold text-[#003A70] mb-3">Create shift</h3>

        <div class="space-y-3">
          <select id="shift-client" class="w-full border border-zinc-300 rounded-2xl p-3">
            <option>Evelyn Tait</option>
          </select>

          <select id="shift-worker" class="w-full border border-zinc-300 rounded-2xl p-3">
            <option value="">Select worker</option>
            <option>Candice</option>
            <option>Amanda</option>
            <option>Nita</option>
          </select>

          <input type="date" id="shift-date"
                 class="w-full border border-zinc-300 rounded-2xl p-3">

          <div class="grid grid-cols-2 gap-3">
            <input type="time" id="shift-start"
                   class="w-full border border-zinc-300 rounded-2xl p-3">
            <input type="time" id="shift-finish"
                   class="w-full border border-zinc-300 rounded-2xl p-3">
          </div>

          <textarea id="shift-instructions" rows="3"
                    placeholder="Shift instructions"
                    class="w-full border border-zinc-300 rounded-2xl p-3"></textarea>

          <p id="shift-message" class="text-sm min-h-5" role="status"></p>

          <button type="button" id="create-shift"
                  class="w-full bg-[#8247A4] text-white rounded-2xl py-4 font-semibold">
            Create and publish shift
          </button>
        </div>
      </div>

      <div class="bg-white rounded-3xl border border-zinc-200 shadow-sm p-5">
        <h3 class="font-bold text-[#003A70] mb-3">Today</h3>

        <div id="shift-list" class="space-y-3">
          <div class="border border-zinc-200 rounded-2xl p-4">
            <div class="flex justify-between gap-3">
              <div>
                <p class="font-bold">8:00 am–2:00 pm</p>
                <p class="text-sm text-zinc-500">Evelyn Tait · Candice</p>
              </div>
              <span class="status-pill in-progress">On shift</span>
            </div>
          </div>

          <div class="border border-zinc-200 rounded-2xl p-4">
            <div class="flex justify-between gap-3">
              <div>
                <p class="font-bold">2:00 pm–8:00 pm</p>
                <p class="text-sm text-zinc-500">Evelyn Tait · Amanda</p>
              </div>
              <span class="status-pill accepted">Accepted</span>
            </div>
          </div>

          <div class="border border-zinc-200 rounded-2xl p-4">
            <div class="flex justify-between gap-3">
              <div>
                <p class="font-bold">8:00 pm–8:00 am</p>
                <p class="text-sm text-zinc-500">Evelyn Tait · Nita</p>
              </div>
              <span class="status-pill pending">Awaiting</span>
            </div>

            <div class="grid grid-cols-2 gap-2 mt-3">
              <button type="button" class="accept-shift bg-green-600 text-white rounded-xl py-2 font-semibold">
                Mark accepted
              </button>

              <button type="button" class="decline-shift bg-red-600 text-white rounded-xl py-2 font-semibold">
                Mark declined
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- CLIENTS -->
    <section id="clients-panel" class="p-4 hidden-panel">
      <div class="mb-4">
        <h2 class="text-2xl font-bold text-[#003A70]">Clients</h2>
        <p class="text-zinc-500 text-sm">Client information, plans and records</p>
      </div>

      <div class="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
        <div class="bg-gradient-to-r from-[#218BC4] to-[#8247A4] p-5 text-white">
          <h3 class="text-2xl font-bold">Evelyn Tait</h3>
          <p class="text-sm text-white/85">SIL Support · Active client</p>
        </div>

        <div class="p-5">
          <div class="grid grid-cols-2 gap-3 mb-4">
            <div class="rounded-2xl bg-[#EAF4FA] p-3">
              <p class="text-xs uppercase font-bold text-[#218BC4]">Support</p>
              <p class="font-semibold text-[#003A70]">24-hour support</p>
            </div>

            <div class="rounded-2xl bg-purple-50 p-3">
              <p class="text-xs uppercase font-bold text-[#8247A4]">Location</p>
              <p class="font-semibold text-[#003A70]">Stanthorpe</p>
            </div>
          </div>

          <div class="space-y-3">
            <button type="button" class="client-action w-full flex justify-between border border-zinc-200 rounded-2xl p-4">
              <span>📄 Care plan</span><span>›</span>
            </button>

            <button type="button" class="client-action w-full flex justify-between border border-zinc-200 rounded-2xl p-4">
              <span>🧠 Behaviour support plan</span><span>›</span>
            </button>

            <button type="button" data-open="meds"
                    class="w-full flex justify-between border border-zinc-200 rounded-2xl p-4">
              <span>💊 Medication and MAR</span><span>›</span>
            </button>

            <button type="button" data-open="notes"
                    class="w-full flex justify-between border border-zinc-200 rounded-2xl p-4">
              <span>📝 Progress notes</span><span>›</span>
            </button>

            <button type="button" class="client-action w-full flex justify-between border border-zinc-200 rounded-2xl p-4">
              <span>📞 Contacts and health team</span><span>›</span>
            </button>

            <button type="button" class="client-action w-full flex justify-between border border-zinc-200 rounded-2xl p-4">
              <span>💰 Participant money</span><span>›</span>
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- MEDICATION -->
    <section id="meds-panel" class="p-4 hidden-panel">
      <div class="bg-white rounded-3xl border border-zinc-200 shadow-sm p-5">
        <h2 class="text-2xl font-bold text-[#003A70] mb-1">Medication and MAR</h2>
        <p class="text-sm text-zinc-500 mb-4">Evelyn Tait</p>

        <div class="space-y-3">
          <label class="block text-sm font-semibold text-[#003A70]" for="med-time">Administration time</label>
          <input type="datetime-local" id="med-time"
                 class="w-full border border-zinc-300 rounded-2xl p-3">

          <label class="block text-sm font-semibold text-[#003A70]" for="med-name">Medication</label>
          <select id="med-name" class="w-full border border-zinc-300 rounded-2xl p-3">
            <option value="">Select medication</option>
            <option>Paracetamol 500mg</option>
            <option>Lisinopril 10mg</option>
            <option>Metformin 500mg</option>
            <option>PRN Diazepam 5mg</option>
          </select>

          <div class="grid grid-cols-2 gap-3">
            <input type="text" id="med-dose" placeholder="Dose given"
                   class="w-full border border-zinc-300 rounded-2xl p-3">

            <select id="med-status" class="w-full border border-zinc-300 rounded-2xl p-3">
              <option value="Given">Given</option>
              <option value="Refused">Refused</option>
              <option value="Missed">Missed</option>
              <option value="PRN">PRN</option>
              <option value="Held">Held</option>
            </select>
          </div>

          <input type="text" id="med-prn" placeholder="PRN reason, when applicable"
                 class="w-full border border-zinc-300 rounded-2xl p-3">

          <textarea id="med-notes" placeholder="Notes and observations" rows="3"
                    class="w-full border border-zinc-300 rounded-2xl p-3"></textarea>

          <p id="med-message" class="text-sm min-h-5" role="status"></p>

          <button type="button" id="save-medication"
                  class="w-full bg-[#218BC4] text-white py-4 rounded-2xl font-semibold">
            Save medication log
          </button>
        </div>
      </div>
    </section>

    <!-- NOTES -->
    <section id="notes-panel" class="p-4 hidden-panel">
      <div class="bg-white rounded-3xl border border-zinc-200 shadow-sm p-5 mb-4">
        <h2 class="text-2xl font-bold text-[#003A70] mb-1">Progress Notes</h2>
        <p class="text-sm text-zinc-500 mb-4">Evelyn Tait</p>

        <div class="space-y-3">
          <select id="note-category" class="w-full border border-zinc-300 rounded-2xl p-3">
            <option>Daily Support</option>
            <option>Behaviour</option>
            <option>Health/Medical</option>
            <option>Incident</option>
            <option>Goal Progress</option>
            <option>Handover</option>
            <option>Other</option>
          </select>

          <select id="note-importance" class="w-full border border-zinc-300 rounded-2xl p-3">
            <option>Normal</option>
            <option>Important</option>
            <option>Critical</option>
          </select>

          <textarea id="note-content" placeholder="Write a factual progress note..." rows="7"
                    class="w-full border border-zinc-300 rounded-2xl p-3"></textarea>

          <p id="note-message" class="text-sm min-h-5" role="status"></p>

          <button type="button" id="save-note"
                  class="w-full bg-[#8247A4] text-white py-4 rounded-2xl font-semibold">
            Save progress note
          </button>
        </div>
      </div>

      <div class="bg-white rounded-3xl border border-zinc-200 shadow-sm p-5">
        <h3 class="font-bold text-[#003A70] mb-3">Latest notes</h3>

        <div id="notes-list" class="space-y-3">
          <div class="border border-zinc-200 rounded-2xl p-4">
            <div class="flex justify-between gap-2">
              <p class="font-bold">Daily Support</p>
              <p class="text-xs text-zinc-500">8:35 am</p>
            </div>
            <p class="text-sm text-zinc-500 mb-2">Written by Candice</p>
            <p class="text-sm">Evelyn presented in a positive mood and completed her morning routine.</p>
          </div>
        </div>
      </div>
    </section>
  </main>

  <nav class="fixed left-0 right-0 bottom-0 bg-white border-t border-zinc-200 px-2 pt-2 pb-[max(8px,env(safe-area-inset-bottom))] z-30">
    <div class="max-w-md mx-auto grid grid-cols-5 gap-1">
      <button type="button" data-tab="home" class="nav-button active py-2 text-xs">
        <span class="block text-xl">🏠</span>Home
      </button>

      <button type="button" data-tab="roster" class="nav-button py-2 text-xs">
        <span class="block text-xl">📅</span>Roster
      </button>

      <button type="button" data-tab="clients" class="nav-button py-2 text-xs">
        <span class="block text-xl">👤</span>Clients
      </button>

      <button type="button" data-tab="meds" class="nav-button py-2 text-xs">
        <span class="block text-xl">💊</span>Meds
      </button>

      <button type="button" data-tab="notes" class="nav-button py-2 text-xs">
        <span class="block text-xl">📝</span>Notes
      </button>
    </div>
  </nav>

  <script>
    /*
      Add your browser-safe Supabase Project URL and anon/publishable key later.
      Never paste a service_role key into this file.
    */
    const SUPABASE_URL = 'PASTE_YOUR_SUPABASE_URL_HERE';
    const SUPABASE_KEY = 'PASTE_YOUR_SUPABASE_ANON_KEY_HERE';

    const isConfigured =
      !SUPABASE_URL.includes('PASTE_') &&
      !SUPABASE_KEY.includes('PASTE_');

    const supabaseClient = isConfigured
      ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
      : null;

    const panelNames = ['home', 'roster', 'clients', 'meds', 'notes'];

    function showPanel(panelName) {
      panelNames.forEach(name => {
        document.getElementById(`${name}-panel`)
          .classList.toggle('hidden-panel', name !== panelName);
      });

      document.querySelectorAll('[data-tab]').forEach(button => {
        button.classList.toggle('active', button.dataset.tab === panelName);
      });

      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    document.querySelectorAll('[data-tab]').forEach(button => {
      button.addEventListener('click', () => showPanel(button.dataset.tab));
    });

    document.querySelectorAll('[data-open]').forEach(button => {
      button.addEventListener('click', () => showPanel(button.dataset.open));
    });

    document.getElementById('notifications-button').addEventListener('click', () => {
      alert('1 shift is awaiting acceptance. 1 progress note is outstanding.');
    });

    document.getElementById('show-shift-form').addEventListener('click', () => {
      document.getElementById('shift-form').classList.toggle('hidden-panel');
    });

    document.querySelectorAll('.client-action').forEach(button => {
      button.addEventListener('click', () => {
        alert('This client section will be connected in the next build.');
      });
    });

    function setMessage(elementId, text, isError = false) {
      const element = document.getElementById(elementId);
      element.textContent = text;
      element.className = isError
        ? 'text-sm min-h-5 text-red-600 font-semibold'
        : 'text-sm min-h-5 text-emerald-700 font-semibold';
    }

    document.getElementById('create-shift').addEventListener('click', async () => {
      const client = document.getElementById('shift-client').value;
      const worker = document.getElementById('shift-worker').value;
      const date = document.getElementById('shift-date').value;
      const start = document.getElementById('shift-start').value;
      const finish = document.getElementById('shift-finish').value;
      const instructions = document.getElementById('shift-instructions').value.trim();

      if (!worker || !date || !start || !finish) {
        setMessage('shift-message', 'Please complete the worker, date and shift times.', true);
        return;
      }

      const shiftCard = document.createElement('div');
      shiftCard.className = 'border border-zinc-200 rounded-2xl p-4';
      shiftCard.innerHTML = `
        <div class="flex justify-between gap-3">
          <div>
            <p class="font-bold">${start}–${finish}</p>
            <p class="text-sm text-zinc-500">${client} · ${worker}</p>
            ${instructions ? `<p class="text-xs text-zinc-500 mt-2">${instructions}</p>` : ''}
          </div>
          <span class="status-pill pending">Awaiting</span>
        </div>
      `;

      document.getElementById('shift-list').appendChild(shiftCard);
      setMessage('shift-message', 'Shift created. In the live app, the worker will receive a notification.');

      if (supabaseClient) {
        const { error } = await supabaseClient.from('shifts').insert({
          client_name: client,
          worker_name: worker,
          shift_date: date,
          start_time: start,
          finish_time: finish,
          instructions,
          status: 'pending'
        });

        if (error) {
          setMessage('shift-message', `Shift appears on-screen but Supabase did not save it: ${error.message}`, true);
        }
      }
    });

    document.querySelectorAll('.accept-shift').forEach(button => {
      button.addEventListener('click', event => {
        const card = event.target.closest('.border');
        const pill = card.querySelector('.status-pill');
        pill.textContent = 'Accepted';
        pill.className = 'status-pill accepted';
        event.target.parentElement.remove();
        alert('Shift marked accepted. The supervisor would receive a notification.');
      });
    });

    document.querySelectorAll('.decline-shift').forEach(button => {
      button.addEventListener('click', event => {
        const card = event.target.closest('.border');
        const pill = card.querySelector('.status-pill');
        pill.textContent = 'Declined';
        pill.className = 'status-pill declined';
        event.target.parentElement.remove();
        alert('Shift marked declined. The supervisor would receive a notification.');
      });
    });

    document.getElementById('save-medication').addEventListener('click', async () => {
      const time = document.getElementById('med-time').value;
      const name = document.getElementById('med-name').value;
      const dose = document.getElementById('med-dose').value.trim();
      const status = document.getElementById('med-status').value;
      const prn = document.getElementById('med-prn').value.trim();
      const notes = document.getElementById('med-notes').value.trim();

      if (!name || !dose) {
        setMessage('med-message', 'Please select the medication and record the dose.', true);
        return;
      }

      if (['Refused', 'Missed', 'Held', 'PRN'].includes(status) && !notes && !prn) {
        setMessage('med-message', 'Please record a reason or observation for this outcome.', true);
        return;
      }

      if (!supabaseClient) {
        setMessage('med-message', 'The form works, but Supabase has not been connected to this version yet.', true);
        return;
      }

      const { error } = await supabaseClient.from('medication_log').insert({
        client_name: 'Evelyn Tait',
        administered_at: time || new Date().toISOString(),
        medication_name: name,
        dose_given: dose,
        status,
        prn_reason: prn || null,
        observations: notes || null
      });

      if (error) {
        setMessage('med-message', `Could not save: ${error.message}`, true);
        return;
      }

      setMessage('med-message', 'Medication entry saved.');
      document.getElementById('med-dose').value = '';
      document.getElementById('med-prn').value = '';
      document.getElementById('med-notes').value = '';
    });

    document.getElementById('save-note').addEventListener('click', async () => {
      const category = document.getElementById('note-category').value;
      const importance = document.getElementById('note-importance').value;
      const content = document.getElementById('note-content').value.trim();

      if (!content) {
        setMessage('note-message', 'Please write a progress note.', true);
        return;
      }

      const noteCard = document.createElement('div');
      noteCard.className = 'border border-zinc-200 rounded-2xl p-4';
      noteCard.innerHTML = `
        <div class="flex justify-between gap-2">
          <p class="font-bold">${category}</p>
          <p class="text-xs text-zinc-500">Just now</p>
        </div>
        <p class="text-sm text-zinc-500 mb-2">Written by Candice · ${importance}</p>
        <p class="text-sm"></p>
      `;
      noteCard.querySelector('p:last-child').textContent = content;
      document.getElementById('notes-list').prepend(noteCard);

      if (!supabaseClient) {
        setMessage('note-message', 'The note appears on-screen, but Supabase has not been connected to this version yet.', true);
        document.getElementById('note-content').value = '';
        return;
      }

      const { error } = await supabaseClient.from('progress_notes').insert({
        client_name: 'Evelyn Tait',
        category,
        importance,
        content
      });

      if (error) {
        setMessage('note-message', `The note appears on-screen but Supabase did not save it: ${error.message}`, true);
        return;
      }

      setMessage('note-message', 'Progress note saved.');
      document.getElementById('note-content').value = '';
    });

    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById('med-time').value = now.toISOString().slice(0, 16);

    const today = new Date().toISOString().slice(0, 10);
    document.getElementById('shift-date').value = today;

    showPanel('home');
  </script>
</body>
</html>
'''

path = Path("/mnt/data/I-Care-Connect-index-v0.3.html")
path.write_text(html, encoding="utf-8")
print(f"Created {path}")
