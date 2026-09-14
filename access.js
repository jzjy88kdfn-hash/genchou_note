(() => {
  "use strict";
  const ACCESS_HASH = "ed946f65d2c785d90e827c5ffd879ce3b49c68d4c88013074176a7e73bc58bcf";
  const STORAGE_KEY = "ytm_genchou_access_until";
  const ACCESS_DAYS = 30;
  const scriptUrl = document.currentScript?.src || location.href;
  const isQuantityApp = location.pathname.includes("/paint-quantity/");
  const iconPath = isQuantityApp ? "./paint-quantity/icons/icon-192.png" : "./icons/icon-genchou-1254.png?v=1";
  const iconUrl = new URL(iconPath, scriptUrl).href;
  const escapeHtml = value => String(value || "").replace(/[&<>"']/g, char => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[char]);

  const style = document.createElement("style");
  style.textContent = `
    body.access-locked{overflow:hidden}
    body.access-locked>*:not(.accessGate):not(script){visibility:hidden}
    .accessGate{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:calc(24px + env(safe-area-inset-top)) 22px calc(24px + env(safe-area-inset-bottom));background:linear-gradient(180deg,#f4f6fa,#e7edf4);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Yu Gothic",sans-serif;color:#111827}
    .accessGate[hidden]{display:none}
    .accessPanel{visibility:visible;width:min(100%,390px);padding:26px 22px 22px;text-align:center;border:1px solid #cbd5e1;border-radius:22px;background:#fff;box-shadow:0 20px 50px rgba(17,24,39,.18)}
    .accessIcon{width:92px;height:92px;border-radius:20px;display:block;margin:0 auto 14px}
    .accessPanel h1{font-size:24px;line-height:1.3;margin:0 0 6px}
    .accessPanel p{font-size:13px;color:#667085;margin:0 0 20px}
    .accessPanel label{display:block;text-align:left;font-size:13px;font-weight:800;margin-bottom:5px}
    .accessInput{box-sizing:border-box;width:100%;height:58px;border:1px solid #b8c1cc;border-radius:12px;text-align:center;font-size:27px!important;font-weight:900;letter-spacing:.28em;padding-left:calc(10px + .28em);background:#fff;color:#111827}
    .accessButton{width:100%;height:52px;margin-top:12px;border:0;border-radius:12px;background:#173b63;color:#fff;font-size:17px;font-weight:800}
    .accessError{min-height:20px;color:#b42318;font-size:12px;font-weight:800;padding-top:8px}
  `;
  document.head.appendChild(style);

  const gate = document.createElement("section");
  gate.className = "accessGate";
  gate.setAttribute("aria-labelledby", "accessTitle");
  gate.innerHTML = `
    <form class="accessPanel" autocomplete="off">
      <img class="accessIcon" src="${iconUrl}" alt="">
      <h1 id="accessTitle">${escapeHtml(document.title)}</h1>
      <p>パスワードを入力してください</p>
      <label for="accessPassword">パスワード</label>
      <input id="accessPassword" class="accessInput" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="current-password" enterkeyhint="go" required>
      <button class="accessButton" type="submit">開く</button>
      <div class="accessError" role="alert" aria-live="polite"></div>
    </form>`;
  document.body.prepend(gate);

  const form = gate.querySelector("form");
  const input = gate.querySelector("#accessPassword");
  const error = gate.querySelector(".accessError");

  function unlock() {
    document.body.classList.remove("access-locked");
    gate.hidden = true;
  }

  async function sha256(value) {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  }

  const accessUntil = Number(localStorage.getItem(STORAGE_KEY));
  if (accessUntil > Date.now()) unlock();
  else {
    localStorage.removeItem(STORAGE_KEY);
    requestAnimationFrame(() => input.focus());
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    error.textContent = "";
    if (await sha256(input.value) === ACCESS_HASH) {
      localStorage.setItem(STORAGE_KEY, String(Date.now() + ACCESS_DAYS * 86400000));
      input.value = "";
      unlock();
      return;
    }
    input.value = "";
    error.textContent = "パスワードが違います";
    input.focus();
  });
})();
