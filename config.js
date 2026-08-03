window.FLORENCE_CONFIG = {
  organisationName: "I-Care Connect",

  supabaseUrl: "https://pbbsaquwumxyrhqhnobv.supabase.co",
  supabaseAnonKey: "sb_publishable_4D2Oc8FJjOXDXgGG7GbzfA_oYRpXSU5",
  functionRegion: "ap-southeast-2",
  pushVapidPublicKey: "BCDGKAl9z7iB38nlV19HFEaj8k-v-4B-" +
    "nFMLTqGWYS6sKG39imwkxBcsbcA663HETK2F2OSDDfY87Ay3JnOQSmg",

  storageBucket: "florence-private",
  maxDocumentBytes: 8 * 1024 * 1024,

  xero: {
    clientId: "",
    redirectUri: "",
    tenantId: ""
  },

  acceptedDocumentTypes: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "image/jpeg",
    "image/png",
    "image/heic",
    "text/plain"
  ]
};

// Keep privileged Florence Edge Function processing in the same Sydney region as
// the PostgreSQL database and keep sessions persistent across ordinary reloads.
(() => {
  const api = window.supabase;
  if (!api?.createClient || api.__florenceRegionPinned) return;

  const createClient = api.createClient.bind(api);
  api.createClient = (url, key, options = {}) => {
    const supplied = options && typeof options === "object" ? options : {};
    const suppliedAuth = supplied.auth && typeof supplied.auth === "object" ? supplied.auth : {};
    const client = createClient(url, key, {
      ...supplied,
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.localStorage,
        storageKey: "florence-auth-session",
        ...suppliedAuth
      }
    });
    const functions = client?.functions;
    if (!functions?.invoke || functions.__florenceRegionPinned) return client;

    const invoke = functions.invoke.bind(functions);
    functions.invoke = (functionName, invokeOptions = {}) => {
      const safeOptions = invokeOptions && typeof invokeOptions === "object" ? invokeOptions : {};
      return invoke(functionName, {
        ...safeOptions,
        region: safeOptions.region || window.FLORENCE_CONFIG.functionRegion
      });
    };
    functions.__florenceRegionPinned = true;
    return client;
  };

  api.__florenceRegionPinned = true;
})();

// Core push controls. These live inside config.js so Florence cannot lose them
// through an optional module, stale script filename or Home Screen cache mismatch.
(() => {
  const q = selector => document.querySelector(selector);
  const isiOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isStandalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

  function bridge() { return window.FlorenceBridge; }
  function toast(message) {
    const b = bridge();
    if (b?.toast) return b.toast(message);
    const el = q("#toast");
    if (!el) return;
    el.textContent = message;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 2500);
  }
  function decodeKey(value) {
    const padding = "=".repeat((4 - value.length % 4) % 4);
    const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
    return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  }
  function supported() {
    return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  }
  function ensurePanel() {
    const host = q("#my-account-view");
    if (!host) return null;
    let panel = q("#push-notification-panel");
    if (panel) return panel;
    panel = document.createElement("article");
    panel.id = "push-notification-panel";
    panel.className = "panel staff-only";
    panel.innerHTML = `<div class="panel-head"><div><p class="eyebrow">Device alerts</p><h3>Push notifications</h3><p id="push-notification-message">Loading notification controls…</p></div><span id="push-notification-status" class="badge amber">Loading…</span></div><div class="actions"><button id="enable-push-notifications" type="button" class="primary">Enable notifications</button><button id="test-push-notifications" type="button" class="secondary" disabled>Test this device</button><button id="disable-push-notifications" type="button" class="secondary" disabled>Disable on this device</button></div><p class="record-meta">Lock-screen alerts do not show participant names, medication names or note contents.</p>`;
    const heading = host.querySelector(".page-head");
    if (heading?.nextSibling) host.insertBefore(panel, heading.nextSibling);
    else host.prepend(panel);
    return panel;
  }
  async function currentState() {
    if (!supported()) return { supported: false };
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    const b = bridge();
    let saved = null;
    if (subscription && b?.db && b?.profile) {
      const { data, error } = await b.db.from("push_subscriptions")
        .select("id,active")
        .eq("endpoint", subscription.endpoint)
        .eq("user_id", b.profile.id)
        .maybeSingle();
      if (error) throw error;
      saved = data || null;
    }
    return { supported: true, registration, subscription, saved };
  }
  async function saveSubscription(subscription) {
    const b = bridge();
    if (!b?.db || !b?.profile) throw new Error("Florence is still loading your account. Try again in a moment.");
    const data = subscription.toJSON();
    const { error } = await b.db.from("push_subscriptions").upsert({
      organisation_id: b.profile.organisation_id,
      user_id: b.profile.id,
      endpoint: data.endpoint,
      p256dh: data.keys?.p256dh,
      auth_secret: data.keys?.auth,
      user_agent: navigator.userAgent,
      active: true,
      updated_at: new Date().toISOString()
    }, { onConflict: "endpoint" });
    if (error) throw error;
  }
  async function enablePush() {
    if (!supported()) throw new Error("This device does not support Florence push notifications.");
    if (isiOS && !isStandalone) throw new Error("Open Florence from its Home Screen icon before enabling notifications.");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("Notification permission was not granted.");
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (subscription) await subscription.unsubscribe();
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeKey(window.FLORENCE_CONFIG.pushVapidPublicKey)
    });
    await saveSubscription(subscription);
    await registration.showNotification("Florence notifications enabled", {
      body: "This device is now registered for private Florence alerts.",
      icon: "./florence-icon.svg",
      badge: "./florence-icon.svg",
      tag: "florence-enabled",
      data: { url: "./" }
    });
  }
  async function disablePush() {
    const state = await currentState();
    const b = bridge();
    if (state.subscription && b?.db && b?.profile) {
      await b.db.from("push_subscriptions")
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq("endpoint", state.subscription.endpoint)
        .eq("user_id", b.profile.id);
    }
    if (state.subscription) await state.subscription.unsubscribe();
  }
  async function testPush() {
    const state = await currentState();
    if (!state.subscription || !state.saved?.active) throw new Error("This device is not registered yet. Tap Enable notifications first.");
    await state.registration.showNotification("Florence device test", {
      body: "Push notifications are working on this device.",
      icon: "./florence-icon.svg",
      badge: "./florence-icon.svg",
      tag: "florence-device-test",
      data: { url: "./" }
    });
  }
  async function renderPushPanel() {
    const panel = ensurePanel();
    if (!panel) return false;
    const b = bridge();
    const status = q("#push-notification-status");
    const message = q("#push-notification-message");
    const enable = q("#enable-push-notifications");
    const test = q("#test-push-notifications");
    const disable = q("#disable-push-notifications");
    if (!b?.profile) {
      status.textContent = "Loading…";
      message.textContent = "Florence is finishing your secure account setup…";
      return false;
    }
    if (!["staff", "supervisor"].includes(b.profile.role)) {
      panel.classList.add("hidden");
      return true;
    }
    panel.classList.remove("hidden");
    const state = await currentState().catch(() => ({ supported: supported(), subscription: null, saved: null }));
    const registered = Boolean(state.subscription && state.saved?.active);
    const permission = window.Notification?.permission || "default";
    status.textContent = registered ? "Registered" : permission === "granted" ? "Permission only" : "Not enabled";
    status.className = `badge ${registered ? "good" : "amber"}`;
    message.textContent = !state.supported ? "This device does not support Florence push notifications." : registered ? "This device is securely registered for Florence alerts." : permission === "granted" ? "Your phone allows alerts, but Florence still needs to register this device. Tap Enable notifications." : "Enable private alerts for shifts, medication tasks and care updates.";
    enable.disabled = registered;
    test.disabled = !registered;
    disable.disabled = !state.subscription;
    enable.onclick = async () => { try { await enablePush(); toast("Florence notifications enabled"); await renderPushPanel(); } catch (error) { toast(error?.message || "Florence could not enable notifications"); } };
    test.onclick = async () => { try { await testPush(); toast("Test notification sent"); } catch (error) { toast(error?.message || "Florence could not test this device"); } };
    disable.onclick = async () => { try { await disablePush(); toast("Notifications disabled on this device"); await renderPushPanel(); } catch (error) { toast(error?.message || "Florence could not disable notifications"); } };
    return true;
  }
  function startPushPanel() {
    ensurePanel();
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      void renderPushPanel().then(done => {
        if (done || attempts >= 240) clearInterval(timer);
      });
    }, 250);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startPushPanel, { once: true });
  else startPushPanel();
  window.addEventListener("pageshow", startPushPanel);
  document.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-view="my-account"]')) setTimeout(startPushPanel, 50);
  });
})();

// Load the remaining optional Florence runtime modules.
(() => {
  const modules = [
    "setup-code-display.js?v=20260802-1",
    "portal-participant-label.js?v=20260802-2",
    "portal-care-plan.js?v=20260803-2",
    "participant-file.js?v=20260803-1",
    "secure-document-careplan-fix.js?v=20260803-1",
    "participant-edit-controls.js?v=20260803-1",
    "medication-prn-fix.js?v=20260802-1",
    "regular-medication-tab.js?v=20260802-1",
    "florence-readiness-controls.js?v=20260802-1",
    "remote-s8-verification.js?v=20260802-1"
  ];
  const load = () => {
    for (const src of modules) {
      const path = src.split("?")[0];
      if ([...document.scripts].some(script => (script.getAttribute("src") || "").includes(path))) continue;
      const script = document.createElement("script");
      script.src = src;
      script.defer = true;
      script.dataset.florenceRuntime = path;
      document.head.appendChild(script);
    }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load, { once: true });
  else load();
})();
