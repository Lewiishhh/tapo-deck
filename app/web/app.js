(() => {
  const token = document.querySelector('meta[name="api-token"]').content;
  const state = {
    devices: [],
    authenticated: false,
    busy: false,
    broadcast: "255.255.255.255",
    version: "0.2.17.2",
  };
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];

  async function api(path, body) {
    const response = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Authorization": `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  }

  let toastTimer;
  function toast(message, error = false) {
    const node = $("#toast");
    node.textContent = message;
    node.style.background = error ? "#9e3e50" : "#252642";
    node.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove("visible"), 3500);
  }

  function setMessage(message, kind = "") {
    const node = $("#loginMessage");
    node.textContent = message;
    node.className = `form-message ${kind}`;
  }

  function setView(name) {
    $$(".view").forEach(view => view.classList.toggle("active", view.id === `view-${name}`));
    $$(".nav-item").forEach(button => button.classList.toggle("active", button.dataset.view === name));
    const active = $(`.nav-item[data-view="${name}"]`);
    $("#pageCrumb").textContent = active?.innerText.replace("›", "").trim() || "Setup & lights";
  }

  function renderStatus() {
    const reachable = state.devices.filter(device => device.online !== false).length;
    $("#foundCount").textContent = `${reachable} found`;
    $("#networkStatus").textContent = state.devices.length ? `${reachable} TAPO LIGHT${reachable === 1 ? "" : "S"} FOUND` : "LOCAL NETWORK";
    $("#loginForm").classList.toggle("hidden", state.authenticated);
    $("#savedCredential").classList.toggle("hidden", !state.authenticated);
    $("#buildVersion").textContent = state.version;
    $("#aboutVersion").textContent = state.version;
    $("#aboutVersionFooter").textContent = state.version;
    if (state.authenticated) {
      $("#loginPanel .panel-heading h2").textContent = "Signed in on this PC";
      $("#loginPanel .panel-heading p").textContent = "Your sign-in is encrypted locally and ready for bulb authentication.";
    } else {
      $("#loginPanel .panel-heading h2").textContent = "Tapo account";
      $("#loginPanel .panel-heading p").textContent = "Used to authenticate directly with bulbs over your local network.";
    }
  }

  function deviceCard(device) {
    const reachable = device.online !== false;
    const status = !reachable ? "Not reachable" : state.authenticated ? (device.state === true ? "ON" : device.state === false ? "OFF" : "CONNECTED") : "FOUND";
    const title = device.name && !/^L\d/i.test(device.name) ? device.name : `${device.model || "Tapo light"} · ${device.ip}`;
    const hue = Array.isArray(device.hsv) && device.hsv[1] > 0 ? `hsl(${device.hsv[0]}, 82%, 61%)` : "#e8ae45";
    return `<article class="device-card">
      <div class="bulb-icon" style="color:${hue}">☼</div>
      <div><div class="device-name">${escapeHtml(title)}</div><div class="device-meta">${escapeHtml(device.model || device.type || "Tapo device")} · ${escapeHtml(device.ip)}</div></div>
      <span class="device-status${reachable ? "" : " offline"}">${status}</span>
    </article>`;
  }

  function renderDevices() {
    const list = $("#deviceList");
    if (state.devices.length) {
      list.innerHTML = state.devices.map(deviceCard).join("");
    } else {
      list.innerHTML = `<div class="empty-card"><div class="empty-illustration">✦</div><strong>No lights found yet</strong><p>Switch the bulbs on, then select Find Tapo lights.</p></div>`;
    }
    renderStatus();
  }

  async function discover() {
    if (state.busy) return;
    state.busy = true;
    const button = $("#scanButton");
    const originalLabel = button.innerHTML;
    button.disabled = true;
    button.innerHTML = "Searching your network…";
    $("#scanMessage").textContent = "Searching your local network for Tapo bulbs…";
    try {
      const result = await api("/api/discover", { target: state.broadcast });
      state.devices = result.devices || [];
      renderDevices();
      const count = state.devices.filter(device => device.online !== false).length;
      $("#scanMessage").textContent = count ? `Found ${count} Tapo light${count === 1 ? "" : "s"}` : "No compatible bulbs replied. Check that they are powered on and try again.";
      toast(count ? `Found ${count} Tapo light${count === 1 ? "" : "s"}` : "No Tapo lights found", !count);
    } catch (error) {
      $("#scanMessage").textContent = error.message;
      toast(error.message, true);
    } finally {
      state.busy = false;
      button.disabled = false;
      button.innerHTML = originalLabel;
    }
  }

  async function refreshStatus() {
    if (!state.authenticated || !state.devices.length || state.busy) return;
    state.busy = true;
    try {
      const result = await api("/api/refresh", {});
      state.devices = result.devices || [];
      renderDevices();
    } catch (error) {
      toast(error.message, true);
    } finally {
      state.busy = false;
    }
  }

  async function bootstrap() {
    try {
      const data = await api("/api/bootstrap");
      state.authenticated = !!data.authenticated;
      state.devices = data.devices || [];
      state.broadcast = data.broadcast || state.broadcast;
      state.version = data.version || state.version;
      renderDevices();
      if (state.authenticated && state.devices.length) await refreshStatus();
      await discover();
    } catch (error) {
      $("#scanMessage").textContent = error.message;
      toast(error.message, true);
    }
  }

  document.addEventListener("click", async event => {
    const nav = event.target.closest("[data-view]");
    if (nav) setView(nav.dataset.view);
    if (event.target.closest("#scanButton")) await discover();
    if (event.target.closest("#logoutButton")) {
      const button = $("#logoutButton");
      button.disabled = true;
      try {
        await api("/api/logout", {});
        state.authenticated = false;
        $("#passwordInput").value = "";
        renderStatus();
        setMessage("Saved local credentials removed.", "success");
        toast("Saved sign-in removed from this PC");
      } catch (error) {
        toast(error.message, true);
      } finally {
        button.disabled = false;
      }
    }
  });

  $("#loginForm").addEventListener("submit", async event => {
    event.preventDefault();
    const button = event.submitter;
    const username = $("#usernameInput").value.trim();
    const passwordInput = $("#passwordInput");
    const password = passwordInput.value;
    button.disabled = true;
    button.textContent = "Checking local connection…";
    setMessage("Authenticating directly with a discovered bulb…");
    try {
      const result = await api("/api/login", { username, password });
      state.authenticated = true;
      passwordInput.value = "";
      renderStatus();
      setMessage(result.message, "success");
      await refreshStatus();
      toast("Signed in locally");
    } catch (error) {
      setMessage(error.message, "error");
      toast(error.message, true);
    } finally {
      button.disabled = false;
      button.textContent = "Secure local sign-in";
    }
  });

  bootstrap();
})();