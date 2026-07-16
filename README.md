index.html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>I-Care Connect</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
    <style>
        body { font-family: system-ui, -apple-system, sans-serif; }
    </style>
</head>
<body class="bg-zinc-950 text-white">
    <div class="max-w-md mx-auto min-h-screen bg-zinc-900">
        <!-- Header -->
        <div class="bg-zinc-950 px-4 py-5 border-b border-zinc-800 flex items-center justify-between">
            <div>
                <h1 class="text-2xl font-bold">I-Care Connect</h1>
                <p class="text-zinc-400 text-sm">SIL Support</p>
            </div>
        </div>

        <!-- Tabs -->
        <div class="flex border-b border-zinc-800 bg-zinc-950 text-sm">
    <button onclick="showTab('meds')" id="tab-meds"
            class="flex-1 py-3 font-medium">Log Meds</button>
    <button onclick="showTab('notes')" id="tab-notes"
            class="flex-1 py-3 font-medium">Progress Notes</button>
    <button onclick="showTab('roster')" id="tab-roster"
            class="flex-1 py-3 font-medium">Roster</button>
</div>

        <!-- Medication Log -->
        <div id="meds-tab" class="p-4">
            <h2 class="font-semibold mb-3">Log Medication Administration</h2>
            
            <div class="space-y-3">
                <input type="datetime-local" id="med-time" class="w-full bg-zinc-800 border border-zinc-700 rounded-2xl p-3 text-sm">
                
                <select id="med-name" class="w-full bg-zinc-800 border border-zinc-700 rounded-2xl p-3 text-sm">
                    <option value="">Select Medication</option>
                    <option>Paracetamol 500mg</option>
                    <option>Lisinopril 10mg</option>
                    <option>Metformin 500mg</option>
                    <option>PRN Diazepam 5mg</option>
                </select>

                <div class="grid grid-cols-2 gap-3">
                    <input type="text" id="med-dose" placeholder="Dose given" class="bg-zinc-800 border border-zinc-700 rounded-2xl p-3 text-sm">
                    <select id="med-status" class="bg-zinc-800 border border-zinc-700 rounded-2xl p-3 text-sm">
                        <option>Given</option>
                        <option>Refused</option>
                        <option>Missed</option>
                        <option>PRN</option>
                        <option>Held</option>
                    </select>
                </div>

                <input type="text" id="med-prn" placeholder="PRN Reason (if applicable)" class="w-full bg-zinc-800 border border-zinc-700 rounded-2xl p-3 text-sm">

                <textarea id="med-notes" placeholder="Notes / Observations" rows="3"
                          class="w-full bg-zinc-800 border border-zinc-700 rounded-2xl p-3 text-sm"></textarea>

                <button onclick="logMedication()"
                        class="w-full bg-blue-600 active:bg-blue-700 py-4 rounded-2xl font-semibold">
                    Save Medication Log
                </button>
            </div>
        </div>

        <!-- Progress Notes -->
        <div id="notes-tab" class="p-4 hidden">
            <h2 class="font-semibold mb-3">Add Progress Note</h2>
            
            <div class="space-y-3">
                <select id="note-category" class="w-full bg-zinc-800 border border-zinc-700 rounded-2xl p-3 text-sm">
                    <option>Daily Support</option>
                    <option>Behaviour</option>
                    <option>Health/Medical</option>
                    <option>Incident</option>
                    <option>Goal Progress</option>
                    <option>Handover</option>
                    <option>Other</option>
                </select>

                <select id="note-importance" class="w-full bg-zinc-800 border border-zinc-700 rounded-2xl p-3 text-sm">
                    <option>Normal</option>
                    <option>Important</option>
                    <option>Critical</option>
                </select>

                <textarea id="note-content" placeholder="Write your note here..." rows="5"
                          class="w-full bg-zinc-800 border border-zinc-700 rounded-2xl p-3 text-sm"></textarea>

                <button onclick="saveNote()"
                        class="w-full bg-emerald-600 active:bg-emerald-700 py-4 rounded-2xl font-semibold">
                    Save Progress Note
                </button>
            </div>
        </div>
    </div>

    <script>
        const SUPABASE_URL = 'https://pbbsaquwumumxyrhqhnobv.supabase.co';
        const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBiYnNhcXV3dW14eXJocWhub2J2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxNTg3MTAsImV4cCI6MjA5OTczNDcxMH0.Oyf71P2EmJ6LXOV0T8W5Fz-5jf1MK5KDALdN-MFUkYQ';
        
        const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

        function showTab(tab) {
            document.getElementById('meds-tab').classList.add('hidden');
            document.getElementById('notes-tab').classList.add('hidden');
            document.getElementById('tab-meds').classList.remove('border-b-2', 'border-blue-500');
            document.getElementById('tab-notes').classList.remove('border-b-2', 'border-blue-500');

            if (tab === 'meds') {
                document.getElementById('meds-tab').classList.remove('hidden');
                document.getElementById('tab-meds').classList.add('border-b-2', 'border-blue-500');
            } else {
                document.getElementById('notes-tab').classList.remove('hidden');
                document.getElementById('tab-notes').classList.add('border-b-2', 'border-blue-500');
            }
        }

        async function logMedication() {
            const time = document.getElementById('med-time').value;
            const name = document.getElementById('med-name').value;
            const dose = document.getElementById('med-dose').value;
            const status = document.getElementById('med-status').value;
            const prn = document.getElementById('med-prn').value;
            const notes = document.getElementById('med-notes').value;

            if (!name || !status) {
                alert("Please select medication and status");
                return;
            }

            const { error } = await supabase.from('medication_log').insert({
                administered_at: time || new Date().toISOString(),
                notes: `${name} | ${dose} | ${status} ${prn ? '| PRN: ' + prn : ''} ${notes ? '| ' + notes : ''}`
            });

            if (error) {
                alert("Error: " + error.message);
            } else {
                alert("Medication logged!");
                document.getElementById('med-dose').value = '';
                document.getElementById('med-prn').value = '';
                document.getElementById('med-notes').value = '';
            }
        }

        async function saveNote() {
            const category = document.getElementById('note-category').value;
            const importance = document.getElementById('note-importance').value;
            const content = document.getElementById('note-content').value;

            if (!content) {
                alert("Please write a note");
                return;
            }

            const { error } = await supabase.from('progress_notes').insert({
                category,
                importance,
                content
            });

            if (error) {
                alert("Error: " + error.message);
            } else {
                alert("Note saved!");
                document.getElementById('note-content').value = '';
            }
        }

        // Set default time
        window.onload = () => {
            const now = new Date();
            now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
            document.getElementById('med-time').value = now.toISOString().slice(0, 16);
            document.getElementById('tab-meds').classList.add('border-b-2', 'border-blue-500');
        }
    </script>
</body>
</html>
