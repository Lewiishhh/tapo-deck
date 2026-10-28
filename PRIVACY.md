# Tapo Deck Privacy Policy

**Effective date: 27 October 2026**

Tapo Deck is an independent Windows plugin for controlling compatible TP-Link Tapo bulbs from Elgato Stream Deck. This policy describes the data handled by Tapo Deck itself. It does not cover the separate Tapo phone app, TP-Link services, or Elgato Stream Deck software.

## Data handled on your PC

- **Tapo account email and password:** used to authenticate directly with discovered bulbs on your local network. If you choose to save the sign-in, Tapo Deck encrypts it for your Windows account using Windows Data Protection API (DPAPI).
- **Bulb and control settings:** discovered bulb names, local IP addresses, device identifiers, saved presets, and key settings are stored in Tapo Deck's local application-data folder so the plugin can remember your setup.
- **Temporary local authorization token:** the bundled engine uses a random token to authorize requests from the plugin on this PC.

Tapo Deck does not operate a cloud service, analytics or telemetry endpoint, advertising service, or remote-control relay. The project does not receive your credentials, bulb information, or button presses.

## Network connections

The plugin discovers bulbs and sends authentication and control requests directly over your local network. Your Tapo credentials are supplied to the bulbs for local authentication. Tapo Deck does not sign in to your TP-Link cloud account. The official Tapo app and any network traffic it generates are separate and controlled by TP-Link.

Building the project from source may download development dependencies from their package repositories. That is separate from using the installed plugin.

## Retention and deletion

Use **Remove credentials** on the local setup page to delete the saved Tapo sign-in. This does not erase bulb discovery data or button settings. To remove all Tapo Deck local data, close Stream Deck and delete the `%LOCALAPPDATA%\TapoDeck` folder in Windows. Removing the plugin does not necessarily remove this folder.

## Security

Saved credentials are protected with Windows DPAPI for the Windows account that saved them. Local engine requests are restricted to this PC and require a local authorization token. Keep Windows and Stream Deck up to date, and only install Tapo Deck builds from a source you trust.

## Contact

For privacy questions or support, use the project's [GitHub repository](https://github.com/Lewiishhh/tapo-deck) or [GitHub Issues](https://github.com/Lewiishhh/tapo-deck/issues). Do not post passwords, account details, or sensitive device information in public issues.

Tapo Deck is an independent community project and is not affiliated with or endorsed by TP-Link, Tapo, or Elgato.
