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
