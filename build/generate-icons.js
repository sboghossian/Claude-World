#!/usr/bin/env node
/**
 * generate-icons.js
 *
 * Converts build/icon.svg → build/icon.icns (macOS app icon)
 * Converts build/dmg-background.svg → build/dmg-background.png (540x380)
 * Also outputs build/icon.png (512x512) for electron-builder fallback.
 *
 * Requires: sharp (npm devDependency), iconutil (ships with macOS)
 */

const sharp = require("sharp");
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");

const BUILD_DIR = __dirname;
const ICON_SVG = path.join(BUILD_DIR, "icon.svg");
const DMG_BG_SVG = path.join(BUILD_DIR, "dmg-background.svg");
const ICONSET_DIR = path.join(BUILD_DIR, "icon.iconset");

// macOS .iconset requires these exact sizes and filenames
const ICONSET_ENTRIES = [
  { name: "icon_16x16.png", size: 16 },
  { name: "icon_16x16@2x.png", size: 32 },
  { name: "icon_32x32.png", size: 32 },
  { name: "icon_32x32@2x.png", size: 64 },
  { name: "icon_128x128.png", size: 128 },
  { name: "icon_128x128@2x.png", size: 256 },
  { name: "icon_256x256.png", size: 256 },
  { name: "icon_256x256@2x.png", size: 512 },
  { name: "icon_512x512.png", size: 512 },
  { name: "icon_512x512@2x.png", size: 1024 },
];

async function generateIcons() {
  console.log("[icons] Reading", ICON_SVG);
  const svgBuffer = fs.readFileSync(ICON_SVG);

  // Create .iconset directory
  if (fs.existsSync(ICONSET_DIR)) {
    fs.rmSync(ICONSET_DIR, { recursive: true });
  }
  fs.mkdirSync(ICONSET_DIR, { recursive: true });

  // Generate all iconset PNGs
  console.log("[icons] Generating .iconset PNGs...");
  await Promise.all(
    ICONSET_ENTRIES.map(async ({ name, size }) => {
      const outPath = path.join(ICONSET_DIR, name);
      await sharp(svgBuffer)
        .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toFile(outPath);
      console.log(`  ${name} (${size}x${size})`);
    })
  );

  // Generate build/icon.png (512x512) for electron-builder
  const iconPngPath = path.join(BUILD_DIR, "icon.png");
  await sharp(svgBuffer)
    .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(iconPngPath);
  console.log("[icons] Generated icon.png (512x512)");

  // Run iconutil to create .icns (macOS only)
  const icnsPath = path.join(BUILD_DIR, "icon.icns");
  try {
    execSync(`iconutil -c icns "${ICONSET_DIR}" -o "${icnsPath}"`, {
      stdio: "inherit",
    });
    console.log("[icons] Generated icon.icns");
  } catch (err) {
    console.error("[icons] iconutil failed — are you on macOS?", err.message);
    process.exit(1);
  }

  // Clean up .iconset directory
  fs.rmSync(ICONSET_DIR, { recursive: true });
  console.log("[icons] Cleaned up .iconset directory");
}

async function generateDmgBackground() {
  console.log("[dmg-bg] Reading", DMG_BG_SVG);
  const svgBuffer = fs.readFileSync(DMG_BG_SVG);
  const outPath = path.join(BUILD_DIR, "dmg-background.png");

  await sharp(svgBuffer)
    .resize(540, 380, { fit: "fill" })
    .png()
    .toFile(outPath);
  console.log("[dmg-bg] Generated dmg-background.png (540x380)");
}

async function main() {
  console.log("=== Claude World — Icon & Asset Generation ===\n");

  await generateIcons();
  console.log();
  await generateDmgBackground();

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
