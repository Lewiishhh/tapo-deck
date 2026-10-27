(() => {
  const token = document.querySelector('meta[name="api-token"]').content;
  const state = { devices: [], presets: [], authenticated: false, busy: false };
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

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
    toastTimer = setTimeout(() => node.classList.remove("visible"), 2600);
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
    $("#pageCrumb").textContent = active?.innerText.replace("›", "").trim() || "Dashboard";
  }

  function renderStatus() {
    const online = state.devices.filter(device => device.online !== false).length;
    const on = state.devices.filter(device => device.state === true).length;
    $("#statDevices").textContent = state.devices.length;
    $("#statOn").textContent = state.authenticated ? `${on} / ${state.devices.length}` : "—";
    $("#statConnection").textContent = state.authenticated ? "Connected" : "Not connected";
    $("#statCredential").textContent = state.authenticated ? "Credentials protected on this PC" : "Sign in locally to control lights";
    $(".network-pill").innerHTML = `<span class="online-dot"></span><span>${state.devices.length ? `${online} DEVICE${online === 1 ? "" : "S"} FOUND` : "HOME NETWORK"}</span>`;
    $("#loginForm").classList.toggle("hidden", state.authenticated);
    $("#savedCredential").classList.toggle("hidden", !state.authenticated);
    $("#setupPrereq").classList.toggle("hidden", state.authenticated);
    if (state.authenticated) {
      $("#loginPanel .panel-heading h2").textContent = "Signed in on this PC";
      $("#loginPanel .panel-heading p").textContent = "Credentials are encrypted locally and ready for bulb authentication.";
    } else {
      $("#loginPanel .panel-heading h2").textContent = "Tapo account";
      $("#loginPanel .panel-heading p").textContent = "Used to authenticate directly with bulbs over your local network.";
    }
  }

  function deviceCard(device, detailed = false) {
    const on = device.state === true;
    const status = device.online === false ? "Not reachable" : state.authenticated ? (on ? "ON" : "OFF") : "FOUND";
    const className = device.online === false ? "device-status offline" : "device-status";
    const title = device.name && !/^L\d/i.test(device.name) ? device.name : `${device.model || "Tapo light"} · ${device.ip}`;
    const hue = Array.isArray(device.hsv) && device.hsv[1] > 0 ? `hsl(${device.hsv[0]}, 82%, 61%)` : "#e8ae45";
    return `<article class="device-card">
      <div class="bulb-icon" style="color:${hue}">☼</div>
      <div><div class="device-name">${escapeHtml(title)}</div><div class="device-meta">${escapeHtml(device.model || device.type || "Tapo device")} · ${escapeHtml(device.ip)}${device.mac ? ` · ${escapeHtml(device.mac)}` : ""}</div></div>
      <span class="${className}">${status}</span>
      ${detailed ? `<div class="device-mini-controls"><button class="mini-button" data-device="${escapeHtml(device.ip)}" data-control="on">On</button><button class="mini-button" data-device="${escapeHtml(device.ip)}" data-control="off">Off</button><button class="mini-button" data-device="${escapeHtml(device.ip)}" data-control="toggle">Toggle</button><span class="device-brightness">${device.brightness == null ? "" : `${device.brightness}% brightness`}</span></div>` : ""}
    </article>`;
  }

  function renderDevices() {
    const empty = `<div class="empty-card"><div class="empty-illustration">✦</div><strong>No lights found yet</strong><p>Scan your home network to find compatible Tapo devices.</p><button class="secondary-button" id="emptyScanButton">Scan network</button></div>`;
    const cards = state.devices.length ? state.devices.slice(0, 4).map(d => deviceCard(d)).join("") : empty;
    $("#deviceGrid").innerHTML = cards;
    $("#deviceList").innerHTML = state.devices.length ? state.devices.map(d => deviceCard(d, true)).join("") : empty;
    const options = `<option value="both">All discovered lights</option>` + state.devices.map(d => `<option value="${escapeHtml(d.ip)}">${escapeHtml(d.name || d.model || d.ip)} · ${escapeHtml(d.ip)}</option>`).join("");
    const select = $("#presetDevice");
    const old = select.value;
    select.innerHTML = options;
    if ([...select.options].some(option => option.value === old)) select.value = old;
    renderStatus();
    renderPresets();
  }

  async function discover() {
    if (state.busy) return;
    state.busy = true;
    const message = $("#scanMessage");
    message.textContent = "Scanning for Tapo devices…";
    $$("#scanButton, #scanButtonDevices, #emptyScanButton").forEach(button => { if (button) button.disabled = true; });
    try {
      const result = await api("/api/discover", { target: $("#targetInput").value.trim() || "255.255.255.255" });
      state.devices = result.devices || [];
      renderDevices();
      message.textContent = state.devices.length ? `Found ${state.devices.length} device${state.devices.length === 1 ? "" : "s"}` : "No compatible devices replied";
      toast(state.devices.length ? `Found ${state.devices.length} device${state.devices.length === 1 ? "" : "s"}` : "No Tapo devices found");
    } catch (error) {
      message.textContent = error.message;
      toast(error.message, true);
    } finally {
      state.busy = false;
      $$("#scanButton, #scanButtonDevices, #emptyScanButton").forEach(button => { if (button) button.disabled = false; });
    }
  }

  async function refreshStatus() {
    if (!state.authenticated || !state.devices.length || state.busy) return;
    state.busy = true;
    try {
      const result = await api("/api/refresh", {});
      state.devices = result.devices || [];
      renderDevices();
    } catch (error) { toast(error.message, true); }
    finally { state.busy = false; }
  }

  async function control(device, action, params = {}) {
    if (!state.authenticated) {
      toast("Sign in under Privacy & account first", true);
      setView("security");
      return;
    }
    if (!state.devices.length) {
      toast("Scan for lights first", true);
      return;
    }
    try {
      await api("/api/control", { device, action, params });
      toast(actionLabel(action, params));
      await refreshStatus();
    } catch (error) { toast(error.message, true); }
  }

  function actionLabel(action, params) {
    if (action === "brightness") return `Brightness set to ${params.value}%`;
    if (action === "temperature") return `White temperature set to ${params.value} K`;
    if (action === "color") return "Color preset applied";
    return action === "toggle" ? "Room toggled" : `Lights turned ${action}`;
  }

  function hexToHsv(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
    let h = 0;
    if (delta) {
      if (max === r) h = 60 * (((g - b) / delta) % 6);
      else if (max === g) h = 60 * ((b - r) / delta + 2);
      else h = 60 * ((r - g) / delta + 4);
    }
    if (h < 0) h += 360;
    return { hue: Math.round(h), saturation: max ? Math.round((delta / max) * 100) : 0 };
  }

  function readPresetForm() {
    const action = $("#presetAction").value;
    let params = {};
    if (action === "brightness") params.value = Number($("#brightnessSlider").value);
    if (action === "temperature") params.value = Number($("#temperatureSelect").value);
    if (action === "color") params = { ...hexToHsv($("#colorPicker").value), value: Number($("#colorBrightness").value) };
    return { id: crypto.randomUUID(), name: $("#presetName").value.trim(), device: $("#presetDevice").value, action, params };
  }

  async function savePreset(preset) {
    state.presets = [...state.presets, preset];
    try {
      const result = await api("/api/presets", { presets: state.presets });
      state.presets = result.presets || [];
      renderPresets();
      toast("Preset saved on this PC");
    } catch (error) {
      state.presets = state.presets.filter(item => item.id !== preset.id);
      toast(error.message, true);
    }
  }

  function renderPresets() {
    $("#presetCount").textContent = state.presets.length;
    if (!state.presets.length) {
      $("#presetList").innerHTML = `<div class="empty-note">Your saved presets will appear here.</div>`;
      return;
    }
    $("#presetList").innerHTML = state.presets.map(p => {
      const detail = p.action === "brightness" ? `${p.params.value}% brightness` : p.action === "temperature" ? `${p.params.value} K white` : p.action === "color" ? `HSV ${p.params.hue}° · ${p.params.saturation}%` : p.action;
      return `<article class="preset-card"><div class="preset-swatch">✦</div><div><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(p.device === "both" ? "All discovered lights" : p.device)} · ${escapeHtml(detail)}</small></div><div class="preset-actions"><button data-run-preset="${escapeHtml(p.id)}">Run</button><button data-delete-preset="${escapeHtml(p.id)}" aria-label="Delete ${escapeHtml(p.name)}">×</button></div></article>`;
    }).join("");
  }

  async function deletePreset(id) {
    const next = state.presets.filter(p => p.id !== id);
    try {
      const result = await api("/api/presets", { presets: next });
      state.presets = result.presets || [];
      renderPresets();
      toast("Preset removed");
    } catch (error) { toast(error.message, true); }
  }

  function showParameters() {
    const selected = $("#presetAction").value;
    $("#brightnessParameter").classList.toggle("hidden", selected !== "brightness");
    $("#temperatureParameter").classList.toggle("hidden", selected !== "temperature");
    $("#colorParameter").classList.toggle("hidden", selected !== "color");
  }

  async function bootstrap() {
    try {
      const data = await api("/api/bootstrap");
      state.authenticated = !!data.authenticated;
      state.devices = data.devices || [];
      state.presets = data.presets || [];
      $("#targetInput").value = data.broadcast || "255.255.255.255";
      if (!state.authenticated) setView("security");
      renderDevices();
      await discover();
      if (state.authenticated && state.devices.length) await refreshStatus();
    } catch (error) { toast(error.message, true); }
  }

  document.addEventListener("click", async event => {
    const nav = event.target.closest("[data-view], [data-nav]");
    if (nav) setView(nav.dataset.view || nav.dataset.nav);
    const controlButton = event.target.closest("[data-control]");
    if (controlButton) control(controlButton.dataset.device, controlButton.dataset.control);
    const quick = event.target.closest("[data-action]");
    if (quick) control("both", quick.dataset.action);
    const run = event.target.closest("[data-run-preset]");
    if (run) {
      const preset = state.presets.find(item => item.id === run.dataset.runPreset);
      if (preset) control(preset.device, preset.action, preset.params || {});
    }
    const remove = event.target.closest("[data-delete-preset]");
    if (remove) deletePreset(remove.dataset.deletePreset);
    if (event.target.closest("#scanButton, #scanButtonDevices, #emptyScanButton")) discover();
    if (event.target.closest("#refreshButton")) refreshStatus();
    if (event.target.closest("#logoutButton")) {
      try {
        await api("/api/logout", {});
        state.authenticated = false;
        renderStatus();
        setMessage("Saved local credentials removed.", "success");
        toast("Credentials removed from this PC");
      } catch (error) { toast(error.message, true); }
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
      toast("Tapo account verified locally");
    } catch (error) {
      setMessage(error.message, "error");
      toast(error.message, true);
    } finally {
      passwordInput.value = "";
      button.disabled = false;
      button.textContent = "Secure local sign-in";
    }
  });

  $("#presetAction").addEventListener("change", showParameters);
  $("#brightnessSlider").addEventListener("input", event => { $("#brightnessValue").textContent = `${event.target.value}%`; });
  $("#presetForm").addEventListener("submit", event => {
    event.preventDefault();
    if (!state.authenticated) { toast("Sign in locally before saving actions", true); setView("security"); return; }
    savePreset(readPresetForm());
    $("#presetName").value = "";
  });

  document.addEventListener("keydown", event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "r") {
      event.preventDefault();
      refreshStatus();
    }
  });

  showParameters();
  bootstrap();
  setInterval(refreshStatus, 30000);
})();
