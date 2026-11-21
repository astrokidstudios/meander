import sharp from 'sharp'
// App icon: full-bleed square, no transparency (iOS rounds the corners itself).
await sharp('scripts/icon-full.svg', { density: 1200 }).resize(1024, 1024).flatten({ background: '#12a594' }).png().toFile('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png')
// Launch screen: cream background with the logo in the middle.
const logo = await sharp('public/favicon.svg', { density: 1200 }).resize(520, 520).png().toBuffer()
for (const f of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png'])
  await sharp({ create: { width: 2732, height: 2732, channels: 3, background: '#fff8f1' } }).composite([{ input: logo, gravity: 'center' }]).png().toFile(`ios/App/App/Assets.xcassets/Splash.imageset/${f}`)
console.log('ios assets done')
