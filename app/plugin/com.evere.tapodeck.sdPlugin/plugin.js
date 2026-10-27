"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const net = require("node:net");
const { spawn } = require("node:child_process");

const PLUGIN_UUID = "com.evere.tapodeck";
const ACTION_UUID = "com.evere.tapodeck.control";
let bridgePort = 0;
const bridgeToken = crypto.randomBytes(32).toString("base64url");

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

const port = arg("-port");
const pluginUUID = arg("-pluginUUID") || PLUGIN_UUID;
const registerEvent = arg("-registerEvent") || "registerPlugin";
const contexts = new Map();
const pendingSettings = new Map();
let activeInspectorContext = "";
let helper = null;
let helperOwned = false;
let serviceReady = false;
let serviceError = "";
let serviceStarting = null;

if (!port || typeof WebSocket !== "function") {
  console.error("Tapo Deck requires the Stream Deck Node.js 24 runtime.");
  process.exit(1);
}

const ws = new WebSocket(`ws://127.0.0.1:${port}`);

async function bridgeGet(pathname, timeout = 1500) {
  const response = await fetch(`http://127.0.0.1:${bridgePort}${pathname}`, {
    headers: { "Authorization": `Bearer ${bridgeToken}` },
    signal: AbortSignal.timeout(timeout),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Local service error ${response.status}`);
  return result;
}

async function bridgePost(pathname, payload, timeout = 15000) {
  const response = await fetch(`http://127.0.0.1:${bridgePort}${pathname}`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${bridgeToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeout),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Local service error ${response.status}`);
  return result;
}

async function ensureService() {
  if (serviceReady) return;
  if (!serviceStarting) serviceStarting = startService();
  try {
    await serviceStarting;
  } finally {
    serviceStarting = null;
  }
}

async function startService() {
  const bundledExecutable = path.join(__dirname, "bin", "TapoDeckService.exe");
  if (!fs.existsSync(bundledExecutable)) {
    serviceError = "The bundled Tapo Deck engine is missing. Reinstall the plugin.";
    throw new Error(serviceError);
  }
  // Stream Deck replaces the installed plugin folder during an update. Never
  // execute the helper from that folder, since Windows locks a running EXE.
  const appData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  let version = "current";
  try { version = JSON.parse(fs.readFileSync(path.join(__dirname, "manifest.json"), "utf8")).Version || version; } catch (_error) {}
  const runtimeDirectory = path.join(appData, "TapoDeck", "engine", version);
  const executable = path.join(runtimeDirectory, "TapoDeckService.exe");
  fs.mkdirSync(runtimeDirectory, { recursive: true });
  if (!fs.existsSync(executable) || fs.statSync(executable).size !== fs.statSync(bundledExecutable).size) {
    fs.copyFileSync(bundledExecutable, executable);
  }
  if (!bridgePort) bridgePort = await findFreePort();
  helper = spawn(executable, ["--no-browser", "--port", String(bridgePort), "--parent-pid", String(process.pid)], {
    // Do not keep the plugin installation directory as the child process's
    // working directory; Stream Deck must be able to replace that folder on update.
    cwd: os.tmpdir(),
    env: { ...process.env, TAPODECK_API_TOKEN: bridgeToken },
    windowsHide: true,
    detached: false,
    stdio: "ignore",
  });
  helperOwned = true;
  helper.once("error", error => {
    serviceError = error.message;
    notifyInspectors("service", { appRunning: false, error: serviceError });
  });
  helper.once("exit", code => {
    if (code && code !== 0) serviceError = `Local engine stopped (${code}).`;
    serviceReady = false;
    helper = null;
    notifyInspectors("service", { appRunning: false, error: serviceError || "Local engine stopped." });
  });
  const deadline = Date.now() + 15000;
  let lastError;
  while (Date.now() < deadline) {
    if (helper && helper.exitCode !== null) break;
    try {
      await bridgeGet("/api/bootstrap", 1200);
      serviceReady = true;
      serviceError = "";
      return;
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  serviceError = `Could not start the local engine${lastError ? `: ${lastError.message}` : "."}`;
  throw new Error(serviceError);
}

function stopHelper() {
  const child = helper;
  if (!helperOwned || !child || child.exitCode !== null) return Promise.resolve();
  return new Promise(resolve => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      if (child.exitCode === null) child.kill();
      finish();
    }, 3000);
    child.once("exit", finish);
    child.kill();
  });
}

function notifyInspectors(type, data) {
  for (const context of contexts.keys()) {
    send({ event: "sendToPropertyInspector", action: ACTION_UUID, context, payload: { type, ...data } });
  }
}

function send(message) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}

function actionKey(device, coordinates) {
  const column = Number(coordinates?.column);
  const row = Number(coordinates?.row);
  if (!device || !Number.isInteger(column) || !Number.isInteger(row)) return "";
  return `${device}|${column}|${row}|${ACTION_UUID}`;
}

async function sendInspectorData(context) {
  let data = { devices: [], presets: [], appRunning: false, authenticated: false, error: serviceError };
  try {
    await ensureService();
    const bootstrap = await bridgeGet("/api/bootstrap");
    data = { devices: bootstrap.devices || [], presets: bootstrap.presets || [], authenticated: bootstrap.authenticated, appRunning: true, enginePort: bridgePort, engineToken: bridgeToken, setupUrl: `http://127.0.0.1:${bridgePort}/` };
    if (!bootstrap.authenticated && !bootstrap.setupPageOpened) {
      await bridgePost("/api/setup-opened", {});
      send({ event: "openUrl", payload: { url: data.setupUrl } });
    }
  } catch (error) {
    data.error = error.message;
  }
  send({ event: "sendToPropertyInspector", action: ACTION_UUID, context, payload: { type: "bootstrap", context, action: ACTION_UUID, ...data } });
}

async function activate(context, settings = {}, key = "") {
  if (key) {
    try {
      const saved = await bridgeGet(`/api/key-settings?key=${encodeURIComponent(key)}`);
      if (saved.settings && typeof saved.settings === "object") settings = saved.settings;
    } catch (_error) { /* Fall back to the profile's Stream Deck settings. */ }
  }
  if (!settings.action || !(Array.isArray(settings.devices) ? settings.devices.length : settings.device)) {
    send({ event: "showAlert", context });
    return;
  }
  const action = settings.action;
  const params = {};
  if (action === "brightness" || action === "temperature") params.value = Number(settings.value);
  if (action === "color") {
    params.hue = Number(settings.hue ?? 210);
    params.saturation = Number(settings.saturation ?? 100);
  }
  try {
    await ensureService();
    await bridgePost("/api/control", { devices: settings.devices, device: settings.device, action, params }, 12000);
    send({ event: "showOk", context });
  } catch (error) {
    console.error(`Tapo action failed: ${error.message}`);
    send({ event: "showAlert", context });
  }
}

ws.addEventListener("open", () => {
  send({ event: registerEvent, uuid: pluginUUID });
});

ws.addEventListener("message", async event => {
  let message;
  try { message = JSON.parse(event.data); } catch (_error) { return; }
  const context = message.context;
  const payload = message.payload || {};

  if (message.event === "willAppear" && context) {
    contexts.set(context, message.action);
  } else if (message.event === "willDisappear" && context) {
    contexts.delete(context);
    if (activeInspectorContext === context) activeInspectorContext = "";
  } else if (message.event === "keyUp" && message.action === ACTION_UUID && context) {
    await activate(context, payload.settings || {}, actionKey(message.device, payload.coordinates));
  } else if (message.event === "propertyInspectorDidAppear" && context) {
    contexts.set(context, message.action);
    activeInspectorContext = context;
    send({ event: "getSettings", action: message.action || ACTION_UUID, context });
    await sendInspectorData(context);
  } else if (message.event === "didReceiveSettings" && context) {
    let settings = payload.settings || {};
    const keyId = actionKey(message.device, payload.coordinates);
    if (keyId) {
      try {
        await ensureService();
        const saved = await bridgeGet(`/api/key-settings?key=${encodeURIComponent(keyId)}`);
        if (saved.settings && typeof saved.settings === "object") settings = saved.settings;
      } catch (_error) { /* The profile settings remain the initial fallback. */ }
    }
    send({ event: "sendToPropertyInspector", action: ACTION_UUID, context, payload: { type: "settings", settings, keyId } });
    const pending = pendingSettings.get(context);
    if (pending) {
      clearTimeout(pending.timer);
      pendingSettings.delete(context);
      send({ event: "sendToPropertyInspector", action: ACTION_UUID, context, payload: { type: "progress", message: "Key settings saved.", saved: true } });
    }
  } else if (message.event === "sendToPlugin" && message.action === ACTION_UUID) {
    const targetContext = contexts.has(context) ? context : activeInspectorContext;
    if (!targetContext || !contexts.has(targetContext)) return;
    if (payload.type === "saveSettings" && payload.settings && typeof payload.settings === "object") {
      const previous = pendingSettings.get(targetContext);
      if (previous) clearTimeout(previous.timer);
      const timer = setTimeout(() => {
        pendingSettings.delete(targetContext);
        send({ event: "sendToPropertyInspector", action: ACTION_UUID, context: targetContext, payload: { type: "progress", message: "Stream Deck did not confirm the save. Close and reopen this key’s settings.", error: true } });
      }, 10000);
      pendingSettings.set(targetContext, { timer });
      send({ event: "setSettings", action: message.action, context: targetContext, payload: payload.settings });
    } else if (payload.type === "refreshInspector") {
      await sendInspectorData(targetContext);
    } else if (payload.type === "openSetup") {
      try {
        await ensureService();
        send({ event: "openUrl", payload: { url: `http://127.0.0.1:${bridgePort}/` } });
      } catch (error) {
        send({ event: "sendToPropertyInspector", action: ACTION_UUID, context: targetContext, payload: { type: "progress", message: error.message, error: true } });
      }
    } else if (payload.type === "scanDevices") {
      try {
        await ensureService();
        notifyInspectors("progress", { message: "Scanning your local network…" });
        await bridgePost("/api/discover", { target: "" }, 20000);
        notifyInspectors("progress", { message: "Scan complete." });
        for (const inspectorContext of contexts.keys()) await sendInspectorData(inspectorContext);
      } catch (error) {
        notifyInspectors("progress", { message: error.message, error: true });
      }
    } else if (payload.type === "signIn" && typeof payload.username === "string" && typeof payload.password === "string") {
      try {
        await ensureService();
        notifyInspectors("progress", { message: "Checking sign-in with your bulbs…" });
        await bridgePost("/api/login", { username: payload.username, password: payload.password }, 30000);
        notifyInspectors("progress", { message: "Signed in and ready." });
        for (const inspectorContext of contexts.keys()) await sendInspectorData(inspectorContext);
      } catch (error) {
        notifyInspectors("progress", { message: error.message, error: true });
      }
    } else if (payload.type === "signOut") {
      try {
        await ensureService();
        await bridgePost("/api/logout", {});
        notifyInspectors("progress", { message: "Saved Tapo sign-in removed from this PC." });
        for (const inspectorContext of contexts.keys()) await sendInspectorData(inspectorContext);
      } catch (error) {
        notifyInspectors("progress", { message: error.message, error: true });
      }
    }
  }
});

ws.addEventListener("close", () => {
  stopHelper().finally(() => process.exit(0));
});
ws.addEventListener("error", error => console.error("Stream Deck connection failed", error));

process.on("SIGINT", () => { stopHelper().finally(() => process.exit(0)); });
process.on("SIGTERM", () => { stopHelper().finally(() => process.exit(0)); });
