#!/usr/bin/env python3
"""
Generates the per-app copies of shared frontend code from packages/frontend-shared/src/.

    python3 scripts/sync_shared_frontend.py          # write every generated file
    python3 scripts/sync_shared_frontend.py --check  # exit 1 if any copy has drifted (pre-commit)

Each app keeps its copy at the path it already imports from (so no import site changes), but the
copy is generated: the shared source plus a GENERATED FILE banner. Never edit a copy by hand —
edit the source, run this, commit both.

The logo is one path constant (BRAND_MARK_PATH in BrandMark.tsx); each app's public/favicon.svg
and PWA PNG icons are drawn from it, so changing the mark there changes it everywhere. PNGs need
rsvg-convert and are not part of --check (binary, renderer-dependent).
"""
import re
import shutil
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SHARED_DIR = REPO_ROOT / "packages/frontend-shared/src"
COMMAND = "python3 scripts/sync_shared_frontend.py"

FINANCE = "majordom-financiar/frontend"
TRANSPORT = "tools/vehicle-manager/frontend"
INVEST = "tools/investment-manager/frontend"
ALL_APPS = (FINANCE, TRANSPORT, INVEST)

# source file -> (apps, path inside each app). investment-manager keeps its own lib/format.ts,
# a differently shaped module, so it gets no formatCurrency/formatDate copy.
MANIFEST = {
    "formatCurrency.ts": ((FINANCE, TRANSPORT), "src/lib/formatCurrency.ts"),
    "formatDate.ts": ((FINANCE, TRANSPORT), "src/lib/formatDate.ts"),
    "tokens.css": (ALL_APPS, "src/styles/tokens.css"),
    "BrandMark.tsx": (ALL_APPS, "src/components/BrandMark.tsx"),
    "shell/AppShell.tsx": (ALL_APPS, "src/components/shell/AppShell.tsx"),
    "shell/MobileTabBar.tsx": (ALL_APPS, "src/components/shell/MobileTabBar.tsx"),
    "shell/MoreSheet.tsx": (ALL_APPS, "src/components/shell/MoreSheet.tsx"),
    "shell/Page.tsx": (ALL_APPS, "src/components/shell/Page.tsx"),
    "shell/appLinks.ts": (ALL_APPS, "src/components/shell/appLinks.ts"),
    "shell/cx.ts": (ALL_APPS, "src/components/shell/cx.ts"),
    "shell/PageHeader.tsx": (ALL_APPS, "src/components/shell/PageHeader.tsx"),
    "shell/appearance.ts": (ALL_APPS, "src/components/shell/appearance.ts"),
    "shell/AppearanceSettings.tsx": (ALL_APPS, "src/components/shell/AppearanceSettings.tsx"),
}

# Dark tile (the apps default to dark) — the favicon can't follow the in-app theme.
TILE, GLYPH = "#ECEBE6", "#131312"


def banner(source: str, suffix: str) -> str:
    first = f"GENERATED FILE — do not edit directly. Source: packages/frontend-shared/src/{source}."
    second = f"Run {COMMAND} after editing the source, then commit both."
    if suffix == ".css":
        return f"/* {first}\n   {second} */\n\n"
    if suffix == ".svg":
        return f"<!-- {first} {second} -->\n"
    return f"// {first}\n// {second}\n\n"


def brand_path() -> str:
    text = (SHARED_DIR / "BrandMark.tsx").read_text()
    match = re.search(r"BRAND_MARK_PATH\s*=\s*'([^']+)'", text)
    if not match:
        sys.exit("BrandMark.tsx: BRAND_MARK_PATH constant not found")
    return match.group(1)


def favicon_svg(maskable: bool = False) -> str:
    """The mark as a standalone SVG. Maskable = full-bleed square with the glyph in the safe zone."""
    path = brand_path()
    if maskable:
        return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
                f'<rect width="100" height="100" fill="{TILE}"/>'
                f'<g transform="translate(12.5 12.5) scale(0.75)"><path d="{path}" fill="{GLYPH}"/></g></svg>\n')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
            f'<rect width="100" height="100" rx="24" fill="{TILE}"/><path d="{path}" fill="{GLYPH}"/></svg>\n')


def expected_text_files() -> dict[Path, str]:
    files: dict[Path, str] = {}
    for source, (apps, rel) in MANIFEST.items():
        content = banner(source, Path(source).suffix) + (SHARED_DIR / source).read_text()
        for app in apps:
            files[REPO_ROOT / app / rel] = content
    favicon = banner("BrandMark.tsx", ".svg") + favicon_svg()
    for app in ALL_APPS:
        files[REPO_ROOT / app / "public/favicon.svg"] = favicon
    return files


def write_png_icons() -> None:
    renderer = shutil.which("rsvg-convert")
    if not renderer:
        print("rsvg-convert not found — PWA PNG icons NOT regenerated", file=sys.stderr)
        return
    variants = {False: ("icon-192.png", "icon-512.png"), True: ("icon-192-maskable.png", "icon-512-maskable.png")}
    for maskable, names in variants.items():
        svg = favicon_svg(maskable).encode()
        for name in names:
            size = name.split("-")[1].split(".")[0]
            png = subprocess.run([renderer, "-w", size, "-h", size], input=svg,
                                 capture_output=True, check=True).stdout
            for app in ALL_APPS:
                (REPO_ROOT / app / "public" / name).write_bytes(png)


def main() -> int:
    files = expected_text_files()
    if "--check" in sys.argv:
        stale = [str(p.relative_to(REPO_ROOT)) for p, c in files.items()
                 if not p.exists() or p.read_text() != c]
        if stale:
            print("Generated shared-frontend copies are out of date:", *stale, sep="\n  ", file=sys.stderr)
            print(f"Edit packages/frontend-shared/src/, then run: {COMMAND}", file=sys.stderr)
            return 1
        return 0
    for path, content in files.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
        print(f"synced -> {path.relative_to(REPO_ROOT)}")
    write_png_icons()
    return 0


if __name__ == "__main__":
    sys.exit(main())
