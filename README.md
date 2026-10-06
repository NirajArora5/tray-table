# Tray Table v0 — offline kit

Everything in this folder is the game. `index.html` is the whole app; the rest makes it installable and airplane-mode safe.

## Laptop (fastest)
Double-click `index.html`. Arrow keys or `1`–`4` pick a card, `Space` repeats the prompt, `Esc` opens the grown-up panel. Works with no network at all.

## iPad / iPhone, airplane-mode ready
1. Put this folder on any https static host. GitHub Pages is the quick path: new repo → upload these files → Settings → Pages → deploy from `main` / root.
2. Open the URL in Safari **while online**. Share → Add to Home Screen.
3. Launch it from the home screen once more while still online — that first launch is when the service worker caches everything.
4. Airplane mode → launch → play. Progress lives in that home-screen app's storage.

Before boarding: Settings → Accessibility → Guided Access → on. Open Tray Table, press Start, triple-click the side/home button to lock the kid in.

## While playing
- Hold the top-right corner for a moment (or press `Esc`): the jump sheet. Switch category, wiggle break, calm bubbles (2 min, then back to play), end early, or open Settings.
- Two-finger swipe left/right: next/previous category without the sheet (`N` / `P` on a keyboard).
- Voice: the game ships a recorded voice pack (317 clips, generated offline with a neural TTS, bundled inside index.html) so it sounds the same on every device and needs no download. Settings → Voice switches to the device voice instead; if you use that on an iPad, download an Enhanced or Premium voice first (Settings → Accessibility → Spoken Content → Voices → English → Samantha or Ava).
- Mute switch: the game plays a silent loop so its voice stays audible with the iPad's ring/silent switch on. Use the in-game Sound setting to go quiet.
- The grown-up panel shows whether this copy is saved for airplane mode.

## Celebrations and the recap
Every clean find (first tap, no hint) gets a cheer. Cheers rotate through twelve in a fixed order, and once per cycle the cheer is the composed "You found the ___!" (two clips). Nothing about a celebration is random:
- **Normal**: the thing, its name, its sound. 1.5 s.
- **New!**: the first clean find of that thing, ever. A New! badge, "New!" spoken first. 2.2 s.
- **Mini parade**: every third clean find in a row. The last three march past and are named. 2.4 s.
The all-done screen lists everything found cleanly today ("Today you met…"), across sessions, so you can celebrate it together; it resets at midnight. The grown-up panel counts new finds and parades per session.

## Voice pack
`tools/voice/` regenerates the recorded voice with a different Piper voice (see the docstring in `pack.py`). It takes about three minutes on a laptop. After adding a phrase to the game, add it to `phrases.js`, then `node phrases.js && python3 pack.py en-us-ryan-high --only-missing` synthesizes just the new clips and keeps the rest byte-for-byte. The macOS piper-tts wheels (1.3 to 1.8) ship with a broken espeak data path; run it on Linux, for example `docker run --rm -v "$PWD":/app -v "$PWD/tools/voice":/voice -w /voice python:3.11-slim bash -c "apt-get update -qq && apt-get install -y -qq ffmpeg && pip install -q piper-tts && python /app/tools/voice/pack.py en-us-ryan-high --only-missing"` with the `.onnx` voice files in `tools/voice/`.

## Tuning
- `CFG` at the top of the script: block length, break cadence, promotion/demotion thresholds, idle timings.
- `RAW`: the content. One line per item (name, emoji, sound word). The first four items of each category are the opening set; new items unlock as earlier ones are learned.
- `LEVELS`: the ladder every category climbs.

When you change `index.html`, bump `CACHE` in `sw.js` so installed copies refresh.

## Tests
`npm install`, then `npm test` (jsdom suite: engine paths, session machine, silent mode, counting, jump sheet) and `npm run sim` (five simulated toddlers play ten minutes each at 20x speed and print their ladders). Both run on every push and pull request through `.github/workflows/test.yml`. Change an engine threshold in `CFG` only with a before/after from `npm run sim`.

## Native shells (iOS and Android)
`ios/` and `android/` are Capacitor shells around the very same `index.html`: app id `com.narora.toddlertime`, name Toddler Time, any orientation, no permissions, no network. They are checked in; `npm run cap:sync` stages the page into `www/` (gitignored) and copies it into both projects. Then `npm run ios` opens Xcode, `npm run android` opens Android Studio.

- The iOS shell sets the audio session to playback in `AppDelegate.swift`, so the voice is audible with the ring/silent switch on. The page's silent loop stays as a fallback.
- Inside a shell the page skips the service worker and the grown-up panel says "Installed app".
- Icons and splash screens come from `icon-512.png`: `npm run assets` rebuilds the 1024px sources in `assets/` and fans them out to both projects. Replace `icon-512.png` with a sharper master when there is one.
- `tests/native.js` (part of `npm test`) checks the shells' config: bundle id, no permissions, orientations, audio session, and that the page behaves inside a shell.

## CI builds
- **Android**: `.github/workflows/android.yml` builds a debug APK on every push to main and every PR, checks it requests no permissions, and attaches it to the run (Actions → android → the run → Artifacts → `toddler-time-debug-apk`). Install it on a phone with developer mode on.
- **iOS, simulator**: `.github/workflows/ios.yml` compiles the shell for the iOS simulator on every push to main and every PR. No secrets needed.
- **iOS, TestFlight**: the `testflight` job in the same workflow runs only by hand (Actions → ios → Run workflow). It runs `bundle exec fastlane beta` from `ios/App`, which signs a Release archive and uploads it to TestFlight. The same lane runs on a Mac with the variables below exported. It needs these six repository secrets (Settings → Secrets and variables → Actions):

| Secret | What it is | Where to get it |
|---|---|---|
| `APP_STORE_CONNECT_API_KEY_ID` | Key ID of an App Store Connect API key | App Store Connect → Users and Access → Integrations → App Store Connect API → Team Keys → + (role: App Manager). The ID is shown in the list. |
| `APP_STORE_CONNECT_API_ISSUER_ID` | Issuer ID | Same page, top of the Team Keys section. |
| `APP_STORE_CONNECT_API_KEY_P8` | The key file, base64 | Download the `.p8` once (Apple only offers it once), then `base64 -i AuthKey_XXXX.p8 \| pbcopy`. |
| `APPLE_TEAM_ID` | 10-character team id | developer.apple.com → Account → Membership details. |
| `IOS_DIST_CERT_P12` | Apple Distribution certificate with its private key, base64 | Xcode → Settings → Accounts → your team → Manage Certificates → + → Apple Distribution. Then Keychain Access → My Certificates → right-click the "Apple Distribution: …" entry → Export → .p12 with a password. `base64 -i dist.p12 \| pbcopy`. |
| `IOS_DIST_CERT_PASSWORD` | The password you gave that .p12 | Same export step. |

Before the first run, also do once by hand: register the bundle id `com.narora.toddlertime` (developer.apple.com → Identifiers) and create the app record in App Store Connect (My Apps → + → iOS, name Toddler Time, that bundle id). The provisioning profile is created and refreshed by the lane through the API key, so it is never a secret. Build numbers come from the last TestFlight build plus one.
