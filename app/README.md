# Development notes

The plugin source is in `plugin/com.evere.tapodeck.sdPlugin`. Its JavaScript entry point talks to Stream Deck and starts the bundled local engine. The Python engine is `server.py`; its local interface is in `web/` and credential storage is in `local_store.py`.

For install requirements, privacy details, supported actions, and build commands, see the repository [README](../README.md).

The standalone release is self-contained. Contributors building from source should read `THIRD_PARTY_NOTICES.md`; the build script copies the notice and license files into the packaged plugin.
