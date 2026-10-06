const { JSDOM } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SCALE = 20; // 10 real minutes play out in 30 s
const sc = ms => Math.max(5, Math.round(ms / SCALE));

function boot() {
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://localhost/', beforeParse(w) {
    w.HTMLMediaElement.prototype.play = () => Promise.resolve(); w.HTMLMediaElement.prototype.pause = () => {};   // jsdom has no media playback; the silent unmute loop would otherwise log a stack trace per session
    w.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
    w.speechSynthesis = { cancel() {}, getVoices() { return []; }, speak(u) { setTimeout(() => u.onend && u.onend(), 5); } };
  } });
  const w = dom.window, d = w.document;
  const tap = el => el && el.dispatchEvent(new w.Event('pointerdown', { bubbles: true }));
  const TT = w.TT;
  Object.assign(TT.CFG, { BLOCK_MS: sc(75000), CALM_MS: sc(60000), MIN_BLOCK_MS: sc(15000), BREAK_STEP_MS: sc(10000), PEEK_MS: sc(1600),
    CELEBRATE_MS: sc(1500), CELEBRATE_NEW_MS: sc(2200), CELEBRATE_PARADE_MS: sc(2400), EXPLORE_MIN_GAP_MS: sc(400), COUNT_GAP_MIN_MS: sc(300), COUNT_GAP_MAX_MS: sc(2500), IDLE_MS: sc(12000), POKE_MS: sc(18000), POKE_LEN_MS: sc(20000), RESHUFFLE_MS: sc(25000), CALM_JUMP_MS: sc(120000) });
  TT.settings.minutes = 10 / SCALE; TT.settings.sound = true; TT.settings.domains = ['animals', 'vehicles', 'food', 'counting', 'letters'];
  return { w, d, tap, TT };
}

const PERSONAS = {
  masher:     { gap: () => 150 + Math.random() * 250, pick: () => 'random', idle: 0 },
  random:     { gap: () => 1000 + Math.random() * 2000, pick: () => 'random', idle: 0.05 },
  learner:    { gap: () => 1000 + Math.random() * 3000, pick: 'learn', idle: 0.05 },
  distracted: { gap: () => 1000 + Math.random() * 2500, pick: 'learn', idle: 0.3 },
  ignorer:    { gap: () => 20000 + Math.random() * 40000, pick: () => 'random', idle: 0 },
};

async function run(name) {
  const P = PERSONAS[name];
  const { w, d, tap, TT } = boot();
  const exposure = {}; // item id → times seen (learner's accuracy grows with exposure)
  const log = { phases: {}, promos: [], trials: 0, firstTrialLevel: {}, maxChoices: 0 };
  const levelsBefore = {}; for (const dm of TT.settings.domains) levelsBefore[dm] = TT.dprog(dm).level;
  d.querySelector('[data-act="start"]').click();
  const t0 = Date.now(); let lastLevels = {};
  while (TT.S.phase !== 'done' && Date.now() - t0 < 60000) {
    const S = TT.S; log.phases[S.phase] = (log.phases[S.phase] || 0) + 1;
    for (const dm of TT.settings.domains) { const L = TT.dprog(dm).level; if (lastLevels[dm] !== undefined && lastLevels[dm] !== L) log.promos.push(`${dm}:${lastLevels[dm]}→${L}@${Math.round((Date.now() - t0) * SCALE / 60000)}m`); lastLevels[dm] = L; }
    let wait = P.gap();
    if (Math.random() < P.idle) wait += 15000 + Math.random() * 25000;   // wanders off
    if (S.phase === 'trial' && S.trial) {
      const tr = S.trial;
      if (tr.mode === 'count') { tap(d.querySelector('#choices .pad')); wait = name === 'ignorer' ? wait : name === 'masher' ? 120 + Math.random() * 150 : 400 + Math.random() * 1200; }
      else {
        const cards = [...d.querySelectorAll('#choices .card')];
        log.maxChoices = Math.max(log.maxChoices, cards.length);
        let card;
        if (P.pick === 'learn') {
          const e = exposure[tr.target.id] = (exposure[tr.target.id] || 0) + 1;
          const acc = Math.min(0.95, 0.35 + 0.12 * e);
          card = Math.random() < acc ? cards.find(c => c.dataset.id === tr.target.id) : cards[Math.floor(Math.random() * cards.length)];
        } else card = cards[Math.floor(Math.random() * cards.length)];
        tap(card);
      }
    } else if (S.phase === 'explore') {
      const cards = [...d.querySelectorAll('#choices .card')]; tap(cards[Math.floor(Math.random() * cards.length)]);
    } else if (S.phase === 'calm') { tap(d.querySelector('#bubbles .bubble')); }
    await sleep(sc(wait));
  }
  const st = TT.S.stats;
  const levels = TT.settings.domains.map(dm => `${dm}=${TT.ladder(dm)[TT.dprog(dm).level].name}`).join(', ');
  console.log(`\n== ${name} == ${TT.S.phase === 'done' ? 'finished' : 'TIMED OUT in ' + TT.S.phase}`);
  console.log(`  trials ${st.trials}, clean ${st.trials ? Math.round(100 * st.firstOk / st.trials) : 0}%, hints ${st.hints}, idle nudges ${st.pokes}, mash resets ${st.spam}, explore taps ${st.exploreTaps}`);
  console.log(`  ladders: ${levels}`);
  console.log(`  moves: ${log.promos.join(' ') || 'none'}`);
  console.log(`  ticks by phase: ${Object.entries(log.phases).map(([k, v]) => k + ':' + v).join(' ')}; letters cap ${TT.levelCap('letters')}`);
}

(async () => {
  for (const n of Object.keys(PERSONAS)) await run(n);
  // choice-count check at Find 4 (the screenshots showed 3 cards twice)
  {
    const { d, TT } = boot();
    Object.assign(TT.CFG, { BLOCK_MS: 1e9, IDLE_MS: 1e9, POKE_MS: 1e9, CELEBRATE_MS: 1e9, CELEBRATE_NEW_MS: 1e9, CELEBRATE_PARADE_MS: 1e9 });
    TT.settings.minutes = 60; TT.settings.domains = ['vehicles']; TT.dprog('vehicles').level = 4;
    d.querySelector('[data-act="start"]').click(); await sleep(10);
    const counts = {};
    for (let i = 0; i < 300; i++) { TT.S.support = 0; TT.runTrial(); const k = d.querySelectorAll('#choices .card').length; const tag = k + (TT.S.trial.review ? 'r' : ''); counts[tag] = (counts[tag] || 0) + 1; }
    console.log('\nFind 4 card counts over 300 trials:', JSON.stringify(counts), '(3r = review trial one step easier)');
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(2); });
