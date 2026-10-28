"""Loopback-only dashboard and Stream Deck bridge for Tapo bulbs."""

from __future__ import annotations

import argparse
import asyncio
import ipaddress
import json
import mimetypes
import os
import socket
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

from kasa import Credentials, Discover
from kasa.exceptions import KasaException

from local_store import (
    api_token,
    data_dir,
    delete_credentials,
    load_credentials,
    load_devices,
    load_key_settings,
    load_presets,
    save_credentials,
    save_devices,
    save_key_settings,
    save_presets,
    setup_page_opened,
    mark_setup_page_opened,
)


ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
if not WEB.is_dir():
    # PyInstaller bundles the frontend under app/web while this entry point
    # may resolve from the one-file extraction root.
    WEB = ROOT / "app" / "web"
HOST = "127.0.0.1"
PORT = int(os.environ.get("TAPODECK_PORT", "52124"))
TOKEN = os.environ.get("TAPODECK_API_TOKEN") or api_token()
STATE_LOCK = threading.Lock()
DEVICES: dict[str, dict[str, Any]] = {d["ip"]: d for d in load_devices() if d.get("ip")}
SCAN_LOCK = threading.Lock()


def detected_broadcast() -> str:
    """Best-effort /24 broadcast for the active IPv4 route."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("192.0.2.1", 80))
        local_ip = sock.getsockname()[0]
        address = ipaddress.IPv4Address(local_ip)
        if address.is_private:
            octets = local_ip.split(".")
            return ".".join(octets[:3] + ["255"])
    except OSError:
        pass
    finally:
        sock.close()
    return "255.255.255.255"


def _extract_device(raw: dict[str, Any]) -> dict[str, Any] | None:
    info = raw.get("discovery_response", {})
    if not isinstance(info, dict):
        return None
    meta = raw.get("meta", {})
    result = info.get("result") if isinstance(info.get("result"), dict) else info
    ip = str(meta.get("ip") or result.get("ip") or "")
    if not ip:
        return None
    model = str(result.get("device_model") or result.get("model") or "Tapo device")
    device_type = str(result.get("device_type") or result.get("type") or "")
    mac = str(result.get("mac") or result.get("device_mac") or "")
    alias = result.get("nickname") or result.get("alias") or result.get("device_name") or model
    return {
        "ip": ip,
        "name": str(alias),
        "model": model,
        "type": device_type,
        "mac": mac,
        "online": True,
        "state": None,
        "brightness": None,
        "colorTemp": None,
        "hsv": None,
        "firmware": str(result.get("fw_ver") or result.get("sw_ver") or ""),
    }


async def _discover(target: str, timeout: int = 5) -> list[dict[str, Any]]:
    found: dict[str, dict[str, Any]] = {}

    def on_raw(raw: dict[str, Any]) -> None:
        item = _extract_device(raw)
        if item:
            found[item["ip"]] = item

    devices = await Discover.discover(
        target=target,
        discovery_timeout=timeout,
        discovery_packets=3,
        on_discovered_raw=on_raw,
        timeout=5,
    )
    for device in devices.values():
        try:
            await device.disconnect()
        except Exception:
            pass
    return sorted(found.values(), key=lambda item: item["ip"])


def _light_module(device):
    return next(
        (module for module in device.modules.values() if module.__class__.__name__ == "Light"),
        None,
    )


async def _read_device(ip: str, credentials: Credentials) -> dict[str, Any]:
    device = None
    try:
        device = await Discover.discover_single(
            ip, credentials=credentials, discovery_timeout=3, timeout=5
        )
        if device is None:
            raise KasaException("No response from bulb")
        await device.update()
        light = _light_module(device)
        return {
            "ip": ip,
            "name": device.alias or device.model,
            "model": device.model,
            "type": str(device.device_type),
            "mac": device.mac,
            "online": True,
            "state": bool(device.is_on),
            "brightness": light.brightness if light else None,
            "colorTemp": light.color_temp if light else None,
            "hsv": list(light.hsv) if light else None,
            "firmware": str(device.sys_info.get("fw_ver") or ""),
        }
    finally:
        if device is not None:
            await device.disconnect()


async def _validate_and_save(username: str, password: str) -> tuple[bool, str]:
    credentials = Credentials(username, password)
    with STATE_LOCK:
        targets = list(DEVICES)
    if not targets:
        targets = [item["ip"] for item in await _discover(detected_broadcast(), timeout=4)]
    if not targets:
        return False, "No Tapo devices found. Scan your local network first."
    errors: list[str] = []
    for ip in targets:
        try:
            state = await _read_device(ip, credentials)
            with STATE_LOCK:
                DEVICES[ip] = state
            save_credentials(username, password)
            save_devices(list(DEVICES.values()))
            return True, "Signed in locally and verified against a bulb."
        except Exception as exc:
            # Return enough local diagnostic detail to distinguish an auth
            # rejection from a transport/device error, while never echoing
            # the submitted credentials back into the setup page.
            detail = " ".join(str(exc).split())
            if username:
                detail = detail.replace(username, "[email redacted]")
            if password:
                detail = detail.replace(password, "[password redacted]")
            detail = detail[:180]
            errors.append(f"{ip}: {type(exc).__name__}" + (f" — {detail}" if detail else ""))
    details = "; ".join(errors[:3])
    return False, "Could not authenticate with a discovered bulb. Check the Tapo account details and Third-Party Compatibility setting." + (f" Details: {details}" if details else "")


async def _apply_control(ip: str, credentials: Credentials, action: str, params: dict[str, Any]) -> dict[str, Any]:
    device = None
    try:
        device = await Discover.discover_single(
            ip, credentials=credentials, discovery_timeout=3, timeout=5
        )
        if device is None:
            raise KasaException("No response from bulb")
        await device.update()
        if action == "on":
            await device.turn_on()
        elif action == "off":
            await device.turn_off()
        elif action == "toggle":
            await (device.turn_off() if device.is_on else device.turn_on())
        else:
            light = _light_module(device)
            if light is None:
                raise KasaException("Bulb did not report light controls")
            if action == "brightness":
                value = int(params.get("value", 50))
                if value > 0 and not device.is_on:
                    await device.turn_on()
                await light.set_brightness(value)
            elif action == "temperature":
                value = int(params.get("value", 4000))
                if not device.is_on:
                    await device.turn_on()
                await light.set_color_temp(value)
            elif action == "color":
                hue = int(params.get("hue", 210))
                saturation = int(params.get("saturation", 100))
                if not device.is_on:
                    await device.turn_on()
                # Leave HSV value (brightness) unset so the bulb keeps its
                # current brightness when only its color is changed.
                await light.set_hsv(hue, saturation)
            else:
                raise ValueError("Unsupported action")
        return {"ip": ip, "ok": True, "state": "on" if action == "on" else "off" if action == "off" else None}
    finally:
        if device is not None:
            await device.disconnect()


class Handler(BaseHTTPRequestHandler):
    server_version = "TapoDeckLocal/0.1"

    def log_message(self, fmt: str, *args: Any) -> None:
        # Avoid writing request bodies, tokens, or account details to logs.
        print(f"[TapoDeck] {self.address_string()} {fmt % args}")

    def _send(self, status: int, body: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Frame-Options", "DENY")
        origin = self.headers.get("Origin")
        if origin in {"null", f"http://{HOST}:{PORT}", f"http://localhost:{PORT}"}:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; "
            "base-uri 'none'; frame-ancestors 'none'",
        )
        self.end_headers()
        self.wfile.write(body)

    def _json(self, status: int, value: Any) -> None:
        self._send(status, json.dumps(value).encode("utf-8"), "application/json; charset=utf-8")

    def _authorized(self) -> bool:
        host = self.headers.get("Host", "")
        origin = self.headers.get("Origin")
        allowed = {f"{HOST}:{PORT}", f"localhost:{PORT}"}
        if host not in allowed:
            return False
        if origin and origin not in {"null", f"http://{HOST}:{PORT}", f"http://localhost:{PORT}"}:
            return False
        return self.headers.get("Authorization") == f"Bearer {TOKEN}"

    def _read_json(self) -> dict[str, Any]:
        length = min(int(self.headers.get("Content-Length", "0")), 65536)
        if length <= 0:
            return {}
        value = json.loads(self.rfile.read(length))
        return value if isinstance(value, dict) else {}

    def do_OPTIONS(self) -> None:
        origin = self.headers.get("Origin")
        allowed_origins = {"null", f"http://{HOST}:{PORT}", f"http://localhost:{PORT}"}
        if origin not in allowed_origins or self.headers.get("Host", "") not in {f"{HOST}:{PORT}", f"localhost:{PORT}"}:
            return self._json(403, {"error": "Local authorization required"})
        self.send_response(204)
        self.send_header("Allow", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Vary", "Origin")
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/" or parsed.path == "/index.html":
            page = (WEB / "index.html").read_text(encoding="utf-8").replace("__API_TOKEN__", TOKEN)
            return self._send(200, page.encode("utf-8"), "text/html; charset=utf-8")
        if parsed.path.startswith("/assets/"):
            candidate = (WEB / parsed.path.removeprefix("/assets/")).resolve()
            if not candidate.is_relative_to(WEB.resolve()) or not candidate.is_file():
                return self._json(404, {"error": "Not found"})
            mime = mimetypes.guess_type(str(candidate))[0] or "application/octet-stream"
            return self._send(200, candidate.read_bytes(), mime)
        if not self._authorized():
            return self._json(403, {"error": "Local authorization required"})
        if parsed.path == "/api/bootstrap":
            with STATE_LOCK:
                devices = list(DEVICES.values())
            if not devices:
                devices = load_devices()
            creds = load_credentials()
            return self._json(200, {
                "authenticated": creds is not None,
                "devices": devices,
                "presets": load_presets(),
                "broadcast": detected_broadcast(),
                "setupPageOpened": setup_page_opened(),
                "version": "0.2.18.3",
            })
        if parsed.path == "/api/presets":
            return self._json(200, {"presets": load_presets()})
        if parsed.path == "/api/key-settings":
            key = parse_qs(parsed.query).get("key", [""])[0]
            if not key or len(key) > 200:
                return self._json(400, {"error": "Invalid key identifier."})
            return self._json(200, {"settings": load_key_settings(key)})
        return self._json(404, {"error": "Not found"})

    def do_POST(self) -> None:
        if not self._authorized():
            return self._json(403, {"error": "Local authorization required"})
        try:
            body = self._read_json()
            path = urlparse(self.path).path
            if path == "/api/discover":
                target = str(body.get("target") or detected_broadcast())
                try:
                    ipaddress.IPv4Address(target)
                except ipaddress.AddressValueError:
                    return self._json(400, {"error": "Enter a valid IPv4 broadcast address."})
                if not SCAN_LOCK.acquire(blocking=False):
                    return self._json(409, {"error": "A scan is already running."})
                try:
                    results = asyncio.run(_discover(target, timeout=10))
                finally:
                    SCAN_LOCK.release()
                with STATE_LOCK:
                    old = DEVICES.copy()
                    merged = {ip: {**item, "online": False} for ip, item in old.items()}
                    for item in results:
                        previous = old.get(item["ip"], {})
                        item.update({k: v for k, v in previous.items() if k in {"state", "brightness", "colorTemp", "hsv", "firmware", "name"} and v not in (None, "")})
                        item["online"] = True
                        merged[item["ip"]] = item
                    DEVICES.clear()
                    DEVICES.update(merged)
                    response = sorted(DEVICES.values(), key=lambda device: device["ip"])
                save_devices(response)
                return self._json(200, {"devices": response, "found": len(results)})
            if path == "/api/login":
                username = str(body.get("username") or "").strip()
                password = str(body.get("password") or "")
                if not username or not password:
                    return self._json(400, {"error": "Enter your Tapo account email and password."})
                ok, message = asyncio.run(_validate_and_save(username, password))
                if not ok:
                    return self._json(401, {"error": message})
                return self._json(200, {"ok": True, "message": message})
            if path == "/api/logout":
                delete_credentials()
                return self._json(200, {"ok": True})
            if path == "/api/setup-opened":
                mark_setup_page_opened()
                return self._json(200, {"ok": True})
            if path == "/api/refresh":
                credentials_data = load_credentials()
                if credentials_data is None:
                    return self._json(401, {"error": "Sign in first to refresh device state."})
                credentials = Credentials(*credentials_data)
                with STATE_LOCK:
                    targets = list(DEVICES)
                results = asyncio.run(_refresh_all(targets, credentials))
                with STATE_LOCK:
                    DEVICES.clear()
                    DEVICES.update({item["ip"]: item for item in results})
                    response = list(DEVICES.values())
                save_devices(response)
                return self._json(200, {"devices": response})
            if path == "/api/control":
                return self._handle_control(body)
            if path == "/api/presets":
                presets = body.get("presets")
                if not isinstance(presets, list) or len(presets) > 100:
                    return self._json(400, {"error": "Invalid presets."})
                save_presets(presets)
                return self._json(200, {"presets": presets})
            if path == "/api/key-settings":
                key = str(body.get("key") or "")
                settings = body.get("settings")
                if not key or len(key) > 200 or not isinstance(settings, dict):
                    return self._json(400, {"error": "Invalid key settings."})
                save_key_settings(key, settings)
                return self._json(200, {"ok": True})
            return self._json(404, {"error": "Not found"})
        except (ValueError, TypeError, json.JSONDecodeError) as exc:
            return self._json(400, {"error": str(exc)})
        except Exception as exc:
            return self._json(500, {"error": f"{type(exc).__name__}: {exc}"})

    def _handle_control(self, body: dict[str, Any]) -> None:
        credentials_data = load_credentials()
        if credentials_data is None:
            return self._json(401, {"error": "Sign in first."})
        target = body.get("devices")
        action = str(body.get("action") or "")
        params = body.get("params") if isinstance(body.get("params"), dict) else {}
        with STATE_LOCK:
            known = set(DEVICES)
        legacy_target = str(body.get("device") or "")
        if isinstance(target, list):
            ips = list(dict.fromkeys(str(ip) for ip in target if isinstance(ip, str)))
        elif isinstance(target, str) and target:
            ips = [target]
        elif legacy_target == "both":
            ips = sorted(known)
        elif legacy_target:
            ips = [legacy_target]
        else:
            ips = []
        if not ips or any(ip not in known for ip in ips):
            return self._json(400, {"error": "Select one or more discovered bulbs in this key’s settings."})
        if action not in {"on", "off", "toggle", "brightness", "temperature", "color"}:
            return self._json(400, {"error": "Unsupported light action."})
        try:
            credentials = Credentials(*credentials_data)
            async def apply_all():
                return await asyncio.gather(*(_apply_control(ip, credentials, action, params) for ip in ips))
            results = asyncio.run(apply_all())
            return self._json(200, {"results": results})
        except Exception as exc:
            return self._json(502, {"error": f"{type(exc).__name__}: {exc}"})


async def _refresh_all(ips: list[str], credentials: Credentials) -> list[dict[str, Any]]:
    async def read_one(ip: str) -> dict[str, Any]:
        try:
            return await _read_device(ip, credentials)
        except Exception:
            previous = next((d for d in load_devices() if d.get("ip") == ip), {"ip": ip})
            previous.update({"online": False, "state": None})
            return previous

    return await asyncio.gather(*(read_one(ip) for ip in ips))


def _watch_parent_process(server: ThreadingHTTPServer, parent_pid: int) -> None:
    """Shut down the helper if the Stream Deck plugin process disappears."""
    # Give the server's serve_forever loop time to start before shutdown can be
    # requested, including when the parent has already exited at launch time.
    threading.Event().wait(1)
    if os.name == "nt":
        import ctypes
        from ctypes import wintypes

        synchronize = 0x00100000
        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel32.OpenProcess.argtypes = (wintypes.DWORD, wintypes.BOOL, wintypes.DWORD)
        kernel32.OpenProcess.restype = wintypes.HANDLE
        kernel32.WaitForSingleObject.argtypes = (wintypes.HANDLE, wintypes.DWORD)
        kernel32.WaitForSingleObject.restype = wintypes.DWORD
        kernel32.CloseHandle.argtypes = (wintypes.HANDLE,)
        kernel32.CloseHandle.restype = wintypes.BOOL
        handle = kernel32.OpenProcess(synchronize, False, parent_pid)
        if not handle:
            print(f"[TapoDeck] Could not monitor parent process {parent_pid}.")
            server.shutdown()
            return
        try:
            # Polling with a one-second timeout lets serve_forever start before
            # shutdown can be requested if the parent exited during startup.
            while True:
                result = kernel32.WaitForSingleObject(handle, 1000)
                if result == 0x00000102:  # WAIT_TIMEOUT
                    continue
                if result == 0x00000000:  # WAIT_OBJECT_0
                    print("[TapoDeck] Stream Deck plugin exited; stopping local engine.")
                else:
                    print("[TapoDeck] Parent monitor failed; stopping local engine.")
                server.shutdown()
                break
        finally:
            kernel32.CloseHandle(handle)
        return

    while True:
        try:
            os.kill(parent_pid, 0)
        except ProcessLookupError:
            print("[TapoDeck] Stream Deck plugin exited; stopping local engine.")
            server.shutdown()
            return
        except PermissionError:
            # The process exists but belongs to another user; keep monitoring.
            pass
        threading.Event().wait(1)


def run(open_browser: bool = True, parent_pid: int | None = None) -> None:
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Tapo Deck is running at http://{HOST}:{PORT}")
    print(f"Local data folder: {data_dir()}")
    if parent_pid:
        threading.Thread(
            target=_watch_parent_process,
            args=(server, parent_pid),
            name="tapo-parent-monitor",
            daemon=True,
        ).start()
    if open_browser:
        threading.Timer(0.8, lambda: webbrowser.open(f"http://{HOST}:{PORT}")).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument("--port", type=int, default=PORT)
    parser.add_argument("--parent-pid", type=int, help="Stop the local engine when this plugin process exits")
    args = parser.parse_args()
    PORT = args.port
    run(open_browser=not args.no_browser, parent_pid=args.parent_pid)
