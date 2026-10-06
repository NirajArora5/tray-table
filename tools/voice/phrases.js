// Build the list of every spoken phrase the game can need, keyed by clip id.
const { JSDOM } = require('jsdom'); const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../../index.html', 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://localhost/' }); const TT = dom.window.TT;
const cap1 = s => s.charAt(0).toUpperCase() + s.slice(1);
const LETTER = { A: 'ay', B: 'bee', C: 'see', D: 'dee', E: 'ee', O: 'oh', S: 'ess', M: 'em' };
const P = {};
for (const d of Object.keys(TT.ITEMS)) for (const it of TT.ITEMS[d]) { if (TT.DOMAINS[d].kind === 'photo') continue;   // family photos are the parent's, recorded in the booth
  const kind = TT.DOMAINS[d].kind;
  const spoken = kind === 'letter' ? LETTER[it.name] : it.name;                       // how the name is pronounced
  const label = kind === 'letter' ? 'letter ' + LETTER[it.name] : kind === 'swatch' ? it.name + ' one' : kind === 'number' ? 'number ' + it.name : it.name;
  P['name:' + it.id] = cap1(spoken) + '.';
  if (it.say) P['say:' + it.id] = it.say;
  if (d !== 'counting') { P['find:' + it.id] = `Find the ${label}!`; P['where:' + it.id] = `Where's the ${label}?`; }
}
TT.CHEERS.forEach((c, i) => P['cheer:' + i] = c);
TT.WIGGLES.forEach(([e, t], i) => P['wiggle:' + i] = t);
TT.COUNT_OBJECTS.forEach(([one, e, many]) => { P['one:' + one] = one + '.'; P['many:' + one] = many + '.'; });
Object.assign(P, { 'lets-play': "Let's play!", 'here': 'Here!', 'tap-tap': 'Tap, tap!', 'what-do-you-see': 'What do you see?', 'touch-one': 'Touch one!',
  'lets-count-to': "Let's count to", 'new': 'New!', 'you-found-the': 'You found the', 'calm': 'Nice and slow. Pop the bubbles.', 'all-done': 'All done! Great job!', 'hi-lets-play': "Hi! Let's play." });
fs.writeFileSync(__dirname + '/phrases.json', JSON.stringify(P, null, 1));
console.log(Object.keys(P).length, 'phrases');
