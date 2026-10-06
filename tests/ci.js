// CI wiring checks: the Android APK workflow, the iOS workflows, the fastlane lane, and that every secret the iOS
// workflow reads is documented in the README so nobody has to reverse-engineer the YAML.
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
let fails = 0;
const check = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) fails++; };

const test = read('.github/workflows/test.yml');
check(/^on:\n  push:\n  pull_request:/m.test(test) && /npm test/.test(test) && /npm run sim/.test(test), 'test.yml runs npm test and npm run sim on every push and PR');

const android = read('.github/workflows/android.yml');
check(/push:\n    branches: \[main\]/.test(android) && /pull_request:/.test(android), 'android.yml builds on push to main and on PRs');
check(/cap sync android/.test(android) && /assembleDebug/.test(android), 'android.yml syncs the page and builds the debug APK');
check(/upload-artifact/.test(android) && /app-debug\.apk/.test(android), 'android.yml uploads the APK as an artifact');
check(/dump permissions/.test(android) && /uses-permission/.test(android), 'android.yml fails if the built APK requests any permission');

const ios = read('.github/workflows/ios.yml');
check(/simulator:\n    runs-on: macos/.test(ios) && /iphonesimulator/.test(ios) && /CODE_SIGNING_ALLOWED=NO/.test(ios), 'ios.yml compiles the shell for the simulator without secrets');
check(/testflight:\n    if: github\.event_name == 'workflow_dispatch'/.test(ios), 'the TestFlight job only runs when triggered by hand');
check(/bundle exec fastlane beta/.test(ios), 'the TestFlight job runs the fastlane beta lane');
const secrets = [...new Set([...ios.matchAll(/secrets\.([A-Z0-9_]+)/g)].map(m => m[1]))].sort();
const checked = (ios.match(/for v in ([^;]+);/) || ['', ''])[1].trim().split(/\s+/).sort();
check(secrets.length === 6 && secrets.join() === checked.join(), 'the guard step checks exactly the secrets the job reads (' + secrets.join(', ') + ')');
const readme = read('README.md');
const undocumented = secrets.filter(s => !new RegExp('`' + s + '`').test(readme));
check(undocumented.length === 0, 'every secret is documented in README' + (undocumented.length ? ': missing ' + undocumented.join(', ') : ''));
const fastfile = read('ios/App/fastlane/Fastfile');
check(/lane :beta/.test(fastfile) && /upload_to_testflight/.test(fastfile) && /export_method: "app-store"/.test(fastfile), 'Fastfile has a beta lane that uploads an app-store build');
check(/APP_ID = "com\.narora\.toddlertime"/.test(fastfile) && /app_identifier "com\.narora\.toddlertime"/.test(read('ios/App/fastlane/Appfile')), 'fastlane uses the app bundle id');
const envRead = [...new Set([...fastfile.matchAll(/ENV(?:\.fetch\(|\[)"([A-Z0-9_]+)"/g)].map(m => m[1]))].filter(v => !/^(CI|MATCH_|GITHUB_)/.test(v)).sort();
check(envRead.join() === secrets.join(), 'the Fastfile reads the same variables the workflow passes (' + envRead.join(', ') + ')');
const ruby = spawnSync('ruby', ['-c', path.join(root, 'ios/App/fastlane/Fastfile')], { encoding: 'utf8' });
if (ruby.error) console.log('SKIP Fastfile syntax (no ruby here)'); else check(ruby.status === 0, 'Fastfile is valid Ruby');
check(fs.existsSync(path.join(root, 'ios/App/Gemfile')) && /gem "fastlane"/.test(read('ios/App/Gemfile')), 'Gemfile pins fastlane');

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
