index.html
<!DOCTYPE html>
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
 
    .safe-top { padding-top: max(18px, env(safe-area-inset-top)); }
    .safe-bottom { padding-bottom: max(86px, calc(env(safe-area-inset-bottom) + 74px)); }
    .hidden { display: none !important; }
 
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
      padding: 5px 9px;
      font-size: 12px;
      font-weight: 800;
    }
 
    .accepted { background: #E1F5E9; color: var(--green); }
    .pending { background: #FFF1D4; color: #8B5700; }
    .declined, .cancelled { background: #FDE5E5; color: var(--red); }
    .scheduled { background: #EEF0F2; color: #667780; }
 
    input, select, textarea {
      color: #263238;
      background: white;
    }
 
    button:disabled {
      opacity: .5;
      cursor: not-allowed;
    }
  </style>
</head>
 
<body>
  <!-- LOGIN -->
  <section id="login-screen"
           class="min-h-screen safe-top px-5 flex items-center justify-center bg-gradient-to-br from-[#EAF4FA] to-purple-50">
    <div class="w-full max-w-sm bg-white rounded-3xl shadow-xl border-t-8 border-[#8247A4] p-6">
      <div class="text-center mb-6">
        <div class="mx-auto w-20 h-20 rounded-3xl bg-gradient-to-br from-[#003A70] to-[#8247A4] text-white flex items-center justify-center text-4xl mb-3">
          ♡
        </div>
        <h1 class="text-3xl font-bold text-[#003A70]">I-Care Connect</h1>
        <p class="text-zinc-500 text-sm mt-1">Secure staff portal</p>
      </div>
 
      <form id="login-form" class="space-y-3">
        <label class="block text-sm font-semibold text-[#003A70]" for="login-email">
          Email address
        </label>
        <input id="login-email"
               type="email"
               autocomplete="email"
               required
               class="w-full border border-zinc-300 rounded-2xl p-3"
               placeholder="staff@example.com">
 
        <label class="block text-sm font-semibold text-[#003A70]" for="login-password">
          Password
        </label>
        <input id="login-password"
               type="password"
               autocomplete="current-password"
               minlength="8"
               required
               class="w-full border border-zinc-300 rounded-2xl p-3"
               placeholder="Password">
 
        <p id="login-message" class="text-sm min-h-5" role="status"></p>
 
        <button id="login-button"
                type="submit"
                class="w-full bg-[#003A70] text-white rounded-2xl py-4 font-semibold">
          Sign in
        </button>
      </form>
    </div>
  </section>
 
  <!-- APP -->
  <div id="app-shell" class="hidden">
    <main class="max-w-md mx-auto min-h-screen bg-[#F7F5F2] safe-bottom">
      <header class="safe-top px-5 pb-5 text-white bg-gradient-to-br from-[#003A70] to-[#218BC4]">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-2xl font-bold">I-Care Connect</h1>
            <p id="header-role" class="text-blue-100 text-sm mt-1">Loading profile…</p>
          </div>
 
          <button type="button"
                  id="sign-out-button"
                  class="rounded-2xl px-3 py-2 bg-white/15 text-sm font-semibold">
            Sign out
          </button>
        </div>
      </header>
 
      <!-- HOME -->
      <section id="home-panel" class="p-4">
        <div class="mb-4">
          <h2 id="welcome-name" class="text-2xl font-bold text-[#003A70]">Welcome</h2>
          <p class="text-zinc-500 text-sm">Today at a glance</p>
        </div>
 
        <div id="supervisor-card"
             class="hidden bg-white rounded-3xl border-l-4 border-[#8247A4] shadow-sm p-5 mb-4">
          <h3 class="font-bold text-[#003A70] mb-3">Supervisor overview</h3>
 
          <div class="grid grid-cols-2 gap-3">
            <button data-open="roster"
                    class="rounded-2xl border border-zinc-200 p-3 text-left">
              <strong id="pending-count" class="block text-2xl text-amber-700">0</strong>
              <span class="text-sm">Pending shifts</span>
            </button>
 
            <button data-open="clients"
                    class="rounded-2xl border border-zinc-200 p-3 text-left">
              <strong id="client-count" class="block text-2xl text-[#218BC4]">0</strong>
              <span class="text-sm">Active clients</span>
            </button>
          </div>
        </div>
 
        <div class="bg-white rounded-3xl border border-zinc-200 shadow-sm p-5 mb-4">
          <h3 class="font-bold text-[#003A70] mb-3">My next shift</h3>
          <div id="next-shift">
            <p class="text-zinc-500 text-sm">Loading roster…</p>
          </div>
        </div>
 
        <div class="grid grid-cols-2 gap-3">
          <button data-open="clients"
                  class="bg-[#218BC4] text-white rounded-2xl py-4 font-semibold">
            Open clients
          </button>
 
          <button data-open="roster"
                  class="bg-[#8247A4] text-white rounded-2xl py-4 font-semibold">
            Open roster
          </button>
 
          <button data-open="meds"
                  class="bg-[#003A70] text-white rounded-2xl py-4 font-semibold">
            Medication
          </button>
 
          <button data-open="notes"
                  class="bg-emerald-700 text-white rounded-2xl py-4 font-semibold">
            Progress notes
          </button>
        </div>
      </section>
 
      <!-- ROSTER -->
      <section id="roster-panel" class="hidden p-4">
        <div class="mb-4">
          <h2 class="text-2xl font-bold text-[#003A70]">Roster</h2>
          <p class="text-zinc-500 text-sm">Seven-day shift view</p>
        </div>
 
        <div id="supervisor-roster-tools"
             class="hidden bg-white rounded-3xl border-l-4 border-[#8247A4] shadow-sm p-5 mb-4">
          <h3 class="font-bold text-[#003A70] mb-3">Supervisor tools</h3>
          <button id="show-create-shift"
                  class="w-full bg-[#8247A4] text-white rounded-2xl py-3 font-semibold">
            Create shift
          </button>
        </div>
 
        <div id="create-shift-form"
             class="hidden bg-white rounded-3xl border border-zinc-200 shadow-sm p-5 mb-4">
          <div class="space-y-3">
            <select id="shift-client" class="w-full border border-zinc-300 rounded-2xl p-3">
              <option value="">Select client</option>
            </select>
 
            <select id="shift-worker" class="w-full border border-zinc-300 rounded-2xl p-3">
              <option value="">Select worker</option>
            </select>
 
            <input id="shift-start" type="datetime-local"
                   class="w-full border border-zinc-300 rounded-2xl p-3">
 
            <input id="shift-end" type="datetime-local"
                   class="w-full border border-zinc-300 rounded-2xl p-3">
 
            <select id="shift-type" class="w-full border border-zinc-300 rounded-2xl p-3">
              <option value="SIL">SIL</option>
              <option value="sleepover">Sleepover</option>
              <option value="active_overnight">Active overnight</option>
              <option value="community_access">Community access</option>
              <option value="social_support">Social support</option>
            </select>
 
            <textarea id="shift-instructions"
                      rows="3"
                      placeholder="Shift instructions"
                      class="w-full border border-zinc-300 rounded-2xl p-3"></textarea>
 
            <p id="shift-form-message" class="text-sm min-h-5"></p>
 
            <button id="save-shift"
                    class="w-full bg-[#8247A4] text-white rounded-2xl py-4 font-semibold">
              Publish shift
            </button>
          </div>
        </div>
 
        <div id="roster-list" class="space-y-3">
          <div class="bg-white rounded-3xl p-5 text-zinc-500">Loading shifts…</div>
        </div>
      </section>
 
      <!-- CLIENTS -->
      <section id="clients-panel" class="hidden p-4">
        <div class="mb-4">
          <h2 class="text-2xl font-bold text-[#003A70]">Clients</h2>
          <p class="text-zinc-500 text-sm">Authorised client access</p>
        </div>
 
        <div id="clients-list" class="space-y-3">
          <div class="bg-white rounded-3xl p-5 text-zinc-500">Loading clients…</div>
        </div>
      </section>
 
      <!-- MEDS -->
      <section id="meds-panel" class="hidden p-4">
        <div class="mb-4">
          <h2 class="text-2xl font-bold text-[#003A70]">Medication & MAR</h2>
          <p class="text-zinc-500 text-sm">Live medication rounds are the next connection.</p>
        </div>
 
        <div class="bg-white rounded-3xl border border-zinc-200 shadow-sm p-5">
          <p class="text-sm text-zinc-600">
            The medication database is ready. The next code update will display scheduled
            rounds and allow authorised workers to sign each MAR entry.
          </p>
        </div>
      </section>
 
      <!-- NOTES -->
      <section id="notes-panel" class="hidden p-4">
        <div class="mb-4">
          <h2 class="text-2xl font-bold text-[#003A70]">Progress Notes</h2>
          <p class="text-zinc-500 text-sm">Live note forms are the next connection.</p>
        </div>
 
        <div class="bg-white rounded-3xl border border-zinc-200 shadow-sm p-5">
          <p class="text-sm text-zinc-600">
            The progress-note and handover database is ready. The next update will save
            signed notes directly to Supabase.
          </p>
        </div>
      </section>
    </main>
 
    <nav class="fixed left-0 right-0 bottom-0 bg-white border-t border-zinc-200 px-2 pt-2 pb-[max(8px,env(safe-area-inset-bottom))] z-30">
      <div class="max-w-md mx-auto grid grid-cols-5 gap-1">
        <button data-tab="home" class="nav-button active py-2 text-xs">
          <span class="block text-xl">🏠</span>Home
        </button>
        <button data-tab="roster" class="nav-button py-2 text-xs">
          <span class="block text-xl">📅</span>Roster
        </button>
        <button data-tab="clients" class="nav-button py-2 text-xs">
          <span class="block text-xl">👤</span>Clients
        </button>
        <button data-tab="meds" class="nav-button py-2 text-xs">
          <span class="block text-xl">💊</span>Meds
        </button>
        <button data-tab="notes" class="nav-button py-2 text-xs">
          <span class="block text-xl">📝</span>Notes
        </button>
      </div>
    </nav>
  </div>
 
  <script>
    /*
      Replace both placeholders below with:
      1. Supabase Project URL
      2. Browser-safe anon or publishable key
 
      NEVER use the service_role key in GitHub or browser code.
    */
    const SUPABASE_URL = 'https://pbbsaquwumxyrhqhnobv.supabase.co';

const SUPABASE_KEY = 'sb_publishable_4D2Oc8FJjOXDXgGG7GbzfA_oYRpXSU5';
 
    const supabaseClient = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_KEY
    );
 
    let currentSession = null;
    let currentProfile = null;
    let currentRole = 'support_worker';
 
    const panelNames = ['home', 'roster', 'clients', 'meds', 'notes'];
 
    function setMessage(id, text, isError = false) {
      const element = document.getElementById(id);
      element.textContent = text;
      element.className = isError
        ? 'text-sm min-h-5 text-red-600 font-semibold'
        : 'text-sm min-h-5 text-emerald-700 font-semibold';
    }
 
    function showPanel(name) {
      panelNames.forEach(panel => {
        document.getElementById(`${panel}-panel`)
          .classList.toggle('hidden', panel !== name);
      });
 
      document.querySelectorAll('[data-tab]').forEach(button => {
        button.classList.toggle('active', button.dataset.tab === name);
      });
 
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
 
    document.querySelectorAll('[data-tab]').forEach(button => {
      button.addEventListener('click', () => showPanel(button.dataset.tab));
    });
 
    document.querySelectorAll('[data-open]').forEach(button => {
      button.addEventListener('click', () => showPanel(button.dataset.open));
    });
 
    document.getElementById('login-form').addEventListener('submit', async event => {
      event.preventDefault();
 
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const button = document.getElementById('login-button');
 
      button.disabled = true;
      setMessage('login-message', 'Signing in…');
 
      const { error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
      });
 
      button.disabled = false;
 
      if (error) {
        setMessage('login-message', error.message, true);
      }
    });
 
    document.getElementById('sign-out-button').addEventListener('click', async () => {
      await supabaseClient.auth.signOut();
    });
 
    async function loadProfile() {
      const { data, error } = await supabaseClient
        .from('profiles')
        .select('id, full_name, role, active')
        .eq('id', currentSession.user.id)
        .single();
 
      if (error) throw error;
      if (!data.active) throw new Error('This staff account is inactive.');
 
      currentProfile = data;
      currentRole = data.role;
 
      document.getElementById('welcome-name').textContent =
        `Welcome, ${data.full_name.split(' ')[0]}`;
 
      document.getElementById('header-role').textContent =
        data.role === 'support_worker'
          ? 'Support Worker'
          : data.role === 'supervisor'
            ? 'Supervisor'
            : 'Administrator';
 
      const management = ['supervisor', 'administrator'].includes(data.role);
 
      document.getElementById('supervisor-card')
        .classList.toggle('hidden', !management);
 
      document.getElementById('supervisor-roster-tools')
        .classList.toggle('hidden', !management);
    }
 
    async function loadClients() {
      const { data, error } = await supabaseClient
        .from('clients')
        .select('id, preferred_name, legal_name, address, health_alerts, active')
        .eq('active', true)
        .order('preferred_name');
 
      if (error) {
        document.getElementById('clients-list').innerHTML =
          `<div class="bg-red-50 text-red-700 rounded-3xl p-5">${error.message}</div>`;
        return;
      }
 
      document.getElementById('client-count').textContent = data.length;
 
      const list = document.getElementById('clients-list');
      list.innerHTML = '';
 
      if (!data.length) {
        list.innerHTML =
          '<div class="bg-white rounded-3xl p-5 text-zinc-500">No authorised clients yet.</div>';
        return;
      }
 
      data.forEach(client => {
        const card = document.createElement('article');
        card.className =
          'bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden';
 
        card.innerHTML = `
          <div class="bg-gradient-to-r from-[#218BC4] to-[#8247A4] p-5 text-white">
            <h3 class="text-xl font-bold"></h3>
            <p class="text-sm text-white/85">Active client</p>
          </div>
          <div class="p-5">
            <p class="text-sm text-zinc-500 mb-3"></p>
            <div class="grid grid-cols-2 gap-2">
              <button class="open-client-meds bg-[#003A70] text-white rounded-xl py-3 font-semibold">
                Medication
              </button>
              <button class="open-client-notes bg-[#8247A4] text-white rounded-xl py-3 font-semibold">
                Notes
              </button>
            </div>
          </div>
        `;
 
        card.querySelector('h3').textContent = client.preferred_name;
        card.querySelector('.p-5 > p').textContent =
          client.health_alerts || 'No health alert displayed';
 
        card.querySelector('.open-client-meds')
          .addEventListener('click', () => showPanel('meds'));
 
        card.querySelector('.open-client-notes')
          .addEventListener('click', () => showPanel('notes'));
 
        list.appendChild(card);
      });
 
      const clientSelect = document.getElementById('shift-client');
      clientSelect.innerHTML = '<option value="">Select client</option>';
 
      data.forEach(client => {
        const option = document.createElement('option');
        option.value = client.id;
        option.textContent = client.preferred_name;
        clientSelect.appendChild(option);
      });
    }
 
    async function loadWorkers() {
      if (!['supervisor', 'administrator'].includes(currentRole)) return;
 
      const { data, error } = await supabaseClient
        .from('profiles')
        .select('id, full_name, active')
        .eq('active', true)
        .order('full_name');
 
      if (error) return;
 
      const workerSelect = document.getElementById('shift-worker');
      workerSelect.innerHTML = '<option value="">Select worker</option>';
 
      data.forEach(worker => {
        const option = document.createElement('option');
        option.value = worker.id;
        option.textContent = worker.full_name;
        workerSelect.appendChild(option);
      });
    }
 
    function formatShiftDate(value) {
      return new Intl.DateTimeFormat('en-AU', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit'
      }).format(new Date(value));
    }
 
    async function loadRoster() {
      const now = new Date();
      const weekLater = new Date();
      weekLater.setDate(weekLater.getDate() + 7);
 
      const { data, error } = await supabaseClient
        .from('roster_shifts')
        .select(`
          id,
          start_time,
          end_time,
          shift_status,
          shift_type,
          instructions,
          cancelled_reason,
          client:clients(preferred_name),
          staff:profiles!roster_shifts_staff_id_fkey(full_name)
        `)
        .gte('start_time', now.toISOString())
        .lt('start_time', weekLater.toISOString())
        .order('start_time');
 
      const list = document.getElementById('roster-list');
 
      if (error) {
        list.innerHTML =
          `<div class="bg-red-50 text-red-700 rounded-3xl p-5">${error.message}</div>`;
        return;
      }
 
      const pending = data.filter(item => item.shift_status === 'pending').length;
      document.getElementById('pending-count').textContent = pending;
 
      list.innerHTML = '';
 
      if (!data.length) {
        list.innerHTML =
          '<div class="bg-white rounded-3xl p-5 text-zinc-500">No shifts scheduled in the next seven days.</div>';
        document.getElementById('next-shift').innerHTML =
          '<p class="text-zinc-500 text-sm">No upcoming shift found.</p>';
        return;
      }
 
      const firstShift = data[0];
      document.getElementById('next-shift').innerHTML = `
        <strong class="block text-[#003A70]">${firstShift.client?.preferred_name || 'Client'}</strong>
        <span class="text-sm text-zinc-500">${formatShiftDate(firstShift.start_time)}</span>
      `;
 
      data.forEach(shift => {
        const card = document.createElement('article');
        card.className =
          'bg-white rounded-3xl border border-zinc-200 shadow-sm p-5';
 
        const statusClass = ['accepted', 'pending', 'declined', 'cancelled']
          .includes(shift.shift_status)
            ? shift.shift_status
            : 'scheduled';
 
        card.innerHTML = `
          <div class="flex justify-between gap-3">
            <div>
              <h3 class="font-bold text-[#003A70]"></h3>
              <p class="text-sm text-zinc-500 shift-time"></p>
              <p class="text-sm text-zinc-500 shift-worker"></p>
              <p class="text-xs text-zinc-400 mt-1 shift-type"></p>
            </div>
            <span class="status-pill ${statusClass}">${shift.shift_status}</span>
          </div>
          <div class="shift-actions grid grid-cols-2 gap-2 mt-3"></div>
        `;
 
        card.querySelector('h3').textContent =
          shift.client?.preferred_name || 'Client';
 
        card.querySelector('.shift-time').textContent =
          `${formatShiftDate(shift.start_time)} – ${new Intl.DateTimeFormat('en-AU', {
            hour: 'numeric',
            minute: '2-digit'
          }).format(new Date(shift.end_time))}`;
 
        card.querySelector('.shift-worker').textContent =
          shift.staff?.full_name || 'Unassigned';
 
        card.querySelector('.shift-type').textContent = shift.shift_type;
 
        const actions = card.querySelector('.shift-actions');
 
        if (shift.shift_status === 'pending') {
          const accept = document.createElement('button');
          accept.className =
            'bg-green-600 text-white rounded-xl py-2 font-semibold';
          accept.textContent = 'Accept';
 
          accept.addEventListener('click', async () => {
            const { error } = await supabaseClient
              .from('roster_shifts')
              .update({
                shift_status: 'accepted',
                accepted_at: new Date().toISOString()
              })
              .eq('id', shift.id);
 
            if (error) alert(error.message);
            else await loadRoster();
          });
 
          const decline = document.createElement('button');
          decline.className =
            'bg-red-600 text-white rounded-xl py-2 font-semibold';
          decline.textContent = 'Decline';
 
          decline.addEventListener('click', async () => {
            const { error } = await supabaseClient
              .from('roster_shifts')
              .update({
                shift_status: 'declined',
                declined_at: new Date().toISOString()
              })
              .eq('id', shift.id);
 
            if (error) alert(error.message);
            else await loadRoster();
          });
 
          actions.append(accept, decline);
        }
 
        if (
          ['supervisor', 'administrator'].includes(currentRole) &&
          shift.shift_status !== 'cancelled'
        ) {
          const cancel = document.createElement('button');
          cancel.className =
            'col-span-2 border border-red-300 text-red-600 rounded-xl py-2 font-semibold';
          cancel.textContent = 'Cancel shift';
 
          cancel.addEventListener('click', async () => {
            const reason = prompt('Cancellation reason:');
            if (reason === null) return;
            if (!reason.trim()) {
              alert('A cancellation reason is required.');
              return;
            }
 
            const { error } = await supabaseClient
              .from('roster_shifts')
              .update({
                shift_status: 'cancelled',
                cancelled_reason: reason.trim()
              })
              .eq('id', shift.id);
 
            if (error) alert(error.message);
            else await loadRoster();
          });
 
          actions.appendChild(cancel);
        }
 
        list.appendChild(card);
      });
    }
 
    document.getElementById('show-create-shift').addEventListener('click', () => {
      document.getElementById('create-shift-form').classList.toggle('hidden');
    });
 
    document.getElementById('save-shift').addEventListener('click', async () => {
      const clientId = document.getElementById('shift-client').value;
      const staffId = document.getElementById('shift-worker').value;
      const start = document.getElementById('shift-start').value;
      const end = document.getElementById('shift-end').value;
      const shiftType = document.getElementById('shift-type').value;
      const instructions = document.getElementById('shift-instructions').value.trim();
 
      if (!clientId || !staffId || !start || !end) {
        setMessage(
          'shift-form-message',
          'Please complete the client, worker and shift times.',
          true
        );
        return;
      }
 
      const { error } = await supabaseClient
        .from('roster_shifts')
        .insert({
          client_id: clientId,
          staff_id: staffId,
          start_time: new Date(start).toISOString(),
          end_time: new Date(end).toISOString(),
          shift_type: shiftType,
          instructions: instructions || null,
          shift_status: 'pending',
          created_by: currentSession.user.id
        });
 
      if (error) {
        setMessage('shift-form-message', error.message, true);
        return;
      }
 
      setMessage('shift-form-message', 'Shift published.');
      await loadRoster();
    });
 
    async function startApp(session) {
      currentSession = session;
 
      document.getElementById('login-screen').classList.add('hidden');
      document.getElementById('app-shell').classList.remove('hidden');
 
      try {
        await loadProfile();
        await Promise.all([
          loadClients(),
          loadWorkers(),
          loadRoster()
        ]);
      } catch (error) {
        alert(error.message);
        await supabaseClient.auth.signOut();
      }
    }
 
    function stopApp() {
      currentSession = null;
      currentProfile = null;
 
      document.getElementById('app-shell').classList.add('hidden');
      document.getElementById('login-screen').classList.remove('hidden');
      document.getElementById('login-password').value = '';
      setMessage('login-message', '');
    }
 
    supabaseClient.auth.onAuthStateChange((_event, session) => {
      if (session) startApp(session);
      else stopApp();
    });
 
    async function initialise() {
      const { data } = await supabaseClient.auth.getSession();
 
      if (data.session) {
        await startApp(data.session);
      } else {
        stopApp();
      }
    }
 
    initialise();
  </script>
</body>
</html>

