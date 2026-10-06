// Family photos: parental gate, add + label + remove, the category switching on at two named photos, playing through the
// Find-it ladder with "Find Grandma!" prompts, booth phrases for each name, persistence (IndexedDB and native files).
const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path');
const { indexedDB, IDBKeyRange } = require('fake-indexeddb');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
const check = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) fails++; };

function boot(opts) {
  opts = opts || {}; const spoken = [];
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://localhost/', beforeParse(w) {
    w.HTMLMediaElement.prototype.play = () => Promise.resolve(); w.HTMLMediaElement.prototype.pause = () => {};
    w.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
    w.speechSynthesis = { cancel() {}, getVoices() { return []; }, speak(u) { spoken.push(u.text); setTimeout(() => u.onend && u.onend(), 5); } };
    w.indexedDB = indexedDB; w.IDBKeyRange = IDBKeyRange;
    for (const [k, v] of Object.entries(opts.storage || {})) w.localStorage.setItem(k, v);   // jsdom's localStorage is per window; a reload keeps it
    if (opts.native) {
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
  const tap = el => el.dispatchEvent(new w.Event('pointerdown', { bubbles: true }));
  const click = sel => { const b = d.querySelector(sel); if (!b) throw new Error('no ' + sel); b.click(); };
  const file = name => new w.File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])], name, { type: 'image/jpeg' });
  const pick = files => { const inp = d.querySelector('#family input[data-act="photos"]'); Object.defineProperty(inp, 'files', { value: files }); inp.dispatchEvent(new w.Event('change', { bubbles: true })); };
  const name = (id, v) => { const inp = d.querySelector(`#family input[data-act="pname"][data-v="${id}"]`); inp.value = v; inp.dispatchEvent(new w.Event('change', { bubbles: true })); };
  const unlock = () => { const q = TT.S.gateQ; d.querySelector('#family input[data-act="gate-answer"]').value = String(q[0] + q[1]); click('#family [data-act="gate"]'); };
  const TT = w.TT;
  return { w, d, tap, click, file, pick, name, unlock, TT, spoken };
}

(async () => {
  /* ---- gate, add, label, switch on ---- */
  {
    const { w, d, TT, file, pick, name, unlock, click } = boot();
    await sleep(30);
    check(!TT.DOMS().includes('family') && !d.querySelector('#family input[data-act="photos"]'), 'no photos yet: Family is not available and the picker is behind the gate');
    check(/Grown-ups only/.test(d.querySelector('#family').textContent) && d.querySelector('#family [data-act="gate"]'), 'the Family section asks a sum first');
    d.querySelector('#family input[data-act="gate-answer"]').value = '1'; click('#family [data-act="gate"]');
    check(!TT.S.gateOk && /Not quite/.test(d.querySelector('#family').textContent), 'a wrong answer stays locked and asks another');
    unlock();
    check(TT.S.gateOk && d.querySelector('#family input[data-act="photos"]'), 'the right answer unlocks Add photos');
    pick([file('a.jpg'), file('b.jpg'), file('notes.txt')].map((f, i) => i === 2 ? new w.File(['x'], 'notes.txt', { type: 'text/plain' }) : f)); await sleep(60);
    check(TT.family().length === 2 && TT.PHOTOS.count() === 2 && /0 ready, 2 need a name/.test(d.querySelector('#family-count').textContent), 'two images are stored (the text file is ignored) and wait for names');
    check(!TT.DOMS().includes('family'), 'unnamed photos do not switch the category on');
    const [a, b] = TT.family().map(f => f.id);
    name(a, 'Grandma'); await sleep(5);
    check(TT.ITEMS.family.length === 1 && !TT.available('family'), 'one named photo: still off');
    name(b, 'our dog'); await sleep(5);
    check(TT.ITEMS.family.length === 2 && TT.DOMS().includes('family') && d.querySelector('#panel .chip[data-v="family"]'), 'two named photos: Family joins the categories');
    check(TT.ownPhrases().some(p => p.id === 'name:family:' + a && p.text === 'Grandma.') && TT.ownPhrases().some(p => p.text === "Where's our dog?"), 'the booth lists each name, "Find …!" and "Where\'s …?" to record');
    check(JSON.parse(w.localStorage.getItem('tt.family')).length === 2, 'labels persist');
    // the gate locks again when the panel closes
    click('#panel [data-act="dom"][data-v="family"]'); TT.settings.domains = ['family']; TT.dprog('family').level = 1;
    Object.assign(TT.CFG, { BLOCK_MS: 600000, CALM_MS: 1000, MIN_BLOCK_MS: 100, PEEK_MS: 20, CELEBRATE_MS: 20, CELEBRATE_NEW_MS: 20, CELEBRATE_PARADE_MS: 20, IDLE_MS: 1e6, POKE_MS: 1e6, RESHUFFLE_MS: 1e6, REVIEW_P: 0 });
    TT.settings.minutes = 30; TT.settings.sound = true;
    click('#panel [data-act="start"]'); await sleep(20);
    check(!TT.S.gateOk, 'leaving the panel locks the gate again');
    check(TT.S.dom === 'family' && TT.S.trial && TT.S.trial.mode === 'find' && d.querySelectorAll('#choices .card .item.photo img').length === 2, 'a Family block deals two photo cards');
    check(/^Find (Grandma|our dog)!$/.test(TT.S.trial.prompt), 'prompt reads "Find Grandma!" with no "the" (' + TT.S.trial.prompt + ')');
    const tr = TT.S.trial, right = [...d.querySelectorAll('#choices .card')].find(c => c.dataset.id === tr.target.id);
    right.dispatchEvent(new w.Event('pointerdown', { bubbles: true }));
    check(tr.done && TT.metToday().includes(tr.target.id) && d.querySelector('#celebrate .item.photo'), 'finding Grandma celebrates with her photo and she joins today\'s met list');
    // remove one under the gate: category switches off, progress for it is gone
    await sleep(40); TT.openSwitch(); click('#switch [data-act="settings"]');
    check(!d.querySelector('#family [data-act="pdel"]'), 'remove buttons are behind the gate');
    unlock(); click(`#family [data-act="pdel"][data-v="${a}"]`); await sleep(40);
    check(TT.family().length === 1 && TT.PHOTOS.count() === 1 && !TT.available('family') && !TT.metToday().includes('family:' + a) && !TT.settings.domains.includes('family'), 'removing a photo drops it from the store, the met list and the rotation');
    // reload: the remaining photo and its label come back from IndexedDB
    const again = boot({ storage: { 'tt.family': w.localStorage.getItem('tt.family') } }); await sleep(40);
    check(again.TT.family().length === 1 && again.TT.family()[0].name === 'our dog' && again.TT.PHOTOS.has(b), 'photos and labels survive a reload');
  }
  /* ---- native: photos as files ---- */
  {
    const disk = {}; const { w, TT, file, pick, name, unlock } = boot({ native: disk }); await sleep(30);
    unlock(); pick([file('c.jpg')]); await sleep(40);
    const id = TT.family()[0].id;
    check(Object.keys(disk).length === 1 && Object.keys(disk)[0] === 'photos/' + id + '.jpg', 'native: the photo is written under photos/ in the app\'s data directory');
    name(id, 'Daddy'); const b = boot({ native: disk, storage: { 'tt.family': w.localStorage.getItem('tt.family') } }); await sleep(40);
    check(b.TT.family()[0].name === 'Daddy' && b.TT.PHOTOS.has(id), 'native: a fresh launch reads it back');
    await b.TT.removePhoto(id);
    check(Object.keys(disk).length === 0, 'native: remove deletes the file');
  }
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
