// "Your voice": the booth records a phrase, stores it on the device, and the game plays it instead of the bundled clip.
// jsdom has no microphone, MediaRecorder, Web Audio or IndexedDB, so each is stubbed: fake-indexeddb for the store, a
// MediaRecorder that hands back a WAV, and an AudioContext whose decodeAudioData returns the samples it was given.
const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path');
const { indexedDB, IDBKeyRange } = require('fake-indexeddb');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
const check = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) fails++; };

// a 0.6 s take: 0.2 s silence, 0.2 s tone, 0.2 s silence, at 8 kHz
const RATE = 8000;
function take() { const s = new Float32Array(RATE * 0.6); for (let i = RATE * 0.2; i < RATE * 0.4; i++) s[i] = 0.3 * Math.sin(i / 3); return s; }
function wavFloat(ab) { const v = new DataView(ab); const n = v.getUint32(40, true) / 2; const out = new Float32Array(n); for (let i = 0; i < n; i++) out[i] = v.getInt16(44 + i * 2, true) / 32768; return out; }

function boot(opts) {
  opts = opts || {}; const decoded = [], played = [];
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://localhost/', beforeParse(w) {
    w.HTMLMediaElement.prototype.play = () => Promise.resolve(); w.HTMLMediaElement.prototype.pause = () => {};
    w.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
    w.speechSynthesis = { cancel() {}, getVoices() { return []; }, speak(u) { setTimeout(() => u.onend && u.onend(), 5); } };
    w.indexedDB = indexedDB; w.IDBKeyRange = IDBKeyRange;
    // Web Audio: decode = "the bytes are a WAV from the booth, or the bundled mp3 (we fake 0.5 s of silence for those)"
    class FakeBuffer { constructor(data, rate) { this.data = data; this.sampleRate = rate; this.duration = data.length / rate; this.numberOfChannels = 1; } getChannelData() { return this.data; } }
    class FakeCtx {
      constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; }
      resume() { return Promise.resolve(); }
      decodeAudioData(ab, ok) { const u = new Uint8Array(ab); const isWav = u[0] === 82 && u[1] === 73; decoded.push({ bytes: ab.byteLength, wav: isWav }); ok(isWav ? new FakeBuffer(wavFloat(ab), new DataView(ab).getUint32(24, true)) : new FakeBuffer(new Float32Array(RATE / 2), RATE)); }
      createBufferSource() { const src = { connect() { return this; }, start() { played.push(src.buffer); }, stop() {} }; return src; }
      createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() { return this; } }; }
      createOscillator() { return { type: '', frequency: {}, connect() { return this; }, start() {}, stop() {} }; }
    }
    w.AudioContext = FakeCtx;
    // microphone + recorder: the take above, delivered as a WAV blob when stopped
    const tracks = [{ stop() { tracks.stopped = true; } }];
    w.navigator.mediaDevices = { getUserMedia: () => opts.noMic ? Promise.reject(new Error('NotAllowedError')) : Promise.resolve({ getTracks: () => tracks }) };
    w.MediaRecorder = class {
      static isTypeSupported(t) { return t === 'audio/mp4'; }
      constructor(stream, o) { this.mimeType = (o && o.mimeType) || ''; this.state = 'inactive'; }
      start() { this.state = 'recording'; }
      stop() { this.state = 'inactive'; const s = take(); const blob = w.TT ? w.TT.REC.wav(s, RATE) : null; setTimeout(() => { this.ondataavailable({ data: blob }); this.onstop(); }, 5); }
    };
    if (opts.native) {   // the Capacitor shell: Filesystem plugin on an in-memory disk
      const disk = opts.native;
      w.Capacitor = { isNativePlatform: () => true, Plugins: { Filesystem: {
        readdir: ({ path }) => Object.keys(disk).some(k => k.startsWith(path + '/')) ? Promise.resolve({ files: Object.keys(disk).filter(k => k.startsWith(path + '/')).map(k => ({ name: k.slice(path.length + 1) })) }) : Promise.reject(new Error('no dir')),
        readFile: ({ path }) => disk[path] ? Promise.resolve({ data: disk[path] }) : Promise.reject(new Error('missing')),
        writeFile: ({ path, data }) => { disk[path] = data; return Promise.resolve(); },
        deleteFile: ({ path }) => { delete disk[path]; return Promise.resolve(); }
      } } };
    }
  } });
  const w = dom.window, d = w.document;
  return { w, d, TT: w.TT, decoded, played, click: sel => { const b = d.querySelector(sel); if (!b) throw new Error('no ' + sel); b.click(); } };
}

(async () => {
  /* ---- pure bits: trim + wav ---- */
  {
    const { TT } = boot();
    const t = TT.REC.trim(take(), RATE);
    check(t.length > RATE * 0.2 && t.length < RATE * 0.36, `trim keeps the sound plus a short pad (${(t.length / RATE).toFixed(2)} s of 0.6)`);
    let peak = 0; for (const x of t) peak = Math.max(peak, Math.abs(x));
    check(Math.abs(peak - 0.8) < 0.01, 'trim levels the peak to 0.8');
    check(TT.REC.trim(new Float32Array(RATE), RATE).length === 0, 'pure silence trims to nothing');
    const blob = TT.REC.wav(t, RATE);
    check(blob.type === 'audio/wav' && blob.size === 44 + t.length * 2, 'wav blob is 16-bit mono with a 44-byte header');
  }

  /* ---- the booth on the web ---- */
  {
    const { w, d, TT, decoded, played, click } = boot();
    await TT.OWN.load();
    const P = TT.ownPhrases();
    check(P.length === 41 && P.some(p => p.id === 'kid-name') && TT.CHEERS.every((c, i) => P.some(p => p.id === 'cheer:' + i)) && P.filter(p => /^name:counting:/.test(p.id)).length === 10, '41 core phrases: prompts, 12 cheers, 10 numbers, 8 wiggles, the child\'s name');
    check(d.querySelectorAll('#booth .ph').length === 41 && /0 of 41 recorded/.test(d.querySelector('#booth-count').textContent), 'the panel lists them, none recorded yet');
    check(!TT.AUDIO.has(['kid-name']) && TT.AUDIO.has(['cheer:0']), 'before recording: the bundled cheer plays, the child\'s name cannot');
    click('#booth [data-act="rec"][data-v="cheer:0"]'); await sleep(10);
    check(TT.S.rec === 'cheer:0' && /Stop/.test(d.querySelector('#booth .ph[data-id="cheer:0"] [data-act="rec"]').textContent) && d.querySelector('#booth .ph[data-id="cheer:0"]').classList.contains('live'), 'tapping Record starts a take and the row shows Stop');
    click('#booth [data-act="rec"][data-v="cheer:0"]'); await sleep(60);
    check(TT.S.rec === null && TT.OWN.has('cheer:0') && /1 of 41 recorded/.test(d.querySelector('#booth-count').textContent), 'tapping Stop stores the take and the count moves');
    const stored = await TT.OWN.get('cheer:0');
    check(stored && stored.type === 'audio/wav' && stored.size > 44, 'stored as a WAV blob');
    // the game prefers the recording
    const bundledBytes = Math.round(atob(JSON.parse(html.match(/<script id="clips" type="application\/json">(.*?)<\/script>/s)[1])['cheer:0']).length);
    decoded.length = 0; const own = await TT.AUDIO.buf('cheer:0');
    check(own && decoded.length === 1 && decoded[0].wav && decoded[0].bytes !== bundledBytes, 'AUDIO decodes the recording, not the bundled mp3');
    TT.settings.ownVoice = false; decoded.length = 0; const bundled = await TT.AUDIO.buf('cheer:0');
    check(bundled && decoded.length === 1 && !decoded[0].wav, 'with "Bundled voice" chosen the mp3 plays instead');
    TT.settings.ownVoice = true;
    check(TT.AUDIO.has(['cheer:0']) && !TT.AUDIO.has(['kid-name']), 'a recording makes an id playable; others are unchanged');
    // booth play button plays the recording even when bundled is chosen
    TT.settings.ownVoice = false; played.length = 0; click('#booth [data-act="recplay"][data-v="cheer:0"]'); await sleep(20);
    check(played.length === 1 && played[0].sampleRate === RATE, 'the booth\'s play button plays the recording');
    TT.settings.ownVoice = true;
    // child's name joins the cheer rotation only once recorded
    TT.settings.kidName = 'Maya';
    let kid = 0; TT.S.cheerIdx = 0; for (let i = 0; i < 14; i++) if (TT.nextCheer(TT.ITEMS.animals[0], true).kid) kid++;
    check(kid === 0, 'no recording of the name: the cheers are the usual 13-cycle');
    click('#booth [data-act="rec"][data-v="kid-name"]'); await sleep(10); click('#booth [data-act="rec"][data-v="kid-name"]'); await sleep(60);
    check(TT.OWN.has('kid-name') && /Maya!/.test(d.querySelector('#booth .ph[data-id="kid-name"] b').textContent), 'the name is recorded and the row shows it');
    let kids = []; TT.S.cheerIdx = 0; for (let i = 0; i < 14; i++) { const c = TT.nextCheer(TT.ITEMS.animals[0], true); if (c.kid) kids.push(c); }
    check(kids.length === 1 && kids[0].text === 'Maya! You found it!' && kids[0].clips.join() === 'kid-name,cheer:1', 'with it recorded, one cheer per cycle is "Maya! You found it!"');
    TT.S.cheerIdx = 0; let kidInNew = 0; for (let i = 0; i < 14; i++) if (TT.nextCheer(TT.ITEMS.animals[0], false).kid) kidInNew++;
    check(kidInNew === 0 && TT.CFG.CELEBRATE_MS + TT.CFG.KID_NAME_MS <= 2500, 'never in the New! tier; normal tier plus the name stays under 2.5 s');
    // delete one, persistence across a reload, delete all
    click('#booth [data-act="recdel"][data-v="kid-name"]'); await sleep(30);
    check(!TT.OWN.has('kid-name') && TT.OWN.has('cheer:0'), 'deleting one recording leaves the others');
    const again = boot(); await again.TT.OWN.load();
    check(again.TT.OWN.has('cheer:0') && /1 of 41 recorded/.test(again.d.querySelector('#booth-count').textContent), 'recordings survive a reload (IndexedDB)');
    again.click('#booth [data-act="recclear"]'); await sleep(5); again.click('#booth [data-act="recclear"]'); await sleep(40);
    check(again.TT.OWN.count() === 0 && !again.d.querySelector('#booth [data-act="recclear"]'), 'Delete all needs a second tap, then empties the store');
    // microphone refused
    const nomic = boot({ noMic: true }); await nomic.TT.OWN.load();
    nomic.click('#booth [data-act="rec"][data-v="cheer:1"]'); await sleep(20);
    check(nomic.TT.S.rec === null && /Microphone not available/.test(nomic.d.querySelector('#booth').textContent), 'a refused microphone shows a note instead of hanging');
    // name text without a recording still shows in the row and settings
    const inp = d.querySelector('#booth input[data-act="kidname"]'); inp.value = 'Leo'; inp.dispatchEvent(new w.Event('change', { bubbles: true }));
    check(TT.settings.kidName === 'Leo' && JSON.parse(w.localStorage.getItem('tt.settings')).kidName === 'Leo', 'the child\'s name is saved from the panel');
  }

  /* ---- the booth inside a native shell: files in the app's Data directory ---- */
  {
    const disk = {};
    const { TT, click, d } = boot({ native: disk }); await TT.OWN.load();
    click('#booth [data-act="rec"][data-v="name:counting:three"]'); await sleep(10); click('#booth [data-act="rec"][data-v="name:counting:three"]'); await sleep(60);
    const files = Object.keys(disk);
    check(files.length === 1 && files[0] === 'voice/name%3Acounting%3Athree.wav' && /^[A-Za-z0-9+/=]+$/.test(disk[files[0]]), 'native: the take is written as base64 WAV under voice/ (' + files[0] + ')');
    const b = boot({ native: disk }); await b.TT.OWN.load();
    check(b.TT.OWN.has('name:counting:three') && (await b.TT.OWN.get('name:counting:three')).size > 44, 'native: a fresh launch lists and reads it back from the filesystem');
    await b.TT.OWN.remove('name:counting:three');
    check(Object.keys(disk).length === 0, 'native: delete removes the file');
  }

  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
