"""Package the plugin folder into an Elgato Stream Deck plugin installer."""

from pathlib import Path
from shutil import copy2
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parent
PLUGIN = ROOT / "plugin" / "com.evere.tapodeck.sdPlugin"
OUTPUT = ROOT / "dist" / "TapoDeck.streamDeckPlugin"

if __name__ == "__main__":
    from plugin.create_icons import main as create_icons

    engine = ROOT / "dist" / "windows" / "TapoDeck.exe"
    if not engine.is_file():
        raise SystemExit("Build app/dist/windows/TapoDeck.exe first; it is bundled as the plugin's hidden local engine.")
    engine_dir = PLUGIN / "bin"
    engine_dir.mkdir(parents=True, exist_ok=True)
    copy2(engine, engine_dir / "TapoDeckService.exe")
    notices = ROOT / "THIRD_PARTY_NOTICES.md"
    license_file = ROOT / "LICENSE"
    if notices.is_file():
        copy2(notices, PLUGIN / "THIRD_PARTY_NOTICES.md")
    if license_file.is_file():
        copy2(license_file, PLUGIN / "LICENSE")
    licenses = ROOT / "THIRD_PARTY_LICENSES"
    if licenses.is_dir():
        bundled_licenses = PLUGIN / "THIRD_PARTY_LICENSES"
        bundled_licenses.mkdir(parents=True, exist_ok=True)
        for item in licenses.rglob("*"):
            if item.is_file():
                destination = bundled_licenses / item.relative_to(licenses)
                destination.parent.mkdir(parents=True, exist_ok=True)
                copy2(item, destination)
    create_icons()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(OUTPUT, "w", ZIP_DEFLATED) as archive:
        for item in PLUGIN.rglob("*"):
            if item.is_file():
                archive.write(item, item.relative_to(PLUGIN.parent).as_posix())
    print(f"Created {OUTPUT}")
