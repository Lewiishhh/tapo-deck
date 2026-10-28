# Tapo Deck Plugin

**Control compatible TP-Link Tapo smart bulbs from Elgato Stream Deck over your local network.**

Tapo Deck is a Windows Stream Deck plugin with its local engine built in. There is no separate companion app to install or keep open.

## Current submission

- **Version:** 0.2.18.7 (Stream Deck SDK 3)
- **Marketplace status:** Submitted to Elgato Maker Console; review is pending.
- **Installer:** [TapoDeck-0.2.18.7-SDKv3.streamDeckPlugin](releases/TapoDeck-0.2.18.7-SDKv3.streamDeckPlugin)
- **Matching source:** [TapoDeck-0.2.18.7-SDKv3-Source.zip](releases/TapoDeck-0.2.18.7-SDKv3-Source.zip)
- **SHA-256:** [Installer checksum](releases/TapoDeck-0.2.18.7-SHA256.txt)
- **Release notes:** [What changed in 0.2.18.7](releases/TapoDeck-0.2.18.7-Release-notes.txt)

Version 0.2.18.7 is the corrected SDK 3 build submitted for official Elgato Stream Deck Marketplace review. It is not the earlier 0.2.18 candidate that was withdrawn. The Marketplace review is pending; approval is not implied.

## What it can do

- Discover compatible Tapo bulbs on the same local network as the PC.
- Authenticate locally with Tapo account credentials and store the saved sign-in encrypted with Windows DPAPI.
- Select one or more bulbs for a Stream Deck key.
- Drag dedicated actions for power toggle, brightness, colour, and white temperature onto keys; the configurable control action also supports power controls.
- Set brightness, choose a white temperature, and change colour while preserving each bulb's current brightness. Colour controls require a multicolour bulb; white-only models can use white temperature instead.
- Configure key actions in Stream Deck, with automatic local settings saving and an explicit **Save settings** button.
- Open the bundled local setup page to sign in, find bulbs, remove saved credentials, and read the About and security information.

Set up each bulb in the official Tapo phone app first. Keep the bulbs switched on at the wall switch while finding and signing in to them, and connect the PC and bulbs to the same network. Enable Third-Party Compatibility in the Tapo app if prompted.

## Privacy and security

Tapo Deck does not operate its own cloud service, telemetry, analytics, advertising, or remote-control relay. It does not send your credentials, bulb list, or commands to the project author. Credentials are used from this PC for local authentication with bulbs and, if saved, are encrypted for your Windows account using Windows DPAPI. The official Tapo app and any services it uses are separate and operated by TP-Link.

The local engine listens on this PC's loopback interface, uses a temporary authorization token, starts with the Stream Deck plugin, and stops when the plugin closes. Discovery and bulb control traffic stay on the local network.

An earlier 0.2.18 candidate was withdrawn after a Microsoft Defender Wacatac alert. The 0.2.18.7 SDK 3 package is the corrected build submitted for Marketplace review. This repository does not claim that Microsoft Defender or another antivirus vendor has cleared 0.2.18.7; check current scan results and the checksum above before installing.

See [SECURITY.md](SECURITY.md) for the local security boundaries and [PRIVACY.md](PRIVACY.md) for the data handling details. Do not post credentials, tokens, or unredacted device logs in public issues.

## Requirements

- Windows 10 or later.
- Elgato Stream Deck software 7.1 or later and a Stream Deck with keypad keys.
- Tapo bulbs configured in the official Tapo app and reachable on the same local network as the PC.
- Bulbs powered on at the wall switch during discovery and local sign-in.

The author has tested the plugin with Tapo L530B (EU), hardware revision 3.0, firmware 1.4.4 Build 260716. Other supported Tapo bulb models may work, but have not all been tested.

The prebuilt `.streamDeckPlugin` package does not require a separate Python, Node.js, or Tapo Deck desktop-app installation.

## Install

1. Set up the bulbs in the official Tapo app, switch them on, and connect them and the PC to the same network.
2. Download and open the [v0.2.18.7 installer](releases/TapoDeck-0.2.18.7-SDKv3.streamDeckPlugin) with Stream Deck installed.
3. Drag a Tapo Deck action onto a Stream Deck key.
4. Open the local setup page from the action settings, find the bulbs, and sign in locally.
5. Choose the bulbs and options for each key, then save. Use Stream Deck's title field to name the key.

## Build from source

Release builds use Windows, Python 3.11, and the Elgato Stream Deck SDK dependency declared in the plugin's `package-lock.json`.

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r app\requirements-release.lock
npm --prefix app\plugin\com.evere.tapodeck.sdPlugin ci
.\.venv\Scripts\python.exe app\build_windows_app.py
.\.venv\Scripts\python.exe app\build_streamdeck_plugin.py
```

The packaged plugin is written to `app/dist/TapoDeck.streamDeckPlugin`. See [app/README.md](app/README.md) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for implementation and dependency information.

## Project and attribution

This is an independent community project. It is not affiliated with or endorsed by TP-Link, Tapo, or Elgato. Created by **Lewiishhh with AI coding assistance**. The product direction, requirements, device testing, and release decisions are the author's; AI tools assisted with implementation, debugging, and documentation.

## License

Tapo Deck is licensed under GNU GPL version 3 or (at your option) any later version. See [LICENSE](LICENSE) and the third-party notices for bundled dependency terms.