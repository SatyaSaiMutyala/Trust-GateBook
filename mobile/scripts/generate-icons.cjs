/**
 * Generates every app icon / splash / in-app logo size from mobile/assets/gatebook.png:
 *   iOS AppIcon + SplashLogo (launch screen), Android launcher (legacy, round, adaptive foreground) and
 *   splash bitmaps (pre-12 and Android 12+), the in-app logo (src/assets/logo*.png), and the web favicon / logo.
 * Run from the repo root after replacing gatebook.png:  node mobile/scripts/generate-icons.cjs
 * Uses `sharp` from backend/node_modules (run `npm --prefix backend install` first).
 */
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const sharp = require(path.join(ROOT, 'backend/node_modules/sharp'));
const SRC = path.join(ROOT, 'mobile/assets/gatebook.png');
const M = path.join(ROOT, 'mobile'); const W = path.join(ROOT, 'web');
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };

(async () => {
  // Trim transparent margins once; everything else is built from this.
  const trimmed = await sharp(SRC).trim().png().toBuffer();
  const meta = await sharp(trimmed).metadata();
  console.log('trimmed logo', meta.width, 'x', meta.height);

  /** logo fitted inside `inner` px, centred on a `size` px canvas */
  const compose = async (size, inner, bg, out, { flatten = false, circle = false } = {}) => {
    const logo = await sharp(trimmed).resize(inner, inner, { fit: 'contain', background: CLEAR }).toBuffer();
    let img = sharp({ create: { width: size, height: size, channels: 4, background: bg } })
      .composite([{ input: logo, gravity: 'center' }]);
    if (circle) {
      const mask = Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size/2}" cy="${size/2}" r="${size/2}" fill="#fff"/></svg>`);
      img = sharp(await img.png().toBuffer()).composite([{ input: mask, blend: 'dest-in' }]);
    }
    if (flatten) img = img.flatten({ background: '#ffffff' }).removeAlpha();
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await img.png({ compressionLevel: 9 }).toFile(out);
  };
  const fit = async (w, out) => {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await sharp(trimmed).resize(w, w, { fit: 'contain', background: CLEAR }).png({ compressionLevel: 9 }).toFile(out);
  };

  // ---------- iOS app icon (opaque, logo at 78% of the square) ----------
  const iosDir = path.join(M, 'ios/Gatebook/Images.xcassets/AppIcon.appiconset');
  const iosSpecs = [[20,2],[20,3],[29,2],[29,3],[40,2],[40,3],[60,2],[60,3],[1024,1]];
  const images = [];
  for (const [pt, sc] of iosSpecs) {
    const px = pt * sc; const name = `icon-${pt}@${sc}x.png`;
    await compose(px, Math.round(px * 0.78), WHITE, path.join(iosDir, name), { flatten: true });
    images.push({ idiom: pt === 1024 ? 'ios-marketing' : 'iphone', scale: `${sc}x`, size: `${pt}x${pt}`, filename: name });
  }
  fs.writeFileSync(path.join(iosDir, 'Contents.json'), JSON.stringify({ images, info: { author: 'xcode', version: 1 } }, null, 2) + '\n');

  // ---------- iOS launch-screen image (160 pt) ----------
  const splashSet = path.join(M, 'ios/Gatebook/Images.xcassets/SplashLogo.imageset');
  for (const sc of [1, 2, 3]) await fit(160 * sc, path.join(splashSet, `splash-logo@${sc}x.png`));
  fs.writeFileSync(path.join(splashSet, 'Contents.json'), JSON.stringify({
    images: [1, 2, 3].map(sc => ({ idiom: 'universal', scale: `${sc}x`, filename: `splash-logo@${sc}x.png` })),
    info: { author: 'xcode', version: 1 },
  }, null, 2) + '\n');

  // ---------- Android launcher icons ----------
  const res = path.join(M, 'android/app/src/main/res');
  const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [d, f] of Object.entries(dens)) {
    const legacy = Math.round(48 * f);
    // legacy square + round icons (pre-Android 8)
    await compose(legacy, Math.round(legacy * 0.80), WHITE, path.join(res, `mipmap-${d}/ic_launcher.png`));
    await compose(legacy, Math.round(legacy * 0.66), WHITE, path.join(res, `mipmap-${d}/ic_launcher_round.png`), { circle: true });
    // adaptive foreground: 108 dp canvas, logo inside the 66 dp safe zone (~58% so corners survive circle masks)
    const fg = Math.round(108 * f);
    await compose(fg, Math.round(fg * 0.58), CLEAR, path.join(res, `mipmap-${d}/ic_launcher_foreground.png`));
    // pre-Android-12 splash bitmap (180 dp) and Android 12+ splash icon (240 dp canvas, logo inside the 160 dp circle)
    await fit(Math.round(180 * f), path.join(res, `drawable-${d}/splash_logo.png`));
    const s12 = Math.round(240 * f);
    await compose(s12, Math.round(s12 * 0.5), CLEAR, path.join(res, `drawable-${d}/splash_icon.png`));
  }

  // ---------- in-app brand mark (32 pt @1x/2x/3x) ----------
  for (const [sfx, px] of [['', 32], ['@2x', 64], ['@3x', 96]]) await fit(px, path.join(M, `src/assets/logo${sfx}.png`));
  // larger one for the login screen (72 pt)
  for (const [sfx, px] of [['', 72], ['@2x', 144], ['@3x', 216]]) await fit(px, path.join(M, `src/assets/logo-large${sfx}.png`));

  // ---------- web ----------
  await fit(512, path.join(W, 'public/logo.png'));
  await compose(64, 60, CLEAR, path.join(W, 'public/favicon.png'));
  await compose(180, 150, WHITE, path.join(W, 'public/apple-touch-icon.png'), { flatten: true });
  console.log('done');
})().catch(e => { console.error(e); process.exit(1); });
