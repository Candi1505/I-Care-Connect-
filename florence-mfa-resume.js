(() => {
  "use strict";

  const RESTART_KEY = "florence-mfa-explicit-restart";
  const originalFetch = window.fetch.bind(window);

  function requestDetails(input, init) {
    const url = new URL(typeof input === "string" ? input : input.url, location.href);
    const method = String(init?.method || (typeof input === "string" ? "GET" : input.method) || "GET").toUpperCase();
    return { url, method };
  }

  function newestUnverifiedTotp(factors) {
    return factors
      .filter(factor => factor?.factor_type === "totp" && String(factor.status).toLowerCase() !== "verified")
      .sort((left, right) => Date.parse(right.updated_at || right.created_at || 0) - Date.parse(left.updated_at || left.created_at || 0))[0];
  }

  window.fetch = async (input, init) => {
    const { url, method } = requestDetails(input, init);
    const response = await originalFetch(input, init);
    const isFlorenceAuth = url.origin === "https://pbbsaquwumxyrhqhnobv.supabase.co" && url.pathname.startsWith("/auth/v1/");

    if (!isFlorenceAuth) return response;

    if (method === "POST" && url.pathname === "/auth/v1/factors" && response.ok) {
      sessionStorage.removeItem(RESTART_KEY);
      return response;
    }

    if (method !== "GET" || url.pathname !== "/auth/v1/user" || !response.ok || sessionStorage.getItem(RESTART_KEY)) {
      return response;
    }

    try {
      const user = await response.clone().json();
      const factors = Array.isArray(user?.factors) ? user.factors : [];
      const hasVerifiedTotp = factors.some(factor => factor?.factor_type === "totp" && String(factor.status).toLowerCase() === "verified");
      const unfinished = hasVerifiedTotp ? null : newestUnverifiedTotp(factors);
      if (!unfinished) return response;

      user.factors = factors.map(factor => factor.id === unfinished.id ? { ...factor, status: "verified" } : factor);
      const headers = new Headers(response.headers);
      headers.delete("content-length");
      headers.delete("content-encoding");
      headers.set("content-type", "application/json");
      return new Response(JSON.stringify(user), {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch {
      return response;
    }
  };

  function enhanceResumeScreen() {
    const heading = [...document.querySelectorAll(".mfa-card h1")].find(node => node.textContent?.trim() === "Verify your sign-in");
    if (!heading || document.querySelector("[data-florence-mfa-restart]")) return;

    heading.textContent = "Finish your Florence setup";
    const intro = heading.nextElementSibling;
    if (intro) {
      intro.textContent = "Return to the newest Florence entry in your authenticator and enter its current six-digit code. A browser reload will no longer replace this setup.";
    }

    const signOut = [...document.querySelectorAll(".mfa-card button")].find(button => button.textContent?.trim() === "Sign out");
    if (!signOut) return;

    const restart = document.createElement("button");
    restart.type = "button";
    restart.className = "auth-link";
    restart.dataset.florenceMfaRestart = "true";
    restart.textContent = "Restart authenticator setup";
    restart.addEventListener("click", () => {
      sessionStorage.setItem(RESTART_KEY, "1");
      location.reload();
    });
    signOut.before(restart);

    const help = document.createElement("p");
    help.className = "mfa-gate-help";
    help.textContent = "Use the newest Florence entry. If several old entries exist and none works, restart once, then remove the older unfinished Florence entries from the authenticator app.";
    restart.before(help);
  }

  new MutationObserver(enhanceResumeScreen).observe(document.documentElement, { childList: true, subtree: true });
  enhanceResumeScreen();
})();
