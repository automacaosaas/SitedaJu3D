// Tiny Chrome DevTools Protocol driver (no dependencies). Node >= 22 (global WebSocket/fetch).
const {spawn} = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// o Chrome do PC do Luiz; em outra máquina, CHROME=<caminho do Chrome ou Chromium> (como root, ele roda sem o sandbox)
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function withBrowser(fn, {port = 9333, webgl = false} = {}) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-'));
  const proc = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', ...(webgl ? (process.env.RENDER_GPU ? ['--use-angle=' + process.env.RENDER_GPU, '--ignore-gpu-blocklist', '--enable-gpu-rasterization'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']) : ['--disable-gpu']), '--hide-scrollbars',
    '--force-device-scale-factor=1', '--disable-features=Translate', ...(process.getuid?.() === 0 ? ['--no-sandbox'] : []), 'about:blank'
  ], {stdio: 'ignore'});
  try {
    let version;
    for (let i = 0; i < 60; i++) {
      try { version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break; } catch { await sleep(250); }
    }
    if (!version) throw new Error('Chrome did not start');
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = targets.find(t => t.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    let id = 0; const pending = new Map(); const listeners = new Map(); const consoleLog = [];
    ws.onmessage = event => {
      const msg = JSON.parse(event.data);
      if (msg.id && pending.has(msg.id)) { const {resolve, reject} = pending.get(msg.id); pending.delete(msg.id); msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result); }
      else if (msg.method) {
        if (msg.method === 'Runtime.consoleAPICalled') consoleLog.push(`${msg.params.type}: ${msg.params.args.map(a => a.value ?? a.description).join(' ')}`);
        if (msg.method === 'Runtime.exceptionThrown') consoleLog.push(`exception: ${msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text}`);
        (listeners.get(msg.method) || []).forEach(cb => cb(msg.params));
      }
    };
    const send = (method, params = {}) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, {resolve, reject}); ws.send(JSON.stringify({id: i, method, params})); });
    const once = method => new Promise(resolve => { const list = listeners.get(method) || []; const cb = p => { listeners.set(method, (listeners.get(method) || []).filter(x => x !== cb)); resolve(p); }; list.push(cb); listeners.set(method, list); });
    await send('Page.enable'); await send('Runtime.enable');
    const api = {
      send, consoleLog,
      async viewport(width, height, {mobile = false, dpr = 1} = {}) {
        await send('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: dpr, mobile});
        if (mobile) await send('Emulation.setTouchEmulationEnabled', {enabled: true, maxTouchPoints: 5});
      },
      async goto(url, {wait = 700} = {}) {
        // Fragment-only changes fire navigatedWithinDocument instead of load; a fresh load is cleaner for tests.
        await send('Page.navigate', {url: 'about:blank'});
        await sleep(60);
        const loaded = Promise.race([once('Page.loadEventFired'), sleep(12000)]);
        await send('Page.navigate', {url});
        await loaded;
        await sleep(wait);
      },
      async eval(expression) {
        const r = await send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true});
        if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
        return r.result.value;
      },
      async shot(file, {fullPage = false, clip} = {}) {
        const params = {format: 'png'};
        if (clip) params.clip = {...clip, scale: 1};
        if (fullPage) { params.captureBeyondViewport = true; }
        const {data} = await send('Page.captureScreenshot', params);
        fs.writeFileSync(file, Buffer.from(data, 'base64'));
        return file;
      },
      async click(selector) {
        const box = await api.eval(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; e.scrollIntoView({block:'center'}); const b = e.getBoundingClientRect(); return {x: b.x + b.width / 2, y: b.y + b.height / 2}; })()`);
        if (!box) throw new Error('not found: ' + selector);
        await send('Input.dispatchMouseEvent', {type: 'mouseMoved', x: box.x, y: box.y});
        await send('Input.dispatchMouseEvent', {type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1});
        await send('Input.dispatchMouseEvent', {type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1});
      },
      async key(key, code = key) {
        const vk = {ArrowDown: 40, ArrowUp: 38, Escape: 27, Enter: 13, Tab: 9, Home: 36, End: 35, ' ': 32}[key] || 0;
        const text = key === 'Enter' ? '\r' : key === ' ' ? ' ' : undefined;
        await send('Input.dispatchKeyEvent', {type: text ? 'keyDown' : 'rawKeyDown', key, code, windowsVirtualKeyCode: vk, text});
        await send('Input.dispatchKeyEvent', {type: 'keyUp', key, code, windowsVirtualKeyCode: vk});
      },
      sleep
    };
    return await fn(api);
  } finally {
    proc.kill();
    await sleep(300);
    try { fs.rmSync(profile, {recursive: true, force: true}); } catch {}
  }
}
module.exports = {withBrowser, sleep};
