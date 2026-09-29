const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const server = require('./server.js');

const cloudflaredBin = fs.existsSync('/opt/homebrew/bin/cloudflared')
  ? '/opt/homebrew/bin/cloudflared'
  : 'cloudflared';

let currentTunnel = null;
let reconnectTimer = null;
let shuttingDown = false;

function startTunnel(port) {
  if (shuttingDown) return;
  console.log(`[Launch1500] Starting Cloudflare tunnel for port ${port}...`);
  let liveUrl = null;

  currentTunnel = spawn(cloudflaredBin, ['tunnel', '--url', `http://127.0.0.1:${port}`]);

  function handleData(chunk) {
    const text = chunk.toString();
    process.stdout.write(text);

    const match = text.match(/https:\/\/[a-zA-Z0-9.-]+\.trycloudflare\.com/);
    if (match && !liveUrl) {
      liveUrl = match[0];
      const urlFile = path.join(__dirname, 'live_url.txt');
      try {
        fs.writeFileSync(urlFile, liveUrl + '\n', 'utf8');
      } catch (err) {
        console.error('[Launch1500] Failed to write live_url.txt:', err.message);
      }
      console.log('\n======================================================');
      console.log('  LAUNCH1500 INDEPENDENT WEBSITE IS LIVE ONLINE!');
      console.log(`  Public URL: ${liveUrl}`);
      console.log('  Policy: NEVER OFF · Auto-reconnecting enabled');
      console.log('======================================================\n');
    }
  }

  currentTunnel.stdout.on('data', handleData);
  currentTunnel.stderr.on('data', handleData);

  currentTunnel.on('close', (code) => {
    currentTunnel = null;
    if (shuttingDown) return;
    console.log(`[Launch1500] Cloudflare tunnel closed (code ${code}). Auto-reconnecting in 3s to stay live...`);
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => startTunnel(port), 3000);
  });

  currentTunnel.on('error', (err) => {
    console.error(`[Launch1500] Cloudflare tunnel spawn error:`, err.message);
    if (shuttingDown) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => startTunnel(port), 3000);
  });
}

setTimeout(() => {
  const addr = server.address();
  const port = addr ? addr.port : 8085;
  console.log(`[Launch1500] Local server active on port ${port}.`);
  startTunnel(port);

  // Healthcheck: probe local server every 20s to ensure responsiveness
  setInterval(() => {
    if (shuttingDown) return;
    const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
      res.resume();
    });
    req.on('error', (err) => {
      console.warn(`[Launch1500 Watchdog] Local ping issue: ${err.message}`);
    });
    req.setTimeout(5000, () => req.destroy());
  }, 20000);
}, 200);

function cleanupAndExit() {
  shuttingDown = true;
  clearTimeout(reconnectTimer);
  console.log('[Launch1500] Graceful shutdown received.');
  if (currentTunnel) {
    try { currentTunnel.kill('SIGTERM'); } catch (e) {}
  }
  try { server.close(); } catch (e) {}
  process.exit(0);
}

process.on('SIGINT', cleanupAndExit);
process.on('SIGTERM', cleanupAndExit);
