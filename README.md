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

## Voice pack
`tools/voice/` regenerates the recorded voice with a different Piper voice (see the docstring in `pack.py`). It takes about three minutes on a laptop.

## Tuning
- `CFG` at the top of the script: block length, break cadence, promotion/demotion thresholds, idle timings.
- `RAW`: the content. One line per item (name, emoji, sound word). The first four items of each category are the opening set; new items unlock as earlier ones are learned.
- `LEVELS`: the ladder every category climbs.

When you change `index.html`, bump `CACHE` in `sw.js` so installed copies refresh.
