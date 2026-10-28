# Additional Node.js dependencies

The SDK v3 candidate includes Elgato's official `@elgato/streamdeck` 2.1.2 package and its runtime dependencies (`@elgato/utils`, `@elgato/schemas`, `ws`, and `zod`). Their license texts are included in `THIRD_PARTY_LICENSES/Node-SDK/` and in the packaged dependency folders where provided.

Zod is pinned to 4.6.7 using npm overrides. The Stream Deck SDK's runtime imports the `zod/v4-mini` API; this override addresses the advisory reported for the transitive Zod 3 version while retaining that API.
