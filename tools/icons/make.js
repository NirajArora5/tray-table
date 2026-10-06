// Build the 1024px icon and 2732px splash sources in assets/ from icon-512.png, then @capacitor/assets fans them out.
//   node tools/icons/make.js && npx capacitor-assets generate --ios --android --iconBackgroundColor '#2f6fed' ...  (see package.json "assets")
// Uses sharp, which @capacitor/assets already brings in. Swap icon-512.png for a 1024px master whenever one exists.
const sharp = require('sharp'), path = require('path');
const root = path.join(__dirname, '..', '..'), src = path.join(root, 'icon-512.png'), out = path.join(root, 'assets');
(async () => {
  const { data } = await sharp(src).raw().toBuffer({ resolveWithObject: true });
  const i = (256 * 512 + 40) * 4, blue = { r: data[i], g: data[i + 1], b: data[i + 2] };   // the icon's own blue, sampled mid-left
  const hex = '#' + [blue.r, blue.g, blue.b].map(v => v.toString(16).padStart(2, '0')).join('');
  const icon1024 = await sharp(src).resize(1024, 1024, { kernel: 'lanczos3' }).png().toBuffer();
  // iOS icon: square, no alpha, rounded corners filled with the same blue (iOS masks its own corners)
  await sharp(icon1024).flatten({ background: blue }).png().toFile(path.join(out, 'icon-only.png'));
  // Android adaptive icon: solid blue background, foreground is the icon shrunk into the 66% safe zone
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: blue } }).png().toFile(path.join(out, 'icon-background.png'));
  const fg = await sharp(icon1024).resize(680, 680).png().toBuffer();
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { ...blue, alpha: 1 } } })
    .composite([{ input: fg, gravity: 'centre' }]).png().toFile(path.join(out, 'icon-foreground.png'));
  // Splash: the rounded icon centred on the app's page colour, light and dark
  const logo = await sharp(icon1024).resize(560, 560).png().toBuffer();
  for (const [name, bg] of [['splash.png', '#f6f8ff'], ['splash-dark.png', '#121622']])
    await sharp({ create: { width: 2732, height: 2732, channels: 4, background: bg } }).composite([{ input: logo, gravity: 'centre' }]).png().toFile(path.join(out, name));
  console.log('assets/: icon-only, icon-background, icon-foreground, splash, splash-dark; icon blue =', hex);
})();
