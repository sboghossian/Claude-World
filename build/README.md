# build/

This directory contains static assets used by electron-builder during packaging.

## Required files

| File | Description |
|---|---|
| `icon.icns` | macOS app icon (1024x1024 base, icns format) |
| `icon.png` | PNG version for Linux (1024x1024) |
| `icon.ico` | Windows icon (multi-resolution ICO) |
| `dmg-background.png` | DMG installer background (540x380px, dark themed) |
| `entitlements.mac.plist` | macOS hardened runtime entitlements (already present) |

## Generating icon.icns from a 1024x1024 PNG

Given a source file `icon-1024.png`:

```bash
# Create iconset directory
mkdir -p claude-world.iconset

# Generate all required sizes
sips -z 16 16     icon-1024.png --out claude-world.iconset/icon_16x16.png
sips -z 32 32     icon-1024.png --out claude-world.iconset/icon_16x16@2x.png
sips -z 32 32     icon-1024.png --out claude-world.iconset/icon_32x32.png
sips -z 64 64     icon-1024.png --out claude-world.iconset/icon_32x32@2x.png
sips -z 128 128   icon-1024.png --out claude-world.iconset/icon_128x128.png
sips -z 256 256   icon-1024.png --out claude-world.iconset/icon_128x128@2x.png
sips -z 256 256   icon-1024.png --out claude-world.iconset/icon_256x256.png
sips -z 512 512   icon-1024.png --out claude-world.iconset/icon_256x256@2x.png
sips -z 512 512   icon-1024.png --out claude-world.iconset/icon_512x512.png
cp icon-1024.png claude-world.iconset/icon_512x512@2x.png

# Convert iconset to .icns
iconutil -c icns claude-world.iconset -o build/icon.icns

# Clean up
rm -rf claude-world.iconset
```

## DMG background

`dmg-background.png` should be 540x380px. It appears behind the two icons in the
installer window (the app icon on the left and the /Applications symlink on the right).
A dark background (#0a0a14 or similar) matches the app's aesthetic.
