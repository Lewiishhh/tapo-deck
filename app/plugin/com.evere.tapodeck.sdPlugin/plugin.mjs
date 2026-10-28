import streamDeck, { action, SingletonAction } from "@elgato/streamdeck";

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import net from "node:net";
import { spawn } from "node:child_process";

const PLUGIN_UUID = "com.evere.tapodeck";
const ACTION_UUID = "com.evere.tapodeck.control";
const PLUGIN_VERSION = "0.2.18.7";
let bridgePort = 0;
const bridgeToken = crypto.randomBytes(32).toString("base64url");
let activeInspectorAction = null;
let helper = null;
let helperOwned = false;
let serviceReady = false;
let serviceError = "";
let serviceStarting = null;

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

async function bridgeGet(pathname, timeout = 1500) {
  const response = await fetch(`http://127.0.0.1:${bridgePort}${pathname}`, {
    headers: { Authorization: `Bearer ${bridgeToken}` },
    signal: AbortSignal.timeout(timeout),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Local service error ${response.status}`);
  return result;
}

async function bridgePost(pathname, payload, timeout = 15000) {
  const response = await fetch(`http://127.0.0.1:${bridgePort}${pathname}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${bridgeToken}`, "Content-Type": "application/json" },
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
  const bundledExecutable = path.join(import.meta.dirname, "bin", "TapoDeckService.exe");
  if (!fs.existsSync(bundledExecutable)) {
    serviceError = "The bundled Tapo Deck engine is missing. Reinstall the plugin.";
    throw new Error(serviceError);
  }
  // The installed plugin folder can be replaced during updates, so run a copy
  // from LocalAppData and never keep the installer directory locked.
  const appData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  const runtimeDirectory = path.join(appData, "TapoDeck", "engine", PLUGIN_VERSION);
  const executable = path.join(runtimeDirectory, "TapoDeckService.exe");
  fs.mkdirSync(runtimeDirectory, { recursive: true });
  if (!fs.existsSync(executable) || fs.statSync(executable).size !== fs.statSync(bundledExecutable).size) {
    fs.copyFileSync(bundledExecutable, executable);
  }
  if (!bridgePort) bridgePort = await findFreePort();
  helper = spawn(executable, ["--no-browser", "--port", String(bridgePort), "--parent-pid", String(process.pid)], {
    cwd: os.tmpdir(),
    env: { ...process.env, TAPODECK_API_TOKEN: bridgeToken },
    windowsHide: true,
    detached: false,
    stdio: "ignore",
  });
  helperOwned = true;
  helper.once("error", error => {
    serviceError = error.message;
    notifyInspector("service", { appRunning: false, error: serviceError });
  });
  helper.once("exit", code => {
    if (code && code !== 0) serviceError = `Local engine stopped (${code}).`;
    serviceReady = false;
    helper = null;
    notifyInspector("service", { appRunning: false, error: serviceError || "Local engine stopped." });
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

function notifyInspector(type, data, expectedContext) {
  // The SDK owns the live inspector reference and updates it as panels switch.
  // Do not route confirmations through a separate manually tracked action.
  const inspectorAction = streamDeck.ui.action;
  if (!inspectorAction || (expectedContext && inspectorAction.id !== expectedContext)) return;
  void streamDeck.ui.sendToPropertyInspector({ action: inspectorAction.manifestId, type, ...data }).catch(error => {
    console.debug("No active Tapo Deck property inspector", error.message);
  });
}

async function sendInspectorData(action) {
  if (streamDeck.ui.action?.id !== action.id) return;
  const context = action.id;
  let data = { devices: [], presets: [], appRunning: false, authenticated: false, error: serviceError };
  try {
    await ensureService();
    const bootstrap = await bridgeGet("/api/bootstrap");
    data = {
      devices: bootstrap.devices || [],
      presets: bootstrap.presets || [],
      keyId: action.id,
      authenticated: bootstrap.authenticated,
      appRunning: true,
      enginePort: bridgePort,
      engineToken: bridgeToken,
      setupUrl: `http://127.0.0.1:${bridgePort}/`,
    };
    if (!bootstrap.authenticated && !bootstrap.setupPageOpened) {
      await bridgePost("/api/setup-opened", {});
      await streamDeck.system.openUrl(data.setupUrl);
    }
  } catch (error) {
    data.error = error.message;
  }
  notifyInspector("bootstrap", { context, ...data }, context);
}

async function activate(action, settings = {}) {
  if (!settings.action || !(Array.isArray(settings.devices) ? settings.devices.length : settings.device)) {
    await action.showAlert();
    return;
  }
  const command = settings.action;
  const params = {};
  if (command === "brightness" || command === "temperature") params.value = Number(settings.value);
  if (command === "color") {
    params.hue = Number(settings.hue ?? 210);
    params.saturation = Number(settings.saturation ?? 100);
  }
  try {
    await ensureService();
    await bridgePost("/api/control", { devices: settings.devices, device: settings.device, action: command, params }, 12000);
    await action.showOk();
  } catch (error) {
    console.error(`Tapo action failed: ${error.message}`);
    await action.showAlert();
  }
}

class TapoDeckAction extends SingletonAction {
  constructor(fixedMode = "custom") {
    super();
    this.fixedMode = fixedMode;
  }

  async onKeyUp(ev) {
    let settings = ev.payload.settings || {};
    try {
      await ensureService();
      const stored = await bridgeGet(`/api/key-settings?key=${encodeURIComponent(ev.action.id)}`);
      if (stored.settings) settings = stored.settings;
    } catch (error) {
      console.warn(`Could not load the local settings for this key: ${error.message}`);
    }
    await activate(ev.action, { ...settings, action: this.fixedMode === "custom" ? settings.action : this.fixedMode });
  }

  onWillDisappear(ev) {
    if (activeInspectorAction?.id === ev.action.id) activeInspectorAction = null;
  }

  async onPropertyInspectorDidAppear(ev) {
    activeInspectorAction = ev.action;
    await sendInspectorData(ev.action);
    await ev.action.getSettings();
  }

  onPropertyInspectorDidDisappear(ev) {
    if (activeInspectorAction?.id === ev.action.id) activeInspectorAction = null;
  }

  async onDidReceiveSettings(ev) {
    const action = ev.action;
    const isCurrentInspector = streamDeck.ui.action?.id === action.id;
    let settings = ev.payload.settings || {};
    try {
      await ensureService();
      const stored = await bridgeGet(`/api/key-settings?key=${encodeURIComponent(action.id)}`);
      if (stored.settings) settings = stored.settings;
    } catch (error) {
      console.warn(`Could not read local key settings after Stream Deck update: ${error.message}`);
    }
    console.info("Tapo Deck received Stream Deck settings update", {
      contextMatchesVisibleInspector: isCurrentInspector,
      settingsKeys: Object.keys(settings),
    });
    if (isCurrentInspector) notifyInspector("settings", { settings, keyId: action.id }, action.id);
  }

  async onSendToPlugin(ev) {
    const payload = ev.payload || {};
    const action = ev.action;
    activeInspectorAction = action;
    if (payload.type === "refreshInspector") {
      await sendInspectorData(action);
    } else if (payload.type === "openSetup") {
      try {
        await ensureService();
        await streamDeck.system.openUrl(`http://127.0.0.1:${bridgePort}/`);
      } catch (error) {
        notifyInspector("progress", { message: error.message, error: true });
      }
    } else if (payload.type === "scanDevices") {
      try {
        await ensureService();
        notifyInspector("progress", { message: "Scanning your local network…" }, action.id);
        await bridgePost("/api/discover", { target: "" }, 20000);
        notifyInspector("progress", { message: "Scan complete." }, action.id);
        await sendInspectorData(action);
      } catch (error) {
        notifyInspector("progress", { message: error.message, error: true }, action.id);
      }
    } else if (payload.type === "signIn" && typeof payload.username === "string" && typeof payload.password === "string") {
      try {
        await ensureService();
        notifyInspector("progress", { message: "Checking sign-in with your bulbs…" }, action.id);
        await bridgePost("/api/login", { username: payload.username, password: payload.password }, 30000);
        notifyInspector("progress", { message: "Signed in and ready." }, action.id);
        await sendInspectorData(action);
      } catch (error) {
        notifyInspector("progress", { message: error.message, error: true }, action.id);
      }
    } else if (payload.type === "signOut") {
      try {
        await ensureService();
        await bridgePost("/api/logout", {});
        notifyInspector("progress", { message: "Saved Tapo sign-in removed from this PC." }, action.id);
        await sendInspectorData(action);
      } catch (error) {
        notifyInspector("progress", { message: error.message, error: true }, action.id);
      }
    }
  }
}

const actionTypes = [
  { uuid: ACTION_UUID, mode: "custom" },
  { uuid: "com.evere.tapodeck.toggle", mode: "toggle" },
  { uuid: "com.evere.tapodeck.brightness", mode: "brightness" },
  { uuid: "com.evere.tapodeck.color", mode: "color" },
  { uuid: "com.evere.tapodeck.temperature", mode: "temperature" },
];

for (const { uuid, mode } of actionTypes) {
  const TypedTapoAction = class extends TapoDeckAction {
    constructor() { super(mode); }
  };
  const RegisteredTapoDeckAction = action({ UUID: uuid })(TypedTapoAction);
  streamDeck.actions.registerAction(new RegisteredTapoDeckAction());
}
streamDeck.connect().then(() => {
  console.info("Tapo Deck connected to Stream Deck; starting the local engine.");
  void ensureService().then(() => {
    console.info("Tapo Deck local engine is ready.");
  }).catch(error => {
    serviceError = error.message;
    console.error("Tapo Deck local engine failed to start at Stream Deck startup", error);
  });
}).catch(error => {
  console.error("Stream Deck SDK connection failed", error);
  void stopHelper().finally(() => process.exit(1));
});

process.once("SIGINT", () => { void stopHelper().finally(() => process.exit(0)); });
process.once("SIGTERM", () => { void stopHelper().finally(() => process.exit(0)); });
