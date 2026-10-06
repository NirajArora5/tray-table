// Native shell checks: the Capacitor config, the generated iOS/Android projects' edits, the www/ staging step,
// and the game's behaviour when it finds itself inside a shell (no service worker, an "installed" offline note).
const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
let fails = 0;
const check = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) fails++; };

/* ---- config ---- */
const cfg = JSON.parse(read('capacitor.config.json'));
check(cfg.appId === 'com.narora.toddlertime' && cfg.appName === 'Toddler Time' && cfg.webDir === 'www', 'capacitor.config.json: bundle id, app name, webDir');
check(!cfg.server || !cfg.server.url, 'no remote server url: the shell loads the bundled page only');
const manifest = JSON.parse(read('manifest.webmanifest'));
check(manifest.name === 'Toddler Time' && manifest.short_name === 'Toddler Time', 'web manifest carries the app name');
check(/<title>Toddler Time<\/title>/.test(read('index.html')), 'page title is the app name');

/* ---- www/ staging ---- */
execFileSync(process.execPath, [path.join(root, 'scripts/www.js')], { stdio: 'ignore' });
const www = fs.readdirSync(path.join(root, 'www')).sort();
check(www.join(',') === 'apple-touch-icon.png,icon-192.png,icon-512.png,index.html,manifest.webmanifest', 'www/ holds the page, icons and manifest, and no service worker (' + www.join(' ') + ')');
check(read('www/index.html') === read('index.html'), 'www/index.html is byte-identical to index.html');

/* ---- iOS ---- */
const appDelegate = read('ios/App/App/AppDelegate.swift');
check(/import AVFoundation/.test(appDelegate) && /setCategory\(\.playback/.test(appDelegate) && /setActive\(true\)/.test(appDelegate), 'AppDelegate sets the AVAudioSession playback category');
check(/applicationDidBecomeActive[\s\S]*configureAudioSession\(\)/.test(appDelegate), 'audio session is re-asserted when the app becomes active');
const plist = read('ios/App/App/Info.plist');
const orient = (plist.match(/<key>UISupportedInterfaceOrientations<\/key>\s*<array>([\s\S]*?)<\/array>/) || [])[1] || '';
check(['Portrait', 'PortraitUpsideDown', 'LandscapeLeft', 'LandscapeRight'].every(o => orient.includes('UIInterfaceOrientation' + o)), 'iPhone supports every orientation');
check(/<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/.test(plist), 'export compliance flag set (no encryption)');
check(/<string>Toddler Time<\/string>/.test(plist), 'Info.plist display name');
const pbx = read('ios/App/App.xcodeproj/project.pbxproj');
check(/PRODUCT_BUNDLE_IDENTIFIER = com\.narora\.toddlertime;/.test(pbx), 'Xcode project bundle id');
check(fs.existsSync(path.join(root, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png')), 'iOS app icon generated');
check(!/NSAppTransportSecurity|NSAllowsArbitraryLoads/.test(plist), 'no ATS exceptions: nothing talks to the network');

/* ---- Android ---- */
const am = read('android/app/src/main/AndroidManifest.xml');
const perms = [...am.matchAll(/uses-permission android:name="([^"]+)"/g)].map(m => m[1]).sort();
check(perms.join() === 'android.permission.MODIFY_AUDIO_SETTINGS,android.permission.RECORD_AUDIO', 'Android manifest requests only the microphone (no INTERNET): ' + perms.join(' '));
check(/NSMicrophoneUsageDescription/.test(plist) && /Recordings stay on this device/.test(plist), 'iOS explains the microphone and that recordings stay on the device');
check(/NSPhotoLibraryUsageDescription/.test(plist) && /Photos stay on this device/.test(plist), 'iOS explains the photo picker and that photos stay on the device');
check(/android:allowBackup="false"/.test(am), 'Android auto backup off: progress and recordings stay on the device');
check(!/android:screenOrientation=/.test(am), 'Android activity leaves orientation unrestricted');
check(/<string name="app_name">Toddler Time<\/string>/.test(read('android/app/src/main/res/values/strings.xml')), 'Android app name');
check(/applicationId "com\.narora\.toddlertime"/.test(read('android/app/build.gradle')), 'Android application id');
check(fs.existsSync(path.join(root, 'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png')) && fs.existsSync(path.join(root, 'android/app/src/main/res/drawable/splash.png')), 'Android launcher icon and splash generated');

/* ---- the page inside a shell ---- */
{
  const html = read('index.html'); const calls = [];
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://localhost/', beforeParse(w) {
    w.HTMLMediaElement.prototype.play = () => Promise.resolve(); w.HTMLMediaElement.prototype.pause = () => {};
    w.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios' };
    Object.defineProperty(w.navigator, 'serviceWorker', { value: { register: u => { calls.push(u); return Promise.resolve(); }, controller: null } });
    w.caches = { keys: () => Promise.resolve([]) };
  } });
  const d = dom.window.document;
  check(calls.length === 0, 'inside the shell the page registers no service worker');
  check(!d.querySelector('link[rel="manifest"]'), 'inside the shell the page adds no web manifest link');
  return new Promise(r => setTimeout(r, 30)).then(() => {
    check(/Installed app\. Works in airplane mode\./.test(d.querySelector('#offline-note').textContent), 'panel says the installed app works offline');
  }).then(done);
}
{
  // and outside a shell, served over https, it still installs as a PWA
  const calls = [];
  new JSDOM(read('index.html'), { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://nirajarora5.github.io/tray-table/', beforeParse(w) {
    w.HTMLMediaElement.prototype.play = () => Promise.resolve(); w.HTMLMediaElement.prototype.pause = () => {};
    Object.defineProperty(w.navigator, 'serviceWorker', { value: { register: u => { calls.push(u); return Promise.resolve(); }, controller: null } });
  } });
  check(calls.length === 1 && calls[0] === './sw.js', 'on the Pages site the page still registers sw.js');
}
function done() { console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0); }
