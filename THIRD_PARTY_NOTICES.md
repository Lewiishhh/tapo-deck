# Third-party notices

The standalone v0.2.18.7 Windows plugin bundles the Python runtime and the runtime packages below. Their license texts are included in `THIRD_PARTY_LICENSES/` in this repository and inside the `.streamDeckPlugin` package.

| Component | Version | License |
|---|---:|---|
| [python-kasa](https://pypi.org/project/python-kasa/0.12.0/) | 0.12.0 | GPL-3.0-or-later |
| [aiohttp](https://pypi.org/project/aiohttp/3.14.5/) | 3.14.5 | Apache-2.0 OR MIT |
| [aiohappyeyeballs](https://pypi.org/project/aiohappyeyeballs/2.7.1/) | 2.7.1 | PSF-2.0 |
| [aiosignal](https://pypi.org/project/aiosignal/1.4.0/) | 1.4.0 | Apache-2.0 |
| [asyncclick](https://pypi.org/project/asyncclick/8.4.2.1/) | 8.4.2.1 | BSD-3-Clause |
| [attrs](https://pypi.org/project/attrs/26.1.0/) | 26.1.0 | MIT |
| [cffi](https://pypi.org/project/cffi/2.1.1/) | 2.1.1 | MIT-0 |
| [colorama](https://pypi.org/project/colorama/0.4.6/) | 0.4.6 | BSD-3-Clause |
| [cryptography](https://pypi.org/project/cryptography/50.0.2/) | 50.0.2 | Apache-2.0 OR BSD-3-Clause |
| [frozenlist](https://pypi.org/project/frozenlist/1.8.0/) | 1.8.0 | Apache-2.0 |
| [idna](https://pypi.org/project/idna/3.20/) | 3.20 | BSD-3-Clause |
| [mashumaro](https://pypi.org/project/mashumaro/3.23/) | 3.23 | Apache-2.0 |
| [multidict](https://pypi.org/project/multidict/7.2.1/) | 7.2.1 | Apache-2.0 |
| [propcache](https://pypi.org/project/propcache/0.5.4/) | 0.5.4 | Apache-2.0 |
| [pycparser](https://pypi.org/project/pycparser/3.12/) | 3.12 | BSD-3-Clause |
| [typing_extensions](https://pypi.org/project/typing-extensions/4.16.0/) | 4.16.0 | PSF-2.0 |
| [tzdata](https://pypi.org/project/tzdata/2026.5/) | 2026.5 | Apache-2.0 |
| [yarl](https://pypi.org/project/yarl/1.25.1/) | 1.25.1 | Apache-2.0 |
| Python runtime | 3.11.9 | PSF-2.0 |

The build uses PyInstaller. PyInstaller is a build tool, not a runtime dependency; its GPL license includes an exception permitting distribution of programs built with it. See the PyInstaller project for its license and exception.

The `python-kasa` dependency is GPL-3.0-or-later. Tapo Deck is consequently released under GPL-3.0-or-later. See `LICENSE` for the full license text.

## Stream Deck SDK dependencies

The plugin includes Elgato's official `@elgato/streamdeck` package version 2.1.2 and its runtime dependencies (`@elgato/utils`, `@elgato/schemas`, `ws`, and `zod`). These dependency license texts are included in `THIRD_PARTY_LICENSES/Node-SDK/` and in the plugin package.

Zod is pinned to 4.6.7 through an npm override. This keeps the API used by the SDK (`zod/v4-mini`) while addressing the reported advisory affecting the transitive Zod 3 version.

These notices describe the versions bundled for Tapo Deck Plugin 0.2.18.7. Rebuilding with different dependency versions may change the applicable notices.