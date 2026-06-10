# Store Release Guide — Split Trip

How to ship a store app (Apple App Store + Google Play) from this repo. GitHub Pages is separate
and unaffected (it serves `docs/`, rebuilt with `npm run build:variants`).

## Model: one store app per variant

Each store app is **one variant** built lean, with its **own** app ID, name, icon, and signing key.
The personalized variants (adri, jd, …) stay on GitHub Pages only unless you deliberately ship them.

| Thing | Where it lives |
|---|---|
| GitHub Pages (base + all variants) | `docs/` — `npm run build:variants` |
| One native app's web build | `www/` (gitignored) — `node scripts/build-app.mjs <variant>` |
| Per-variant text | `variants/<id>/gametext.txt` |
| Per-variant art | `variants/<id>/sprites/*.png` |

### App ID scheme (permanent — choose each leaf carefully)
Namespace `com.dacquery.*`, unique leaf per app:
- Split Trip (base) → `com.dacquery.splittrip`  ← current default in `capacitor.config.json`
- A themed/birthday store edition → `com.dacquery.<name>`

The same ID must be used on **both** stores for a given app and can never change once published.

## Build the web app for a variant
```
node scripts/build-app.mjs            # base  → www/
node scripts/build-app.mjs adri       # variant → www/
```
Produces a lean `www/` (one variant) with that variant's gametext + sprites overlaid. Capacitor's
`webDir` is `www`. (`npm run cap:sync` builds the base app then syncs.)

## App icon + splash (do once per app)
1. Put a 1024×1024 PNG at `resources/icon.png` (and optionally `resources/splash.png` 2732×2732).
2. `npm install -D @capacitor/assets`
3. `npx capacitor-assets generate`

## Signing — use Google Play App Signing (secure, recoverable)
**Never commit keystore passwords.** Keep them in a local file outside the repo. Generate a fresh
**upload** key per app:
```
keytool -genkey -v -keystore splittrip-upload.keystore -alias splittripupload \
  -keyalg RSA -keysize 2048 -validity 10000
```
At Play Console → Release → Setup → App signing, enroll in **Play App Signing** and register this
upload key (Google holds the real signing key, so a lost upload key is recoverable).

## Native platforms (not yet added)
This repo has the `@capacitor/android` + `@capacitor/ios` deps but no `android/` or `ios/` project
yet. Add them when ready:
```
node scripts/build-app.mjs <variant>   # build www/ first
npx cap add android                     # Windows or Mac
npx cap add ios                         # Mac only (needs CocoaPods)
npx cap sync
```

## Android build (Windows)
```
npx cap sync android
# configure release signing (upload key) in android/app/build.gradle + android/key.properties (gitignored)
cd android && ./gradlew bundleRelease   # → app/build/outputs/bundle/release/app-release.aab
```

## iOS build (requires a Mac with Xcode)
```
npm install
node scripts/build-app.mjs <variant>
npx cap add ios                         # first time (sudo gem install cocoapods)
npx cap sync ios
npx cap open ios
```
In Xcode: set Bundle Identifier to `com.dacquery.<leaf>`, pick your Team (Automatic signing), set
Version + Build, then Product → Archive → Distribute App. Requires the **Apple Developer Program
($99/yr)** — enroll early.

## Store listing checklist (both stores)
- Privacy policy URL: `https://deeessseven.github.io/generic-split-trip/privacy.html`
  (and `/<variant>/privacy.html` per variant). Edit the contact email in `public/privacy.html`.
- Data safety (Play) / App Privacy (Apple): **No data collected** — offline, local-save only.
- Screenshots (per device size), descriptions, 1024px icon, age rating (mild/none → Everyone).

---

# ▶ Google Play — base "Split Trip" first release (current setup)

The Android project was generated (`npx cap add android`) with `applicationId com.dacquery.splittrip`
and release signing wired to a gitignored `android/key.properties`. Web build → `www/` via
`npm run build:app`.

> ⚠ The generated project uses **AGP 8.2.1 / Gradle 8.2.1 / compileSdk 34** (Capacitor 6 defaults).
> Google Play requires targeting **API ≥35**, but AGP 8.2.1 does NOT support compileSdk 35/36. So
> bump it the SAFE way in **Android Studio → Help → "AGP Upgrade Assistant"** (raises AGP + Gradle
> together), then set `compileSdkVersion`/`targetSdkVersion` to **36** in `android/variables.gradle`
> and install SDK Platform 36 if prompted. Do this once before submitting; the Upgrade Assistant
> verifies the combo so you don't hand-edit mismatched versions.

## One-time machine setup
- **Android Studio Gradle JDK = `jbr-21`** (not system Java 25).
- SDK Manager: install **Android 16 / API 36**.

## 1. Upload key (you choose the password — keep it OUT of git)
```
keytool -genkey -v -keystore splittrip-upload.keystore -alias splittripupload \
  -keyalg RSA -keysize 2048 -validity 10000
```
Store the `.keystore` outside the repo; record the password in a local note only.

## 2. Create `android/key.properties` (gitignored — never commit)
```
storeFile=C:\\Users\\dshen\\Desktop\\AI\\keystores\\splittrip-upload.keystore
storePassword=YOUR_PASSWORD
keyAlias=splittripupload
keyPassword=YOUR_PASSWORD
```

## 3. Build the signed AAB
```
npm run build:app          # base → www/
npx cap sync android
```
Then **Android Studio → Build → Generate Signed App Bundle** (pick the keystore, `release`).
Output: `android/app/build/outputs/bundle/release/app-release.aab`. Bump `versionCode` per upload.

## 4. Play Console
Same as the Boba Quest flow: create app (Game, Free) → App content (privacy URL above,
**Data safety = no data**, content rating, ads = No) → store listing (512 icon, 1024×500 feature
graphic, screenshots, descriptions) → **Play App Signing** → **Internal testing** to smoke-test →
**Closed testing (≥12 testers, ≥14 days — required for a young personal account; START ASAP)** →
Production.

> Edge-to-edge note: targetSdk ≥35 enforces edge-to-edge. Split Trip already handles safe-area
> insets (see `src/safeArea.js`), but verify on a notched device during testing.
