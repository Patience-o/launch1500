#!/usr/bin/env node
/*
 * Builds dist/ — the files the public site needs and nothing else — and writes dist/_headers
 * (Cloudflare) with a strict Content-Security-Policy: every page's inline script is allowed by its
 * SHA-256 hash, so no 'unsafe-inline' is needed for scripts.
 *
 *   node tools/build.js            Cloudflare build (real 404 page)
 *   node tools/build.js --surge    same, plus 200.html (surge's fallback page)
 *
 * Re-run after ANY change to an HTML page, script or stylesheet: hashes are of the exact bytes.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'dist');
const forSurge = process.argv.indexOf('--surge') !== -1;

/* Public address of the site. Leave empty until the domain is live: when set, every page gets a
   rel=canonical link and robots.txt advertises the sitemap-less canonical host. */
const CANONICAL_ORIGIN = '';

/* Browser origins the pages may call with fetch(): the concierge Worker (workers.dev now, api.<domain> later) */
const CONNECT = [
  'https://launch1500-concierge.launch1500-concierge-worker.workers.dev'
];

/* Hosts such as surge cannot send security headers, so every page also carries the policy itself
   (a CSP <meta>, a referrer <meta>) and loads this guard first: HTTPS only, never inside a foreign frame. */
const GUARD_FILE = 'site-guard.js';
const GUARD_SOURCE = [
  '/* Launch1500 site guard: HTTPS only, and never inside someone else\'s frame (clickjacking). */',
  '(function () {',
  "  'use strict';",
  "  var local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';",
  "  if (location.protocol === 'http:' && !local) {",
  "    location.replace('https://' + location.host + location.pathname + location.search + location.hash);",
  '    return;',
  '  }',
  '  if (window.top !== window.self) {',
  "    document.documentElement.style.display = 'none';",
  '    try { window.top.location = window.self.location.href; } catch (e) { /* sandboxed frame: stay hidden */ }',
  '  }',
  '})();',
  ''
].join('\n');

const FILES = ['index.html', 'polish.css', 'assistant.css', 'assistant.js', 'assistant-core.js', 'local-links.js', '_redirects'];
const DIRS = ['demos', 'start', 'assets'];
/* Only these kinds of files are ever published (working notes, sources and configs never are) */
const PUBLISH_EXT = ['.html', '.css', '.js', '.webp', '.png', '.jpg', '.jpeg', '.svg', '.ico', '.txt', '.woff2'];
/* Source artwork that the pages no longer load (WebP copies are served instead) */
const UNUSED_ASSETS = ['launch1500_master_banner.png'];

function skip(file) {
  const base = path.basename(file);
  if (base === '_redirects') return false;
  if (base.charAt(0) === '.') return true;
  if (UNUSED_ASSETS.indexOf(base) !== -1) return true;
  const ext = path.extname(base).toLowerCase();
  if (PUBLISH_EXT.indexOf(ext) === -1) return true;
  if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') {
    /* skip a raster original when a .webp sibling exists (…-ar.jpg/.png → …-ar.webp) */
    const webp = path.join(path.dirname(file), base.slice(0, -ext.length) + '.webp');
    if (fs.existsSync(webp)) return true;
  }
  return false;
}

function copy(from, to) {
  const stat = fs.statSync(from);
  if (stat.isDirectory()) {
    if (path.basename(from).charAt(0) === '.') return;
    for (const name of fs.readdirSync(from)) copy(path.join(from, name), path.join(to, name));
  } else if (!skip(from)) {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }
}

function walk(dir, visit) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, visit); else visit(p);
  }
}

function sha256(data, encoding) {
  return crypto.createHash('sha256').update(data).digest(encoding);
}

function inlineScriptHashes(html) {
  const hashes = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html))) {
    const attrs = match[1];
    if (/\bsrc\s*=/.test(attrs)) continue;
    const type = (/\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs) || [])[1];
    if (type && !/^(text\/javascript|application\/javascript|module)$/i.test(type)) continue; /* data blocks never execute */
    hashes.push("'sha256-" + sha256(Buffer.from(match[2], 'utf8'), 'base64') + "'");
  }
  return hashes;
}

/* assistant.js → assistant.js?v=<content hash>, so scripts and styles can be cached forever and a
   page can never run yesterday's script against today's markup or policy. */
function versionLocalAssets(html, pageFile) {
  function stamp(whole, before, url, after) {
    if (/^([a-z][a-z0-9+.-]*:)?\/\//i.test(url) || /[?#]/.test(url)) return whole;
    const target = url.charAt(0) === '/' ? path.join(out, url) : path.resolve(path.dirname(pageFile), url);
    if (target.indexOf(out) !== 0 || !fs.existsSync(target)) return whole;
    return before + url + '?v=' + sha256(fs.readFileSync(target), 'hex').slice(0, 10) + after;
  }
  return html
    .replace(/(<script\b[^>]*\bsrc=")([^"]+\.js)(")/gi, stamp)
    .replace(/(<link\b[^>]*\bhref=")([^"]+\.css)(")/gi, stamp);
}

const NOT_FOUND = [
  '<!DOCTYPE html>',
  '<html lang="en">',
  '<head>',
  '<meta charset="UTF-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1">',
  '<meta name="robots" content="noindex">',
  '<title>Page not found | Launch1500</title>',
  '<style>',
  'body{margin:0;min-height:100vh;display:grid;place-items:center;background:#FAF8F5;color:#0E1826;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;text-align:center;padding:24px}',
  'h1{font-family:Georgia,serif;font-weight:500;font-size:34px;margin:0 0 10px}',
  'p{color:#64748B;margin:0 0 22px;line-height:1.7}',
  'a{display:inline-block;padding:12px 22px;border-radius:999px;background:#0E1826;color:#fff;text-decoration:none;font-weight:600}',
  '</style>',
  '</head>',
  '<body>',
  '<main>',
  '<h1>Page not found</h1>',
  '<p>This page does not exist. <span dir="rtl" lang="ar">هذه الصفحة غير موجودة.</span></p>',
  '<a href="/">Back to Launch1500</a>',
  '</main>',
  '</body>',
  '</html>',
  ''
].join('\n');

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const file of FILES) copy(path.join(root, file), path.join(out, file));
for (const dir of DIRS) copy(path.join(root, dir), path.join(out, dir));
fs.writeFileSync(path.join(out, '404.html'), NOT_FOUND);
fs.writeFileSync(path.join(out, 'robots.txt'), 'User-agent: *\nAllow: /\n');
fs.writeFileSync(path.join(out, GUARD_FILE), GUARD_SOURCE);

const pages = [];
walk(out, (file) => { if (path.extname(file).toLowerCase() === '.html') pages.push(file); });

/* Inline script contents never change below, so their hashes can be collected first */
const hashes = [];
for (const page of pages) {
  for (const hash of inlineScriptHashes(fs.readFileSync(page, 'utf8'))) if (hashes.indexOf(hash) === -1) hashes.push(hash);
}

const directives = [
  "default-src 'self'",
  "script-src 'self'" + (hashes.length ? ' ' + hashes.join(' ') : ''),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self' " + CONNECT.join(' '),
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  'upgrade-insecure-requests'
];
/* frame-ancestors is only honoured in a real header; in the <meta> copy the guard script covers framing */
const csp = directives.slice(0, 6).concat(["frame-ancestors 'none'"], directives.slice(6)).join('; ');
const cspMeta = directives.join('; ');

function injectHead(html, pageFile) {
  const up = path.relative(path.dirname(pageFile), out).split(path.sep).join('/');
  /* the 404 page is served at any unknown path, so it must load the guard by an absolute URL */
  const prefix = path.basename(pageFile) === '404.html' ? '/' : (up ? up + '/' : '');
  const tags = '\n<meta http-equiv="Content-Security-Policy" content="' + cspMeta + '">' +
    '\n<meta name="referrer" content="strict-origin-when-cross-origin">' +
    '\n<script src="' + prefix + GUARD_FILE + '"></script>';
  if (/<meta\s+charset=[^>]*>/i.test(html)) return html.replace(/<meta\s+charset=[^>]*>/i, (tag) => tag + tags);
  return html.replace(/<head[^>]*>/i, (tag) => tag + tags);
}

for (const page of pages) {
  let html = versionLocalAssets(injectHead(fs.readFileSync(page, 'utf8'), page), page);
  if (CANONICAL_ORIGIN && path.basename(page) !== '404.html') {
    const rel = '/' + path.relative(out, page).split(path.sep).join('/').replace(/(^|\/)index\.html$/, '$1');
    html = html.replace(/<\/head>/i, '<link rel="canonical" href="' + CANONICAL_ORIGIN + rel + '">\n</head>');
  }
  fs.writeFileSync(page, html);
}
/* No 200.html on purpose: both surge and Cloudflare then answer unknown paths with 404.html and a
   real 404 status, instead of a copy of the home page whose relative script paths would break. */

const cspLine = '  Content-Security-Policy: ' + csp;
if (cspLine.length > 2000) {
  console.error('ERROR: the CSP header line is ' + cspLine.length + ' characters; Cloudflare ignores _headers lines over 2000.');
  process.exit(1);
}

const headers = [
  '# Generated by tools/build.js — do not edit by hand.',
  '/*',
  cspLine,
  '  Strict-Transport-Security: max-age=31536000; includeSubDomains',
  '  X-Content-Type-Options: nosniff',
  '  X-Frame-Options: DENY',
  '  Referrer-Policy: strict-origin-when-cross-origin',
  '  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
  '  Cross-Origin-Opener-Policy: same-origin-allow-popups',
  '',
  '# Pages reference scripts and styles by content hash (?v=…), so those can be cached forever.',
  '/*.js',
  '  Cache-Control: public, max-age=31536000, immutable',
  '/*.css',
  '  Cache-Control: public, max-age=31536000, immutable',
  '# Images are versioned by file name.',
  '/assets/*',
  '  Cache-Control: public, max-age=2592000, stale-while-revalidate=86400',
  ''
].join('\n');
fs.writeFileSync(path.join(out, '_headers'), headers);

fs.mkdirSync(path.join(out, '.well-known'), { recursive: true });
fs.writeFileSync(path.join(out, '.well-known', 'security.txt'), [
  'Contact: https://wa.me/971503923733',
  'Preferred-Languages: en, ar',
  'Canonical: https://launch1500.surge.sh/.well-known/security.txt',
  'Expires: 2027-09-30T00:00:00.000Z',
  ''
].join('\n'));

let bytes = 0, count = 0;
walk(out, (file) => { bytes += fs.statSync(file).size; count += 1; });
console.log('dist/: ' + count + ' files, ' + (bytes / 1024 / 1024).toFixed(2) + ' MB' + (forSurge ? ' (surge build)' : ''));
console.log('pages: ' + pages.length + ', inline script hashes: ' + hashes.length + ', CSP line: ' + cspLine.length + ' chars');
