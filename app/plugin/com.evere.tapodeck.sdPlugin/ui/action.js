(() => {
  const query = new URLSearchParams(location.search);
  let action = query.get("action") || "com.evere.tapodeck.control";
  let context = query.get("context") || "";
  const $ = id => document.getElementById(id);
  let ws = null;
  let devices = [];
  let selectedDevices = new Set();
  let signedIn = false;
  let saveTimer = null;
  let enginePort = 0;
  let engineToken = "";
  let setupUrl = "";
  let keyId = "";
  let settingsReady = false;

  async function localRequest(path, body, timeout = 30000) {
    if (!enginePort || !engineToken) throw new Error("The built-in local engine is still connecting. Reopen this key’s settings and try again.");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(`http://127.0.0.1:${enginePort}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: { "Authorization": `Bearer ${engineToken}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `Local engine error ${response.status}`);
      return result;
    } finally {
      clearTimeout(timer);
    }
  }

  function report(message, error = false) {
    const node = $("progress");
    node.textContent = message || "";
    node.classList.toggle("error", error);
  }

  window.addEventListener("error", event => {
    const detail = [event.message || event.error?.message || "Unknown JavaScript error", event.filename && `${event.filename.split(/[\\/]/).pop()}:${event.lineno || 0}`].filter(Boolean).join(" · ");
    setConnectionStatus(`Settings panel error: ${detail}`, true);
    report(`Panel error: ${detail}`, true);
    console.error("Tapo Deck settings panel error", event.error || event.message, event.filename, event.lineno);
  });

  window.addEventListener("unhandledrejection", event => {
    const detail = event.reason?.stack || event.reason?.message || String(event.reason || "Unknown rejected promise");
    setConnectionStatus(`Settings panel error: ${detail}`, true);
    report(`Panel error: ${detail}`, true);
    console.error("Tapo Deck settings panel rejection", detail);
  });

  function setConnectionStatus(message, error = false) {
    const service = $("service");
    service.className = `service ${error ? "offline" : "online"}`;
    const label = service.querySelector("span:last-child");
    if (label) label.textContent = message;
  }

  function handleMessage(event) {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    const payload = message.payload || {};
    if (message.event === "sendToPropertyInspector" && payload.type === "bootstrap") {
      // Use the context supplied for this visible inspector. Native settings
      // notifications can arrive late after a panel switches keys.
      if (typeof payload.context === "string" && payload.context) context = payload.context;
      if (typeof payload.action === "string") action = payload.action;
      enginePort = Number(payload.enginePort) || 0;
      engineToken = typeof payload.engineToken === "string" ? payload.engineToken : "";
      setupUrl = typeof payload.setupUrl === "string" ? payload.setupUrl : "";
      devices = payload.devices || [];
      signedIn = !!payload.authenticated;
      renderDevices();
      setConnectionStatus(payload.appRunning ? (signedIn ? `${devices.length} saved light${devices.length === 1 ? "" : "s"} · ready` : "Setup required · open local setup page") : (payload.error || "Starting built-in local engine…"), !payload.appRunning);
    }
    if (message.event === "sendToPropertyInspector" && payload.type === "progress") {
      report(payload.message, !!payload.error);
      if (payload.saved) { clearTimeout(saveTimer); report("Key settings saved."); }
    }
    if (message.event === "sendToPropertyInspector" && payload.type === "service") setConnectionStatus(payload.error || (payload.appRunning ? "Local engine ready" : "Starting built-in local engine…"), !payload.appRunning);
    if (message.event === "sendToPropertyInspector" && payload.type === "settings") {
      keyId = typeof payload.keyId === "string" ? payload.keyId : "";
      applySettings(payload.settings || {});
      settingsReady = true;
    }
  }

  window.connectElgatoStreamDeckSocket = (port, uuid, registerEvent, info, actionInfo) => {
    try {
      const details = typeof actionInfo === "string" ? JSON.parse(actionInfo) : (actionInfo || {});
      action = details.action || action;
      context = details.context || context;
      if (!port || !uuid || !registerEvent) throw new Error("Stream Deck did not provide the settings connection details.");
      ws = new WebSocket(`ws://127.0.0.1:${port}`);
      ws.addEventListener("open", () => {
        ws.send(JSON.stringify({ event: registerEvent, uuid }));
        report("");
        console.info("Tapo Deck property inspector connected", { action, context });
        setConnectionStatus("Connected to Stream Deck · starting local engine…");
      });
      ws.addEventListener("message", handleMessage);
      ws.addEventListener("close", () => {
        setConnectionStatus("Stream Deck settings disconnected. Reopen this key’s settings.", true);
        report("Stream Deck settings disconnected. Reopen this key’s settings.", true);
      });
      ws.addEventListener("error", () => {
        setConnectionStatus("Could not connect to Stream Deck settings. Reopen this key’s settings.", true);
        report("Could not connect to Stream Deck settings. Reopen this key’s settings.", true);
      });
    } catch (error) {
      setConnectionStatus(`${error.message} Close and reopen this key’s settings.`, true);
      report(`Could not connect to Stream Deck settings: ${error.message}`, true);
    }
  };

  // Older Stream Deck builds may still pass connection details in the URL.
  if (query.has("port")) window.connectElgatoStreamDeckSocket(
    query.get("port"), query.get("pluginUUID"), query.get("registerEvent") || "registerPropertyInspector",
    query.get("info") || "{}", query.get("actionInfo") || "{}"
  );

  function send(payload) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setConnectionStatus("Stream Deck settings are disconnected. Reopen this key’s settings.", true);
      report("Stream Deck settings are disconnected. Close and reopen this key’s settings.", true);
      return false;
    }
    ws.send(JSON.stringify(payload));
    return true;
  }

  function toHsv(hex) {
    const r = parseInt(hex.slice(1,3),16)/255, g = parseInt(hex.slice(3,5),16)/255, b = parseInt(hex.slice(5,7),16)/255;
    const max=Math.max(r,g,b), min=Math.min(r,g,b), d=max-min;
    let h=0;
    if(d){if(max===r)h=60*(((g-b)/d)%6);else if(max===g)h=60*((b-r)/d+2);else h=60*((r-g)/d+4)}
    if(h<0)h+=360;
    return {hue:Math.round(h),saturation:max?Math.round(d/max*100):0};
  }

  function renderDevices() {
    const list = $("deviceList");
    list.replaceChildren();
    if (!devices.length) {
      const empty = document.createElement("div");
      empty.className = "empty-devices";
      empty.textContent = "Open local setup to sign in and discover your lights.";
      list.append(empty);
      return;
    }
    for (const device of devices) {
      const label = document.createElement("label");
      label.className = "device-option";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = String(device.ip || "");
      checkbox.checked = selectedDevices.has(checkbox.value);
      const copy = document.createElement("span");
      copy.className = "device-copy";
      const name = document.createElement("span");
      name.className = "device-name";
      name.textContent = device.name || device.model || device.ip;
      const meta = document.createElement("span");
      meta.className = `device-meta${device.online === false ? " offline" : ""}`;
      meta.textContent = `${device.model || "Tapo light"} · ${device.ip}${device.online === false ? " · not seen in latest search" : ""}`;
      copy.append(name, meta);
      label.append(checkbox, copy);
      list.append(label);
    }
  }

  function applySettings(settings = {}) {
    if (Array.isArray(settings.devices)) {
      selectedDevices = new Set(settings.devices.map(String));
    } else if (settings.device === "both") {
      selectedDevices = new Set(devices.map(device => String(device.ip)));
    } else if (settings.device) {
      selectedDevices = new Set([String(settings.device)]);
    } else {
      selectedDevices = new Set();
    }
    renderDevices();
    if (settings.action) $("action").value = settings.action;
    if (settings.action === "brightness") $("value").value = settings.value ?? 50;
    if (settings.action === "temperature") $("temperature").value = settings.value ?? 4000;
    if (settings.action === "color") {
      const option = `${settings.hue ?? 210},${settings.saturation ?? 100}`;
      if ([...$("colorPreset").options].some(o => o.value === option)) $("colorPreset").value = option;
      else { $("colorPreset").value = "custom"; $("customColor").value = "#5265d8"; }
    }
    updateFields();
    updateValueText();
  }

  function updateFields() {
    const mode = $("action").value;
    $("valueRow").classList.toggle("hidden", mode !== "brightness");
    $("temperatureRow").classList.toggle("hidden", mode !== "temperature");
    $("colorRow").classList.toggle("hidden", mode !== "color");
    $("customColorRow").classList.toggle("hidden", mode !== "color" || $("colorPreset").value !== "custom");
    $("hint").textContent = mode === "color" || mode === "temperature" || mode === "brightness" ? "Preset actions turn the selected bulbs on before applying the setting." : "Choose lights and an action. Press this key to run it.";
  }

  function updateValueText() {
    $("valueText").textContent = `${$("value").value}%`;
  }

  function currentSettings() {
    const mode = $("action").value;
    const settings = { devices: [...selectedDevices], action: mode };
    if (mode === "brightness") settings.value = Number($("value").value);
    if (mode === "temperature") settings.value = Number($("temperature").value);
    if (mode === "color") {
      if ($("colorPreset").value === "custom") {
        Object.assign(settings, toHsv($("customColor").value));
        settings.colorName = "Color";
      } else {
        const [hue, saturation] = $("colorPreset").value.split(",").map(Number);
        settings.hue = hue;
        settings.saturation = saturation;
        settings.colorName = $("colorPreset").selectedOptions[0].textContent;
      }
    }
    return settings;
  }

  function saveSettings() {
    if (!settingsReady) return;
    if (!keyId) { report("Could not identify this key for local saving. Reopen its settings.", true); return; }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      report("Saving this key’s settings on this PC…");
      localRequest("/api/key-settings", { key: keyId, settings: currentSettings() }, 10000)
        .then(() => report("This key’s settings were saved on this PC."))
        .catch(error => report(error.name === "AbortError" ? "The local engine did not respond. Try changing this setting again." : error.message, true));
    }, 300);
  }

  $("deviceList").addEventListener("change", event => {
    const checkbox = event.target;
    if (checkbox instanceof HTMLInputElement && checkbox.type === "checkbox") {
      if (checkbox.checked) selectedDevices.add(checkbox.value);
      else selectedDevices.delete(checkbox.value);
      saveSettings();
    }
  });
  $("action").addEventListener("change", () => { updateFields(); saveSettings(); });
  $("colorPreset").addEventListener("change", () => { updateFields(); saveSettings(); });
  $("value").addEventListener("input", () => { updateValueText(); saveSettings(); });
  $("temperature").addEventListener("change", saveSettings);
  $("customColor").addEventListener("input", saveSettings);
  $("refresh").addEventListener("click", async () => {
    try {
      const data = await localRequest("/api/bootstrap");
      devices = data.devices || [];
      signedIn = !!data.authenticated;
      renderDevices();
      setConnectionStatus("Local engine ready");
    } catch (error) { report(error.message, true); }
  });
  $("signOut").addEventListener("click", async () => {
    const button = $("signOut");
    button.disabled = true;
    report("Removing the saved Tapo sign-in…");
    try {
      await localRequest("/api/logout", {});
      signedIn = false;
      setConnectionStatus("Tapo sign-in removed from this PC");
      report("Saved Tapo sign-in removed from this PC.");
    } catch (error) { report(error.name === "AbortError" ? "The local engine did not respond. Try again." : error.message, true); }
    finally { button.disabled = false; }
  });
  $("openSetup").addEventListener("click", async () => {
    const button = $("openSetup");
    if (!setupUrl) {
      try {
        const data = await localRequest("/api/bootstrap");
        setupUrl = `http://127.0.0.1:${enginePort}/`;
        devices = data.devices || devices;
        signedIn = !!data.authenticated;
        renderDevices();
      } catch (error) { report(error.message, true); return; }
    }
    if (send({ event: "openUrl", payload: { url: setupUrl } })) report("Opening local Tapo setup in your browser…");
  });
  updateFields();
  updateValueText();
})();
