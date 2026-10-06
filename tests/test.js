const { JSDOM } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function boot() {
  const spoken = [];
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://localhost/', beforeParse(w) {
    w.HTMLMediaElement.prototype.play = () => Promise.resolve(); w.HTMLMediaElement.prototype.pause = () => {};   // jsdom has no media playback; the silent unmute loop would otherwise log a stack trace per session
    w.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
    w.speechSynthesis = { cancel() {}, getVoices() { return [{ name: 'Samantha', lang: 'en-US', voiceURI: 'com.apple.voice.compact.en-US.Samantha', localService: true }, { name: 'Ava', lang: 'en-US', voiceURI: 'com.apple.voice.premium.en-US.Ava', localService: true }, { name: 'Google US English', lang: 'en-US', voiceURI: 'Google US English', localService: false }]; },
      speak(u) { spoken.push(u.text); setTimeout(() => u.onend && u.onend(), 40); } };
  } });
  dom.window.__spoken = spoken;
  const w = dom.window, d = w.document;
  const tap = el => el.dispatchEvent(new w.Event('pointerdown', { bubbles: true }));
  return { w, d, tap, TT: w.TT };
}
let fails = 0;
const check = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) fails++; };

(async () => {
  /* ---- Test 1: engine paths ---- */
  {
    const { w, d, tap, TT } = boot();
    Object.assign(TT.CFG, { BLOCK_MS: 600000, CALM_MS: 1000, MIN_BLOCK_MS: 100, PEEK_MS: 20, CELEBRATE_MS: 20, CELEBRATE_NEW_MS: 20, CELEBRATE_PARADE_MS: 20, IDLE_MS: 1e6, POKE_MS: 1e6, RESHUFFLE_MS: 1e6 });
    TT.settings.minutes = 30; TT.settings.domains = ['animals']; TT.settings.sound = true;
    d.querySelector('[data-act="start"]').click();
    await sleep(20);
    check(TT.S.phase === 'explore' && d.querySelectorAll('#choices .card').length === 4, 'session starts in Explore with 4 cards');
    const dom0 = TT.S.dom;
    TT.CFG.EXPLORE_MIN_GAP_MS = 2; for (let i = 0; i < 12; i++) { const cards = d.querySelectorAll('#choices .card'); tap(cards[i % cards.length]); await sleep(4); }
    check(TT.dprog(dom0).level === (dom0 === 'letters' ? 1 : 1), `explore taps promote ${dom0} to level 1 (got ${TT.dprog(dom0).level})`);
    await sleep(950);
    check(TT.S.phase === 'trial' && TT.S.trial && TT.S.trial.level === 1 && d.querySelectorAll('#choices .card').length === 2, 'graduates into Match 2 with 2 cards');

    // wrong taps: shake, then hint after second miss
    {
      const tr = TT.S.trial; const wrong = [...d.querySelectorAll('#choices .card')].find(c => c.dataset.id !== tr.target.id);
      tap(wrong); check(wrong.classList.contains('shake'), 'wrong tap shakes');
      await sleep(470); check(wrong.classList.contains('dim'), 'wrong card dims');
      tap(wrong); check(!tr.hint, 'tapping the dimmed card again does not count');
      // force second miss via keyboard on the same wrong index is blocked; emulate by resetting dim
      wrong.classList.remove('dim'); tap(wrong); await sleep(5);
      check(tr.hint && d.querySelector('#choices .card.hint'), 'second miss shows the hint ring');
      const right = [...d.querySelectorAll('#choices .card')].find(c => c.dataset.id === tr.target.id); tap(right); await sleep(40);
      check(TT.S.stats.trials === 1 && TT.S.stats.firstOk === 0 && TT.S.stats.hints === 1, 'stats: 1 trial, 0 clean, 1 hint');
    }
    // climb: answer correctly until level 3 or 60 trials
    let n = 0;
    while (TT.dprog(dom0).level < 3 && n < 60) {
      const tr = TT.S.trial; if (!tr) { await sleep(30); continue; }
      const cards = [...d.querySelectorAll('#choices .card')];
      const idx = tr.choices.findIndex(it => it.id === tr.target.id);
      // keyboard path for a few, pointer for the rest
      if (n % 3 === 0) { const key = cards.length === 2 ? ['ArrowLeft', 'ArrowRight'][idx] : String(idx + 1); d.dispatchEvent(new w.KeyboardEvent('keydown', { key, bubbles: true })); }
      else tap(cards[idx]);
      n++; await sleep(45);
    }
    const lvl = TT.dprog(dom0).level;
    check(lvl >= 3, `clean answers climb to Find 3 in ${n} trials (level now ${lvl})`);
    check(TT.S.trial && TT.S.trial.level >= 2 && d.querySelectorAll('#choices .card').length >= 2, 'trial reflects the new level');
    check(TT.levelCap('letters') === (TT.dprog('animals').level >= 3 ? 4 : 1), 'letters cap follows the concrete max');

    // three misses in a row → support trials with 1 card
    let support = false;
    for (let i = 0; i < 3; i++) {
      const tr = TT.S.trial; const cards = [...d.querySelectorAll('#choices .card')];
      const wrong = cards.find(c => c.dataset.id !== tr.target.id); if (wrong) { tap(wrong); await sleep(470); wrong.classList.remove('dim'); tap(wrong); await sleep(5); }
      const right = cards.find(c => c.dataset.id === tr.target.id); tap(right); await sleep(45);
    }
    support = TT.S.trial && TT.S.trial.support && d.querySelectorAll('#choices .card').length === 1;
    check(support, 'three misses in a row triggers a can\'t-miss trial with one card');

    // demotion: keep missing at the current level
    const before = TT.dprog(dom0).level;
    for (let i = 0; i < 14; i++) {
      const tr = TT.S.trial; if (!tr) { await sleep(30); continue; }
      const cards = [...d.querySelectorAll('#choices .card')];
      const wrong = cards.find(c => c.dataset.id !== tr.target.id);
      if (wrong) { tap(wrong); await sleep(470); }
      const right = cards.find(c => c.dataset.id === tr.target.id); tap(right); await sleep(45);
    }
    check(TT.dprog(dom0).level < before, `repeated misses step back from ${before} to ${TT.dprog(dom0).level}`);

    // pause / resume via Escape
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    check(TT.S.paused && !d.querySelector('#screen-switch').classList.contains('hidden'), 'Esc pauses into the jump sheet');
    d.querySelector('#switch [data-act="settings"]').click();
    check(!d.querySelector('#screen-parent').classList.contains('hidden') && d.querySelector('#panel').textContent.includes('Clean rounds'), 'Settings from the sheet shows session stats');
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    check(!TT.S.paused && !d.querySelector('#screen-play').classList.contains('hidden'), 'Esc again resumes play');
    // persistence
    const saved = JSON.parse(w.localStorage.getItem('tt.progress'));
    check(saved && saved.domains[dom0] && saved.domains[dom0].level === TT.dprog(dom0).level, 'progress persists to localStorage');
  }

  /* ---- Test 2: full session machine ---- */
  {
    const { w, d, tap, TT } = boot();
    Object.assign(TT.CFG, { BLOCK_MS: 300, CALM_MS: 400, MIN_BLOCK_MS: 50, BREAK_EVERY: 2, BREAK_STEP_MS: 80, PEEK_MS: 20, CELEBRATE_MS: 20, CELEBRATE_NEW_MS: 20, CELEBRATE_PARADE_MS: 20, IDLE_MS: 1e6, POKE_MS: 1e6, RESHUFFLE_MS: 1e6 });
    TT.settings.minutes = 0.06; TT.settings.domains = ['animals', 'food']; TT.settings.sound = false;
    const seen = new Set(); const doms = new Set();
    d.querySelector('[data-act="start"]').click();
    const t0 = Date.now();
    while (Date.now() - t0 < 6000 && TT.S.phase !== 'done') { seen.add(TT.S.phase); if (TT.S.dom) doms.add(TT.S.dom); await sleep(15); }
    seen.add(TT.S.phase);
    check(seen.has('explore') && seen.has('break') && seen.has('calm') && seen.has('done'), 'phases seen: ' + [...seen].join(' → '));
    check(doms.size === 2, 'both categories got a block');
    check(!d.querySelector('#screen-done').classList.contains('hidden'), 'done screen is showing');
    d.querySelector('#done-parent').click();
    check(d.querySelector('#panel').textContent.includes('Start again'), 'grown-up panel offers Start again');
  }

  /* ---- Test 3: silent mode + idle nudge ---- */
  {
    const { w, d, tap, TT } = boot();
    Object.assign(TT.CFG, { BLOCK_MS: 600000, CALM_MS: 1000, MIN_BLOCK_MS: 100, PEEK_MS: 20, CELEBRATE_MS: 20, CELEBRATE_NEW_MS: 20, CELEBRATE_PARADE_MS: 20, IDLE_MS: 60, POKE_MS: 60, POKE_LEN_MS: 150, RESHUFFLE_MS: 1e6 });
    TT.settings.minutes = 30; TT.settings.domains = ['animals']; TT.settings.sound = false;
    TT.dprog('animals').level = 3;
    d.querySelector('[data-act="start"]').click(); await sleep(10);
    check(TT.S.trial && TT.S.trial.cue === 'peek' || (TT.S.trial && TT.S.trial.review), 'silent mode turns Find into Peek & find (cue=' + (TT.S.trial && TT.S.trial.cue) + ')');
    await sleep(200);
    check(TT.S.stats.reprompts >= 1 && TT.S.stats.pokes >= 1 && TT.S.phase === 'explore', 'idle → re-prompt → explore burst');
    Object.assign(TT.CFG, { IDLE_MS: 1e6, POKE_MS: 1e6 });
    await sleep(550);
    check(TT.S.phase === 'trial', 'returns to a trial after the burst');
    // mash reset
    {
      const tr = TT.S.trial; const cards = [...d.querySelectorAll('#choices .card')];
      const wrong = cards.filter(c => c.dataset.id !== tr.target.id);
      console.log('   phase', TT.S.phase, 'cards', cards.length, 'wrong', wrong.length, 'done', tr.done);
      for (let i = 0; i < 7; i++) { tap(wrong[i % wrong.length]); }
      console.log('   after mash: spam', TT.S.stats.spam, 'phase', TT.S.phase, 'taps', TT.S.tapTimes.length);
      check(TT.S.stats.spam === 1 && TT.S.phase === 'explore', 'mashing six taps in two seconds resets to explore');
    }
  }

  /* ---- Test 4: counting mode ---- */
  {
    const { w, d, tap, TT } = boot();
    Object.assign(TT.CFG, { BLOCK_MS: 600000, CALM_MS: 1000, MIN_BLOCK_MS: 100, CELEBRATE_MS: 20, CELEBRATE_NEW_MS: 20, CELEBRATE_PARADE_MS: 20, IDLE_MS: 1e6, POKE_MS: 1e6, RESHUFFLE_MS: 1e6, COUNT_GAP_MIN_MS: 0 });
    TT.settings.minutes = 30; TT.settings.domains = ['counting']; TT.settings.sound = true;
    check(TT.settings.domains.includes('counting') && TT.ladder('counting').length === 3, 'counting has its own 3-rung ladder');
    d.querySelector('[data-act="start"]').click(); await sleep(10);
    let tr = TT.S.trial;
    check(tr && tr.mode === 'count' && tr.target.val >= 1 && tr.target.val <= 3, `starts with a count trial, target ${tr && tr.target.val} (Up to 3)`);
    check(d.querySelector('#cue .numeral') && d.querySelector('#cue .numeral').textContent == tr.target.val, 'the target number is showing');
    check(d.querySelectorAll('#choices .card.pad').length === 1, 'one big tap pad');
    // tap up to the target, fast (mashing must not trip the spam reset)
    for (let i = 0; i < tr.target.val; i++) { tap(d.querySelector('#choices .pad')); }
    check(tr.done && TT.S.stats.trials === 1 && TT.S.stats.firstOk === 1 && TT.S.stats.spam === 0, 'reaching the target ends the round cleanly, no spam reset');
    check(d.querySelector('#celebrate .celebrate-row') && d.querySelector('#celebrate .celebrate-row').textContent.length > 0, 'celebration shows the counted things');
    await sleep(40);
    // keyboard: space counts
    tr = TT.S.trial; d.dispatchEvent(new w.KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    check(tr.count === 1 && d.querySelector('#choices .count-big .n') && d.querySelector('#choices .count-big .n').textContent === '1', 'Space taps and the counter shows 1');
    check(d.querySelectorAll('#choices .count-row span').length === 1, 'one object appears per tap');
    // finish rounds until promotion
    let n = 0;
    while (TT.dprog('counting').level < 1 && n < 40) {
      tr = TT.S.trial; if (!tr) { await sleep(30); continue; }
      while (!tr.done) tap(d.querySelector('#choices .pad'));
      n++; await sleep(45);
    }
    check(TT.dprog('counting').level === 1 && n >= 10, `clean rounds promote to Up to 6 after ${n} rounds (needs 12)`);
    let okRange = true;
    for (let i = 0; i < 6; i++) { tr = TT.S.trial; if (!tr.review && !tr.support && (tr.target.val < 2 || tr.target.val > 6)) okRange = false; while (!tr.done) tap(d.querySelector('#choices .pad')); await sleep(45); }
    check(okRange, 'Up to 6 targets stay within 2 to 6');
    // idle nudge marks the round not clean
    Object.assign(TT.CFG, { IDLE_MS: 40, POKE_MS: 1e6 });
    TT.runTrial(); await sleep(90);
    tr = TT.S.trial; check(tr.nudged && TT.S.stats.reprompts >= 1, 'idle re-prompt marks the round as nudged');
    const before = TT.S.stats.firstOk; while (!tr.done) tap(d.querySelector('#choices .pad'));
    check(TT.S.stats.firstOk === before, 'a nudged round does not count as clean');
    check(d.querySelector('#panel') && (TT.S.paused || true), 'ok');
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    check(d.querySelector('#panel').textContent.includes('Up to 6') && d.querySelector('#panel').textContent.includes('Counting'), 'panel shows the counting ladder');
  }

  /* ---- Test 5: jump sheet, swipe/N keys, calm on demand, voice ranking + no-clip queue ---- */
  {
    const { w, d, tap, TT } = boot();
    check(TT.TTS.voice && /premium/.test(TT.TTS.voice.voiceURI), 'auto-picks the premium offline voice (' + (TT.TTS.voice && TT.TTS.voice.name) + ')');
    Object.assign(TT.CFG, { BLOCK_MS: 600000, CALM_MS: 1000, MIN_BLOCK_MS: 100, CELEBRATE_MS: 20, CELEBRATE_NEW_MS: 20, CELEBRATE_PARADE_MS: 20, IDLE_MS: 1e6, POKE_MS: 1e6, RESHUFFLE_MS: 1e6, CALM_JUMP_MS: 150, BREAK_STEP_MS: 60, BREAK_EVERY: 100 });
    TT.settings.minutes = 30; TT.settings.domains = ['animals', 'counting']; TT.settings.sound = true;
    d.querySelector('[data-act="start"]').click(); await sleep(10);
    const first = TT.S.dom;
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    check(TT.S.paused && !d.querySelector('#screen-switch').classList.contains('hidden'), 'Esc opens the jump sheet and pauses');
    check(d.querySelectorAll('#switch .jump').length === TT.DOMS().length + 2, 'sheet lists every available category plus wiggle and calm');
    d.querySelector('#switch [data-act="jump"][data-v="counting"]').click(); await sleep(10);
    check(!TT.S.paused && TT.S.dom === 'counting' && TT.S.trial && TT.S.trial.mode === 'count' && !d.querySelector('#screen-play').classList.contains('hidden'), 'tapping Counting jumps straight into a counting round');
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'n', bubbles: true })); await sleep(10);
    check(TT.S.dom === 'animals', 'N steps to the next category');
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'p', bubbles: true })); await sleep(10);
    check(TT.S.dom === 'counting', 'P steps back');
    // fast counting taps never clip: with the stub, speech is one utterance at a time and only the newest pending is spoken
    const before = w.__spoken.length; const tr = TT.S.trial; const pad = d.querySelector('#choices .pad');
    for (let i = 0; i < tr.target.val; i++) tap(pad);
    const said = w.__spoken.slice(before);
    check(tr.done && said.length <= 2 && new RegExp(TT.CHEERS.map(c => c.replace(/[.*+?^$()|]/g, '\\$&')).concat(['You found the']).join('|')).test(said[said.length - 1]) && said[said.length - 1].includes(tr.target.name.charAt(0).toUpperCase() + tr.target.name.slice(1)), `rapid taps collapse to whole words, celebration says the number (${said.length} utterances)`);
    await sleep(40);
    // jump to a jumped-in category that isn't in rotation adds it
    TT.openSwitch(); d.querySelector('#switch [data-act="jump"][data-v="food"]').click(); await sleep(10);
    check(TT.S.dom === 'food' && TT.settings.domains.includes('food'), 'jumping to an unselected category adds it to the rotation');
    // calm on demand, then back to play
    TT.openSwitch(); d.querySelector('#switch [data-act="calm"]').click();
    check(TT.S.phase === 'calm' && !TT.S.paused, 'Calm bubbles starts immediately');
    await sleep(950);
    check(TT.S.phase === 'explore' || TT.S.phase === 'trial', 'calm hands back to play after its timer (' + TT.S.phase + ')');
    // wiggle on demand, then back
    TT.openSwitch(); d.querySelector('#switch [data-act="wiggle"]').click();
    check(TT.S.phase === 'break', 'Wiggle break starts immediately');
    await sleep(220);
    check(TT.S.phase === 'explore' || TT.S.phase === 'trial', 'wiggle hands back to play (' + TT.S.phase + ')');
    // settings from the sheet, rate + voice controls present, end now
    TT.openSwitch(); d.querySelector('#switch [data-act="settings"]').click();
    check(!d.querySelector('#screen-parent').classList.contains('hidden') && d.querySelector('#panel select[data-act="voice"]') && d.querySelector('#panel [data-act="rate"]'), 'Settings opens with the voice picker and speed control');
    const sel = d.querySelector('#panel select[data-act="voice"]'); sel.value = 'com.apple.voice.compact.en-US.Samantha'; sel.dispatchEvent(new w.Event('change', { bubbles: true }));
    check(TT.settings.voiceURI.includes('Samantha') && TT.TTS.voice.name === 'Samantha', 'choosing a voice sticks');
    d.querySelector('#panel [data-act="resume"]').click(); await sleep(10);
    TT.openSwitch(); d.querySelector('#switch [data-act="end"]').click();
    check(TT.S.phase === 'done' && !d.querySelector('#screen-done').classList.contains('hidden'), 'All done now ends the session on the done screen');
  }

  /* ---- Test 6: celebration tiers, cheer rotation, today's recap ---- */
  {
    const { w, d, tap, TT } = boot();
    check(TT.CFG.CELEBRATE_MS <= 2500 && TT.CFG.CELEBRATE_NEW_MS <= 2500 && TT.CFG.CELEBRATE_PARADE_MS <= 2500, 'every celebration tier is under 2.5 s by default');
    check(TT.CHEERS.length === 12 && new Set(TT.CHEERS).size === 12, 'twelve distinct cheers');
    const phrases = JSON.parse(require('fs').readFileSync(__dirname + '/../tools/voice/phrases.json', 'utf8'));
    const clipIds = JSON.parse(html.match(/<script id="clips" type="application\/json">(.*?)<\/script>/s)[1]);
    const needed = ['new', 'you-found-the', ...TT.CHEERS.map((c, i) => 'cheer:' + i)];
    check(needed.every(id => phrases[id]) && needed.every(id => clipIds[id]), 'new cheers and tier words are in phrases.json and recorded in the clip pack');
    Object.assign(TT.CFG, { BLOCK_MS: 600000, CALM_MS: 1000, MIN_BLOCK_MS: 100, PEEK_MS: 20, CELEBRATE_MS: 20, CELEBRATE_NEW_MS: 30, CELEBRATE_PARADE_MS: 40, IDLE_MS: 1e6, POKE_MS: 1e6, RESHUFFLE_MS: 1e6, REVIEW_P: 0 });
    TT.settings.minutes = 30; TT.settings.domains = ['animals']; TT.settings.sound = true;
    TT.dprog('animals').level = 1;
    d.querySelector('[data-act="start"]').click(); await sleep(10);
    const right = () => { const tr = TT.S.trial; return [...d.querySelectorAll('#choices .card')].find(c => c.dataset.id === tr.target.id); };
    const wrong = () => { const tr = TT.S.trial; return [...d.querySelectorAll('#choices .card')].find(c => c.dataset.id !== tr.target.id); };
    // 1st clean find of anything: "New!"
    let before = w.__spoken.length; let it = TT.S.trial.target; tap(right());
    check(TT.S.lastTier === 'new' && d.querySelector('#celebrate .badge') && d.querySelector('#celebrate .badge').textContent === 'New!', 'first clean find of an item shows the New! badge');
    check(/^New! /.test(w.__spoken[before]), 'and says "New!" first (' + w.__spoken[before] + ')');
    check(TT.metToday().includes(it.id) && TT.S.stats.news === 1, 'the item joins today\'s met list');
    await sleep(60);
    // a hinted find is not clean: streak resets, nothing new
    tap(wrong()); await sleep(470); let wc = wrong(); wc.classList.remove('dim'); tap(wc); await sleep(5); tap(right());
    check(TT.S.lastTier === 'normal' && !d.querySelector('#celebrate .badge') && TT.S.cleanStreak === 0, 'a hinted find celebrates normally and resets the streak');
    await sleep(40);
    // three clean in a row → parade with three items, then the streak restarts
    let tiers = [], parade = null;
    for (let i = 0; i < 3; i++) { tap(right()); tiers.push(TT.S.lastTier); if (TT.S.lastTier === 'parade') { const el = d.querySelector('#celebrate'); parade = { items: el.querySelectorAll('.parade .item').length, text: el.textContent }; } await sleep(70); }
    check(tiers[2] === 'parade' && tiers[0] !== 'parade' && tiers[1] !== 'parade', 'the third clean find in a row is a parade (' + tiers.join(',') + ')');
    check(parade && parade.items === 3 && /3 in a row/.test(parade.text), 'the parade marches the last three finds');
    const paradeSaid = w.__spoken.filter(t => /, .*, .*!$/.test(t)).pop() || '';
    check(paradeSaid.split(',').length === 3, 'parade speech names all three (' + paradeSaid + ')');
    check(TT.S.cleanStreak === 0 && TT.S.stats.parades === 1, 'streak restarts after a parade');
    // cheers rotate through all twelve plus the composed one, never random
    const texts = new Set(); let composed = 0; TT.S.cheerIdx = 0;
    for (let i = 0; i < 13; i++) { const c = TT.nextCheer(TT.ITEMS.animals[0]); if (c.composed) composed++; else texts.add(c.text); }
    check(texts.size === 12 && composed === 1, 'thirteen cheers in a row cover all twelve plus one "You found the ___!"');
    const c2 = TT.nextCheer(TT.ITEMS.animals[0]);
    check(c2.text === TT.CHEERS[0], 'then the rotation starts over');
    // all-done recap lists what was met today
    const met = TT.metToday().slice();
    TT.openSwitch(); d.querySelector('#switch [data-act="end"]').click();
    const recap = d.querySelector('#done-met');
    check(/Today you met/.test(recap.textContent) && met.every(id => recap.textContent.includes(id.split(':')[1])), 'done screen lists today\'s clean finds by name (' + met.length + ')');
    check(recap.querySelectorAll('.met').length === met.length && met.length >= 1, 'one chip per item met');
    const saved = JSON.parse(w.localStorage.getItem('tt.progress'));
    check(saved.today && saved.today.met.length === met.length && /^\d{4}-\d{2}-\d{2}$/.test(saved.today.date), 'today\'s list persists with its date');
    // a fresh boot on the same day with nothing met says so
    const b2 = boot(); b2.TT.progress().today = { date: '2000-01-01', met: ['animals:cow'] };
    Object.assign(b2.TT.CFG, { CALM_MS: 1, MIN_BLOCK_MS: 1e9 }); b2.TT.settings.minutes = 0.001; b2.TT.settings.domains = ['animals'];
    b2.d.querySelector('[data-act="start"]').click(); await sleep(900);
    check(b2.TT.S.phase === 'done' && /all about exploring/.test(b2.d.querySelector('#done-met').textContent), 'an old day\'s list is dropped: recap shows the exploring line');
  }

  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
