# Tapo Deck

**Control TP-Link Tapo smart bulbs from Elgato Stream Deck, directly over your home network.**

Tapo Deck is a Windows Stream Deck plugin with its local control engine included. There is no separate companion app to install or keep open. The source is published here, and the current standalone plugin installer is included under [`releases/`](releases/TapoDeck-0.2.16.streamDeckPlugin).

> **Current release: 0.2.16** — [Download the Stream Deck installer](releases/TapoDeck-0.2.16.streamDeckPlugin)

## What it can do

- Find compatible Tapo bulbs on the local network.
- Sign in locally and save credentials encrypted for your Windows account.
- Configure each key to control one or more selected bulbs.
- Create keys for on, off, toggle, brightness, white temperature, and color.
- Set brightness values from 1% to 100%, choose a color temperature, or use a color preset/custom color.
- Use the bundled local setup page to discover lights, check their status, and create or manage presets.
- Keep each key's device selection and settings with that key, including its title in Stream Deck.

The Stream Deck plugin starts the bundled engine only when needed. The engine stops when the plugin closes, listens on this PC's loopback interface, and uses a local authorization token for its API.

## Privacy and network traffic

Tapo Deck has **no Tapo Deck cloud service, analytics, telemetry, advertising, or remote-control relay**. It does not send your credentials, device list, button presses, or light commands to the project author or a server operated by this project.

The plugin uses your local network to discover bulbs and send authentication exchanges and control commands directly to the selected bulbs. Your Tapo email and password are stored on this PC using Windows DPAPI and are supplied to bulbs for local authentication. They are not uploaded by Tapo Deck.

Tapo Deck does not sign in to a TP-Link/Tapo cloud account on your behalf. The official Tapo app and any services it uses are separate and operated by TP-Link; their traffic and privacy practices are outside this project's control. You need to set up the bulbs in the official phone app first.

Build tools download Python packages from PyPI when building from source. That is a development-time action; the installed plugin does not contact PyPI or the project author's computer.

## Requirements

For the prebuilt plugin:

- Windows 10 or later.
- Elgato Stream Deck software **7.1 or later**. This plugin uses the Node.js 24 runtime; Elgato lists that runtime starting with Stream Deck 7.1.
- A Stream Deck with keypad keys.
- Compatible Tapo bulbs configured in the official Tapo app and reachable from the same local network as the PC. Enable Third-Party Compatibility in the Tapo app if your bulb/app requires it.

The current build was tested by the project author with two Tapo L530B (EU) bulbs, hardware revision 3.0, firmware 1.4.4 Build 260716. Other python-kasa-supported bulbs may work, but have not all been tested.

You do **not** need to install Python, Node.js, or a separate Tapo Deck desktop app to use the prebuilt `.streamDeckPlugin` package.

## Install

1. Download [`TapoDeck-0.2.16.streamDeckPlugin`](releases/TapoDeck-0.2.16.streamDeckPlugin).
2. Open the file and allow Stream Deck to install the plugin.
3. Drag **Tapo Deck → Control a Tapo light** onto a key.
4. Open the key's settings, use the local setup page to sign in and find your bulbs, then choose the bulb or bulbs for that key.
5. Choose the action and its settings. Use Stream Deck's own title field to name the key.

The account sign-in is only for local bulb authentication. Set the bulbs up in the Tapo phone app before connecting them here.

## Build from source

Builds currently target Windows. Python 3.11 is used for the release build.

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r app\requirements-release.lock
.\.venv\Scripts\python.exe app\build_windows_app.py
.\.venv\Scripts\python.exe app\build_streamdeck_plugin.py
```

The result is `app/dist/TapoDeck.streamDeckPlugin`. The build packages the Python engine, frontend, required license notices, and Stream Deck plugin files together. No Node.js install is required for this project's Python-based build scripts. Elgato's official Stream Deck CLI is an optional route for validating/packaging plugin projects; that CLI has its own Node.js and Stream Deck requirements.

See [`app/README.md`](app/README.md) for implementation notes and [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) for bundled dependency licenses.

## Compatibility and distribution

This is an independent community project. It is not made by, affiliated with, or endorsed by TP-Link, Tapo, or Elgato. Product names are used only to identify compatible devices and software.

A GitHub-hosted source repository and direct plugin download do not require an Elgato Marketplace listing. Marketplace distribution is a separate process: Elgato provides its own plugin validation/packaging tools and requires submission and review through Maker Console. See Elgato's [distribution guide](https://docs.elgato.com/streamdeck/sdk/introduction/distribution/) and [manifest reference](https://docs.elgato.com/streamdeck/sdk/references/manifest/).

## Authorship and AI transparency

Created by **Lewiishhh** with **AI coding assistance**. The project idea, requirements, design direction, testing with the author's own lights, and release decisions are the author's; AI tools assisted with implementation, debugging, and documentation. The complete source code for the project is available in this repository.

## License

Tapo Deck is released under **GNU GPL version 3 or (at your option) any later version**. The bundled `python-kasa` library is GPL-3.0-or-later, so the project uses a compatible copyleft license. The full license and notices for dependencies included in the standalone build are included with this repository and installer.

