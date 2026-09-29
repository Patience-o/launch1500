(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LaunchWorkflow = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  'use strict';
  const PACKAGES = Object.freeze({
    lite: { name: 'Launch Lite', aed: 1500 }, basic: { name: 'Launch Basic', aed: 2000 },
    plus: { name: 'Launch Plus', aed: 3000 }, store: { name: 'Launch Store', aed: 4000 }, premium: { name: 'Launch Premium', aed: 5000 }
  });
  Object.values(PACKAGES).forEach(Object.freeze);
  const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
  const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  function validate(value) {
    if (!value || !Object.hasOwn(PACKAGES, value.package)) throw new Error('Choose a Launch1500 package.');
    const brand = text(value.brand, 80);
    if (brand.length < 2) throw new Error('Add a non-sensitive project name.');
    const pages = Array.isArray(value.pages) ? value.pages.map(item => text(item, 40)).filter(Boolean).slice(0, 8) : ['Home', 'Services', 'Contact'];
    if (!pages.length) throw new Error('Add at least one page or section.');
    return { brand, package: value.package, pages: [...new Set(pages)] };
  }
  function quotation(value) {
    const input = validate(value), pack = PACKAGES[input.package], totalMinor = pack.aed * 100;
    const depositMinor = Math.round(totalMinor * 30 / 100);
    return Object.freeze({ package: pack.name, currency: 'AED', totalMinor, depositMinor, balanceMinor: totalMinor - depositMinor, depositPercent: 30, status: 'PROVISIONAL_LOCAL', paymentStatus: 'NOT_VERIFIED', taxStatus: 'Tax and fees require commercial review', binding: false });
  }
  function preview(value, objective) {
    const input = validate(value);
    const links = input.pages.map((page, i) => `<a href="#section-${i}">${escape(page)}</a>`).join('');
    const sections = input.pages.map((page, i) => `<section id="section-${i}"><h2>${escape(page)}</h2><p>Content awaiting review for ${escape(input.brand)}.</p></section>`).join('');
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'"><title>${escape(input.brand)} | Structure preview</title><style>*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;color:#172626;background:#f8faf9;font:16px/1.6 system-ui}header,main,footer{padding:24px;max-width:1100px;margin:auto}header{border-bottom:1px solid #cbd7d4;display:flex;justify-content:space-between;flex-wrap:wrap;gap:16px}nav{display:flex;gap:20px;flex-wrap:wrap}a{color:#165e51}h1{font-size:36px;line-height:1.2;overflow-wrap:anywhere}h2{font-size:22px}section{padding:28px 0;border-bottom:1px solid #cbd7d4}aside{padding:12px 24px;background:#faedc5;color:#51451d;font-size:13px}p{max-width:70ch;white-space:pre-wrap;overflow-wrap:anywhere}@media(max-width:480px){h1{font-size:28px}header,main,footer{padding:18px}}</style></head><body><aside>LOCAL STRUCTURE PREVIEW | Template-generated, not AI-researched. No checkout, account, message, or publication.</aside><header><strong>${escape(input.brand)}</strong><nav>${links}</nav></header><main><h1>${escape(input.brand)}</h1><p>${escape(objective)}</p>${sections}</main><footer>Draft for review. Original copy, imagery, integrations, accessibility testing, and publication approval remain required.</footer></body></html>`;
  }
  return Object.freeze({ VERSION: '1.0.0-local', PACKAGES, validate, quotation, preview, HANDOFF_KEY: 'mb-launch-hq-handoff-v1' });
});
