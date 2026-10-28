# Security

## Runtime boundaries

- The local engine binds to `127.0.0.1`; it is not exposed as a service on the LAN.
- The local API requires a temporary random bearer token and checks the host and origin.
- Device discovery and control traffic goes over the user's local network to Tapo devices.
- Saved credentials are protected with Windows DPAPI for the Windows account that saved them.
- The engine starts with the Stream Deck plugin and stops when the plugin closes.
- Tapo Deck operates no cloud backend, telemetry, analytics, or remote-control relay.

## Release status

The current submitted build is the corrected v0.2.18.7 package using Stream Deck SDK 3. It is not the earlier 0.2.18 candidate that triggered a Microsoft Defender Wacatac alert and was withdrawn. Version 0.2.18.7 has been submitted for official Elgato Stream Deck Marketplace review. Marketplace review is separate from antivirus scanning; this project does not claim that Defender or another antivirus vendor has cleared this exact installer. Check the installer checksum and current scan results before installing.

## Reporting a concern

Do not publish passwords, access tokens, or unredacted network logs in an issue. Open a GitHub issue without sensitive details and ask the maintainer for a private contact route before sharing a proof of concept.