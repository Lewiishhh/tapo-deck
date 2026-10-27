"""Windows-local storage for Tapo Deck credentials and app state."""

from __future__ import annotations

import base64
import ctypes
import json
import os
from ctypes import wintypes
from pathlib import Path


class DATA_BLOB(ctypes.Structure):
    _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_byte))]


def data_dir() -> Path:
    base = os.environ.get("LOCALAPPDATA")
    if not base:
        raise RuntimeError("Windows local app-data directory is unavailable")
    path = Path(base) / "TapoDeck"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _blob(data: bytes) -> tuple[DATA_BLOB, ctypes.Array]:
    buffer = ctypes.create_string_buffer(data)
    return DATA_BLOB(len(data), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_byte))), buffer


def _dpapi(data: bytes, *, decrypt: bool) -> bytes:
    if os.name != "nt":
        raise RuntimeError("Windows DPAPI is required for credential storage")
    crypt32 = ctypes.WinDLL("crypt32", use_last_error=True)
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    source, _buffer = _blob(data)
    output = DATA_BLOB()
    if decrypt:
        ok = crypt32.CryptUnprotectData(
            ctypes.byref(source), None, None, None, None, 0, ctypes.byref(output)
        )
    else:
        ok = crypt32.CryptProtectData(
            ctypes.byref(source), "Tapo Deck credentials", None, None, None,
            0, ctypes.byref(output)
        )
    if not ok:
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        return ctypes.string_at(output.pbData, output.cbData)
    finally:
        kernel32.LocalFree(ctypes.cast(output.pbData, ctypes.c_void_p))


def save_credentials(username: str, password: str) -> None:
    data = json.dumps({"username": username, "password": password}).encode("utf-8")
    protected = _dpapi(data, decrypt=False)
    (data_dir() / "credentials.bin").write_bytes(protected)


def load_credentials() -> tuple[str, str] | None:
    path = data_dir() / "credentials.bin"
    if not path.exists():
        return None
    raw = json.loads(_dpapi(path.read_bytes(), decrypt=True).decode("utf-8"))
    return str(raw["username"]), str(raw["password"])


def delete_credentials() -> None:
    (data_dir() / "credentials.bin").unlink(missing_ok=True)


def setup_page_opened() -> bool:
    return (data_dir() / "setup_page_opened").exists()


def mark_setup_page_opened() -> None:
    (data_dir() / "setup_page_opened").write_text("1", encoding="ascii")


def api_token() -> str:
    path = data_dir() / "api_token"
    if path.exists():
        return path.read_text(encoding="ascii").strip()
    import secrets

    token = secrets.token_urlsafe(32)
    path.write_text(token, encoding="ascii")
    return token


def load_devices() -> list[dict]:
    path = data_dir() / "devices.json"
    if not path.exists():
        return []
    try:
        items = json.loads(path.read_text(encoding="utf-8"))
        return items if isinstance(items, list) else []
    except (OSError, ValueError):
        return []


def save_devices(devices: list[dict]) -> None:
    path = data_dir() / "devices.json"
    path.write_text(json.dumps(devices, indent=2), encoding="utf-8")


def load_presets() -> list[dict]:
    path = data_dir() / "presets.json"
    if not path.exists():
        return []
    try:
        items = json.loads(path.read_text(encoding="utf-8"))
        return items if isinstance(items, list) else []
    except (OSError, ValueError):
        return []


def save_presets(presets: list[dict]) -> None:
    (data_dir() / "presets.json").write_text(
        json.dumps(presets, indent=2), encoding="utf-8"
    )


def load_key_settings(key: str) -> dict | None:
    path = data_dir() / "key_settings.json"
    if not path.exists():
        return None
    try:
        items = json.loads(path.read_text(encoding="utf-8"))
        value = items.get(key) if isinstance(items, dict) else None
        return value if isinstance(value, dict) else None
    except (OSError, ValueError):
        return None


def save_key_settings(key: str, settings: dict) -> None:
    path = data_dir() / "key_settings.json"
    try:
        items = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
        if not isinstance(items, dict):
            items = {}
    except (OSError, ValueError):
        items = {}
    items[key] = settings
    path.write_text(json.dumps(items, indent=2), encoding="utf-8")
