const fs = require('fs');
const path = require('path');

const qrB64 = fs.readFileSync(path.join(__dirname, 'assets', 'launch1500-qr.png')).toString('base64');
const skylineSvg = fs.readFileSync(path.join(__dirname, 'assets', 'uae-skyline.svg'), 'utf8')
  .replace(/width="100%" height="100%"/, 'width="100%" height="140px"')
  .replace(/opacity="0.85"/, 'opacity="0.25"');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1920px;
    height: 1080px;
    overflow: hidden;
    background: #050911;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif;
    color: #FAF8F5;
    display: flex;
    justify-content: center;
    align-items: center;
    position: relative;
    user-select: none;
    -webkit-font-smoothing: antialiased;
  }

  /* Deep luxury lighting effects */
  .bg-ambient {
    position: absolute;
    inset: 0;
    background:
      radial-gradient(ellipse 1000px 550px at 50% -8%, rgba(212, 175, 55, 0.18), transparent 70%),
      radial-gradient(ellipse 900px 650px at 88% 112%, rgba(24, 65, 120, 0.45), transparent 75%),
      radial-gradient(ellipse 900px 650px at 12% 112%, rgba(14, 42, 85, 0.4), transparent 75%),
      linear-gradient(180deg, #070D18 0%, #04080F 100%);
    z-index: 1;
  }

  /* Outer master luxury frame */
  .frame-outer {
    position: relative;
    z-index: 5;
    width: 1840px;
    height: 1020px;
    border-radius: 28px;
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.035) 0%, rgba(255, 255, 255, 0.01) 100%);
    border: 1.5px solid rgba(197, 168, 105, 0.4);
    box-shadow: 
      0 0 90px rgba(0, 0, 0, 0.85),
      inset 0 0 70px rgba(197, 168, 105, 0.06);
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    padding: 30px 48px 24px 48px;
    gap: 16px;
    overflow: hidden;
  }

  /* Corner gold flourishes */
  .corner-ornament {
    position: absolute;
    width: 34px;
    height: 34px;
    border: 2px solid #D4AF37;
    pointer-events: none;
    opacity: 0.85;
  }
  .corner-tl { top: 14px; left: 14px; border-right: none; border-bottom: none; border-top-left-radius: 12px; }
  .corner-tr { top: 14px; right: 14px; border-left: none; border-bottom: none; border-top-right-radius: 12px; }
  .corner-bl { bottom: 14px; left: 14px; border-right: none; border-top: none; border-bottom-left-radius: 12px; }
  .corner-br { bottom: 14px; right: 14px; border-left: none; border-top: none; border-bottom-right-radius: 12px; }

  /* Background skyline positioned above bottom frame */
  .skyline-container {
    position: absolute;
    bottom: 0px;
    left: 0;
    right: 0;
    height: 160px;
    z-index: 2;
    pointer-events: none;
  }

  /* HEADER */
  .header {
    text-align: center;
    position: relative;
    z-index: 6;
  }
  .tag-pill {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 5px 18px;
    border-radius: 999px;
    background: rgba(197, 168, 105, 0.12);
    border: 1px solid rgba(212, 175, 55, 0.45);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 2.5px;
    text-transform: uppercase;
    color: #F1DDAF;
    margin-bottom: 8px;
  }
  .headline-en {
    font-size: 40px;
    font-weight: 800;
    letter-spacing: 1.5px;
    line-height: 1.15;
    background: linear-gradient(135deg, #FFFFFF 0%, #F8EEDB 45%, #DFC995 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    text-transform: uppercase;
  }
  .headline-ar {
    font-size: 30px;
    font-weight: 800;
    margin-top: 3px;
    color: #DFC995;
    font-family: "SF Arabic", "Geeza Pro", "Cairo", "Tahoma", sans-serif;
    letter-spacing: 0.5px;
  }

  /* COMPARISON SECTION */
  .compare-deck {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 28px;
    position: relative;
    z-index: 6;
  }

  .card {
    border-radius: 22px;
    padding: 24px 34px;
    position: relative;
    backdrop-filter: blur(16px);
  }

  /* Card: Standard Agency */
  .card-agency {
    background: linear-gradient(180deg, rgba(16, 23, 36, 0.8) 0%, rgba(10, 15, 24, 0.92) 100%);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }
  .card-title-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    padding-bottom: 10px;
    margin-bottom: 14px;
  }
  .card-name-en {
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: #94A3B8;
  }
  .card-name-ar {
    font-size: 16px;
    font-weight: 600;
    color: #64748B;
    font-family: "SF Arabic", "Geeza Pro", "Cairo", sans-serif;
  }
  .price-agency-box {
    display: flex;
    align-items: baseline;
    gap: 12px;
    margin-bottom: 16px;
  }
  .price-struck {
    font-size: 44px;
    font-weight: 800;
    color: #71717A;
    position: relative;
    display: inline-block;
  }
  .price-struck::after {
    content: '';
    position: absolute;
    left: -4%;
    right: -4%;
    top: 50%;
    height: 3.5px;
    background: #EF4444;
    transform: rotate(-6deg);
    border-radius: 2px;
    box-shadow: 0 0 12px rgba(239, 68, 68, 0.7);
  }
  .price-unit-muted {
    font-size: 18px;
    font-weight: 600;
    color: #52525B;
  }

  /* Card: Launch1500 */
  .card-launch {
    background: linear-gradient(180deg, rgba(22, 38, 62, 0.9) 0%, rgba(10, 20, 34, 0.96) 100%);
    border: 1.8px solid #D4AF37;
    box-shadow: 
      0 0 45px rgba(212, 175, 55, 0.22),
      inset 0 0 35px rgba(212, 175, 55, 0.08);
  }
  .card-launch .card-name-en {
    color: #FFFFFF;
    font-size: 20px;
    font-weight: 800;
    letter-spacing: 2px;
  }
  .card-launch .card-name-ar {
    color: #DFC995;
    font-size: 18px;
  }
  .price-launch-box {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 16px;
  }
  .price-primary-group {
    display: flex;
    align-items: baseline;
    gap: 10px;
  }
  .price-prefix {
    font-size: 15px;
    font-weight: 700;
    color: #DFC995;
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .price-launch {
    font-size: 48px;
    font-weight: 900;
    background: linear-gradient(135deg, #FFFFFF 15%, #F8EEDB 55%, #DFC995 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .price-launch-currency {
    font-size: 22px;
    font-weight: 800;
    color: #DFC995;
  }
  .badge-deposit {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 14px;
    border-radius: 10px;
    background: rgba(212, 175, 55, 0.16);
    border: 1px solid #D4AF37;
    color: #F8E7BE;
    font-size: 13.5px;
    font-weight: 700;
  }

  /* Feature Lists */
  .feature-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .feature-item {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 15.5px;
    line-height: 1.35;
  }
  .item-icon {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 800;
    flex-shrink: 0;
  }
  .icon-cross {
    background: rgba(239, 68, 68, 0.15);
    color: #F87171;
    border: 1px solid rgba(239, 68, 68, 0.35);
  }
  .icon-check {
    background: rgba(212, 175, 55, 0.22);
    color: #F5E8CE;
    border: 1px solid #D4AF37;
    box-shadow: 0 0 10px rgba(212, 175, 55, 0.35);
  }
  .item-text-agency {
    color: #94A3B8;
    display: flex;
    justify-content: space-between;
    width: 100%;
  }
  .item-text-launch {
    color: #F1F5F9;
    display: flex;
    justify-content: space-between;
    width: 100%;
    font-weight: 600;
  }
  .ar-sub {
    font-family: "SF Arabic", "Geeza Pro", "Cairo", sans-serif;
    font-size: 14.5px;
    color: #64748B;
  }
  .item-text-launch .ar-sub {
    color: #DFC995;
    font-weight: 500;
  }

  /* BOTTOM ACTION DECK: ACTUAL LINKS (ENGLISH & ARABIC) + CONNECTED SCANNABLE QR */
  .bottom-deck {
    position: relative;
    z-index: 6;
    display: grid;
    grid-template-columns: 1.15fr 0.95fr 1.15fr;
    gap: 20px;
    align-items: center;
    background: rgba(8, 15, 27, 0.90);
    border: 1.5px solid rgba(212, 175, 55, 0.42);
    border-radius: 22px;
    padding: 16px 26px;
    box-shadow: 
      0 12px 35px rgba(0, 0, 0, 0.75),
      inset 0 0 25px rgba(212, 175, 55, 0.05);
    backdrop-filter: blur(20px);
  }

  /* Contact / Link Box */
  .link-box {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .icon-box {
    width: 60px;
    height: 60px;
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .web-icon-en {
    background: rgba(212, 175, 55, 0.12);
    border: 1.5px solid rgba(212, 175, 55, 0.5);
    color: #F5E8CE;
    box-shadow: 0 0 16px rgba(212, 175, 55, 0.2);
  }
  .web-icon-ar {
    background: rgba(223, 201, 149, 0.14);
    border: 1.5px solid #DFC995;
    color: #DFC995;
    box-shadow: 0 0 16px rgba(223, 201, 149, 0.2);
  }
  .box-label-en {
    font-size: 11.5px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: #94A3B8;
    margin-bottom: 2px;
  }
  .box-label-ar {
    font-size: 13px;
    font-weight: 700;
    color: #DFC995;
    font-family: "SF Arabic", "Geeza Pro", "Cairo", sans-serif;
    margin-bottom: 2px;
  }
  .box-value {
    font-size: 21px;
    font-weight: 800;
    letter-spacing: 0.3px;
    line-height: 1.25;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", monospace;
  }
  .url-protocol {
    color: #DFC995;
    font-weight: 600;
  }
  .url-domain {
    color: #FFFFFF;
    font-weight: 800;
  }
  .box-hint-en {
    font-size: 12.5px;
    color: #DFC995;
    margin-top: 4px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .box-hint-ar {
    font-size: 12.5px;
    color: #CBD5E1;
    margin-top: 4px;
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: "SF Arabic", "Geeza Pro", "Cairo", sans-serif;
  }

  /* Center: QR Module connected to launch1500.surge.sh */
  .qr-center-module {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    background: rgba(255, 255, 255, 0.035);
    border: 1.2px solid rgba(212, 175, 55, 0.5);
    border-radius: 18px;
    padding: 10px 16px;
  }
  .qr-plate {
    width: 100px;
    height: 100px;
    background: #FAF8F5;
    border-radius: 12px;
    padding: 6px;
    border: 1.8px solid #D4AF37;
    box-shadow: 0 0 20px rgba(212, 175, 55, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .qr-plate img {
    width: 100%;
    height: 100%;
    display: block;
    image-rendering: pixelated;
  }
  .qr-info {
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  .qr-badge-live {
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 1.5px;
    color: #DFC995;
    text-transform: uppercase;
    margin-bottom: 2px;
  }
  .qr-cta-en {
    font-size: 16px;
    font-weight: 800;
    color: #FFFFFF;
    line-height: 1.2;
  }
  .qr-cta-ar {
    font-size: 14px;
    font-weight: 700;
    color: #DFC995;
    font-family: "SF Arabic", "Geeza Pro", "Cairo", sans-serif;
    margin-top: 2px;
  }
  .qr-subtag {
    font-size: 11.5px;
    color: #94A3B8;
    margin-top: 4px;
  }
</style>
</head>
<body>

<div class="bg-ambient"></div>

<div class="frame-outer">
  <!-- Corner gold ornaments -->
  <div class="corner-ornament corner-tl"></div>
  <div class="corner-ornament corner-tr"></div>
  <div class="corner-ornament corner-bl"></div>
  <div class="corner-ornament corner-br"></div>

  <!-- Background UAE Skyline -->
  <div class="skyline-container">
    ${skylineSvg}
  </div>

  <!-- HEADER -->
  <div class="header">
    <div class="tag-pill">
      <span>✦</span>
      <span>CALM STRATEGY · BESPOKE DIGITAL CRAFT · DUBAI & UAE</span>
      <span>✦</span>
    </div>
    <h1 class="headline-en">Agency Quality Without Agency Invoice</h1>
    <h2 class="headline-ar">جودة الوكالات الكبرى بدون تكلفة الوكالات</h2>
  </div>

  <!-- COMPARISON DECK -->
  <div class="compare-deck">
    <!-- Left: Standard Agency -->
    <div class="card card-agency">
      <div class="card-title-row">
        <span class="card-name-en">Standard Premium Agency</span>
        <span class="card-name-ar">وكالة متميزة تقليدية</span>
      </div>
      <div class="price-agency-box">
        <span class="price-struck">25,000+ AED</span>
        <span class="price-unit-muted">Initial Scope</span>
      </div>
      <ul class="feature-list">
        <li class="feature-item">
          <div class="item-icon icon-cross">✕</div>
          <div class="item-text-agency">
            <span>Complex 8–12 week consulting cycles</span>
            <span class="ar-sub">دورات استشارية مطولة ومعقدة</span>
          </div>
        </li>
        <li class="feature-item">
          <div class="item-icon icon-cross">✕</div>
          <div class="item-text-agency">
            <span>Opaque monthly retainers & hidden extras</span>
            <span class="ar-sub">رسوم صيانة شهرية باهظة وتكاليف إضافية</span>
          </div>
        </li>
        <li class="feature-item">
          <div class="item-icon icon-cross">✕</div>
          <div class="item-text-agency">
            <span>Impersonal support queues & account hand-offs</span>
            <span class="ar-sub">طوابير دعم بطيئة وبدون تواصل مباشر</span>
          </div>
        </li>
      </ul>
    </div>

    <!-- Right: Launch1500 -->
    <div class="card card-launch">
      <div class="card-title-row">
        <span class="card-name-en">Launch1500 · Direct Studio</span>
        <span class="card-name-ar">لانش 1500 · استوديو رقمي مباشر</span>
      </div>
      <div class="price-launch-box">
        <div class="price-primary-group">
          <span class="price-prefix">Starting</span>
          <span class="price-launch">1,500</span>
          <span class="price-launch-currency">AED</span>
        </div>
        <div class="badge-deposit">
          <span>🛡️</span>
          <span>30% Down Payment</span>
          <span style="opacity:0.4;">|</span>
          <span style="font-family:'SF Arabic', sans-serif;">دفعة أولى 30%</span>
        </div>
      </div>
      <ul class="feature-list">
        <li class="feature-item">
          <div class="item-icon icon-check">✓</div>
          <div class="item-text-launch">
            <span>Transparent milestones & fixed honest pricing</span>
            <span class="ar-sub">مراحل واضحة وتسعير محدد دون مفاجآت</span>
          </div>
        </li>
        <li class="feature-item">
          <div class="item-icon icon-check">✓</div>
          <div class="item-text-launch">
            <span>4–7 days rapid strategic delivery</span>
            <span class="ar-sub">تسليم استراتيجي سريع وعالي الدقة خلال أيام</span>
          </div>
        </li>
        <li class="feature-item">
          <div class="item-icon icon-check">✓</div>
          <div class="item-text-launch">
            <span>Direct founder partnership & ongoing delivery</span>
            <span class="ar-sub">شراكة ومتابعة مباشرة مع المؤسسين</span>
          </div>
        </li>
      </ul>
    </div>
  </div>

  <!-- BOTTOM ACTION DECK: ACTUAL LINK (ENGLISH & ARABIC) + CONNECTED SCANNABLE QR -->
  <div class="bottom-deck">
    <!-- Left: Actual Website Link in English -->
    <div class="link-box">
      <div class="icon-box web-icon-en">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="2" y1="12" x2="22" y2="12"></line>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
        </svg>
      </div>
      <div>
        <div class="box-label-en">Official Direct Website Link</div>
        <div class="box-value">
          <span class="url-protocol">https://</span><span class="url-domain">launch1500.surge.sh</span>
        </div>
        <div class="box-hint-en">
          <span>🟢</span>
          <span>Verified Live · Fast UAE CDN · Mobile Ready</span>
        </div>
      </div>
    </div>

    <!-- Center: The Exact Scannable QR Code (Connected Directly) -->
    <div class="qr-center-module">
      <div class="qr-plate">
        <img src="data:image/png;base64,${qrB64}" alt="QR code linking direct to https://launch1500.surge.sh">
      </div>
      <div class="qr-info">
        <div class="qr-badge-live">Direct Camera Scan</div>
        <div class="qr-cta-en">Scan to Open Website</div>
        <div class="qr-cta-ar">امسح الكود لفتح الموقع مباشرة</div>
        <div class="qr-subtag">Links to: launch1500.surge.sh</div>
      </div>
    </div>

    <!-- Right: Actual Website Link in Arabic -->
    <div class="link-box" style="justify-content: flex-end;">
      <div style="text-align: right;">
        <div class="box-label-ar">رابط الموقع الرسمي المباشر</div>
        <div class="box-value" style="direction: ltr; text-align: right;">
          <span class="url-protocol">https://</span><span class="url-domain">launch1500.surge.sh</span>
        </div>
        <div class="box-hint-ar" style="justify-content: flex-end;">
          <span>معاينة حية فورية · تجربة رقمية فاخرة وهادئة</span>
          <span>⚡</span>
        </div>
      </div>
      <div class="icon-box web-icon-ar">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
        </svg>
      </div>
    </div>
  </div>
</div>

</body>
</html>
`;

fs.writeFileSync(path.join(__dirname, 'render-banner.html'), html, 'utf8');
console.log('Successfully re-generated render-banner.html with actual links in English and Arabic and no WhatsApp number');
