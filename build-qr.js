const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

async function main() {
  const url = 'https://launch1500.surge.sh';
  const assetsDir = path.join(__dirname, 'assets');
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }

  // 1. Generate high-resolution crisp PNG (1024px)
  const pngPath = path.join(assetsDir, 'launch1500-qr.png');
  await QRCode.toFile(pngPath, url, {
    errorCorrectionLevel: 'H',
    type: 'png',
    margin: 2,
    width: 1024,
    color: {
      dark: '#0A1320', // deep midnight obsidian
      light: '#FAF8F5' // warm alabaster
    }
  });
  console.log('Generated', pngPath);

  // 2. Generate clean standalone SVG
  const svgRaw = await QRCode.toString(url, {
    errorCorrectionLevel: 'H',
    type: 'svg',
    margin: 2,
    color: {
      dark: '#0A1320',
      light: '#FAF8F5'
    }
  });

  const svgPath = path.join(assetsDir, 'launch1500-qr.svg');
  fs.writeFileSync(svgPath, svgRaw, 'utf8');
  console.log('Generated', svgPath);

  // 3. Generate Luxury Framed SVG with Gold Accents matching the user's visual
  // Extract all paths from svgRaw
  const paths = svgRaw.match(/<path[^>]*\/>/g) || [];
  let qrInner = '';
  paths.forEach(p => {
    // If it's the module stroke path
    if (p.includes('stroke=')) {
      qrInner += p;
    }
  });

  const framedSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 500" width="100%" height="100%">
  <defs>
    <linearGradient id="luxeGoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#F2DFB0"/>
      <stop offset="35%" stop-color="#C5A869"/>
      <stop offset="70%" stop-color="#E2CCA0"/>
      <stop offset="100%" stop-color="#8F6E26"/>
    </linearGradient>
    <linearGradient id="luxeCardBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0F1B2C"/>
      <stop offset="100%" stop-color="#070D16"/>
    </linearGradient>
    <filter id="softGlow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000000" flood-opacity="0.4"/>
    </filter>
  </defs>

  <!-- Card background -->
  <rect x="2" y="2" width="416" height="496" rx="22" fill="url(#luxeCardBg)" stroke="url(#luxeGoldGrad)" stroke-width="1.5" filter="url(#softGlow)"/>

  <!-- Subtle corner ornament lines -->
  <path d="M 28 18 L 18 18 L 18 28" fill="none" stroke="url(#luxeGoldGrad)" stroke-width="2.5" stroke-linecap="round"/>
  <path d="M 392 18 L 402 18 L 402 28" fill="none" stroke="url(#luxeGoldGrad)" stroke-width="2.5" stroke-linecap="round"/>
  <path d="M 18 472 L 18 482 L 28 482" fill="none" stroke="url(#luxeGoldGrad)" stroke-width="2.5" stroke-linecap="round"/>
  <path d="M 402 472 L 402 482 L 392 482" fill="none" stroke="url(#luxeGoldGrad)" stroke-width="2.5" stroke-linecap="round"/>

  <!-- Header Badge -->
  <g transform="translate(210, 36)" text-anchor="middle">
    <rect x="-115" y="-12" width="230" height="24" rx="12" fill="rgba(197, 168, 105, 0.12)" stroke="url(#luxeGoldGrad)" stroke-width="1"/>
    <text y="4" font-family="'Plus Jakarta Sans', system-ui, sans-serif" font-size="10.5" font-weight="700" letter-spacing="1.5" fill="#E2CCA0">VERIFIED LIVE PREVIEW</text>
  </g>

  <!-- Inner QR White/Alabaster Plate with Gold Rim -->
  <g transform="translate(70, 56)">
    <!-- Gold Rim -->
    <rect x="-5" y="-5" width="290" height="290" rx="18" fill="none" stroke="url(#luxeGoldGrad)" stroke-width="2" opacity="0.95"/>
    <!-- Alabaster Card -->
    <rect x="0" y="0" width="280" height="280" rx="14" fill="#FAF8F5"/>
    
    <!-- Render the QR Path scaled into 252x252 with 14px padding -->
    <g transform="translate(14, 14)">
      <svg width="252" height="252" viewBox="0 0 37 37" shape-rendering="crispEdges">
        <path fill="#FAF8F5" d="M0 0h37v37H0z"/>
        ${qrInner}
      </svg>
    </g>
  </g>

  <!-- Title & Link Subtext -->
  <g transform="translate(210, 382)" text-anchor="middle">
    <text font-family="'Fraunces', Georgia, serif" font-size="20" font-weight="600" fill="#FAF8F5">launch1500.surge.sh</text>
    <text y="24" font-family="'Plus Jakarta Sans', system-ui, sans-serif" font-size="12.5" font-weight="500" fill="#94A3B8">Scan with phone camera to experience live</text>
    <text y="46" font-family="'Cairo', system-ui, sans-serif" font-size="13.5" font-weight="600" fill="#DFC995">امسح الكود بكاميرا هاتفك للمعاينة الحية الفورية</text>
  </g>

  <!-- Bottom Details Bar -->
  <g transform="translate(210, 464)" text-anchor="middle">
    <rect x="-140" y="-12" width="280" height="24" rx="12" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
    <circle cx="-115" cy="0" r="3.5" fill="#25D366"/>
    <text x="5" y="4" font-family="'Plus Jakarta Sans', system-ui, sans-serif" font-size="11" font-weight="600" fill="#E2E8F0">Instant Mobile Loading · 100% Responsive</text>
  </g>
</svg>`;

  const framedPath = path.join(assetsDir, 'launch1500-luxury-qr-card.svg');
  fs.writeFileSync(framedPath, framedSvg, 'utf8');
  console.log('Regenerated', framedPath);
}

main().catch(console.error);
