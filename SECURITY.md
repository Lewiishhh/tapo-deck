# Security

## Runtime boundaries

- The Python engine binds to `127.0.0.1`; it is not a service exposed to the LAN.
- The local API requires a random bearer token and checks the host and origin.
- Device discovery and control traffic are sent on the user's local network to Tapo devices.
- Saved Tapo credentials are protected with Windows DPAPI for the current Windows user.
- The engine is tied to the Stream Deck plugin process and exits when that process exits.
- The project contains no telemetry, analytics, hosted backend, or cloud relay.

## Reporting a concern

Do not publish passwords, access tokens, or unredacted network logs in an issue. If you find a security problem, open a GitHub issue without sensitive details and ask the maintainer for a private contact route before sharing a proof of concept.
