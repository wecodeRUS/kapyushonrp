import { chromium } from 'playwright';
const CFG = {
  pushUrl: process.env.PUSH_URL || 'https://kapyushonrp.online/api/push.php',
  pushKey: process.env.PUSH_KEY || 'CHANGE_ME',
  serverId: '10809858',
  serverIp: '212.22.85.145',
  serverPort: 27015,
  gmPage: 'https://gamemonitoring.ru/garrys-mod/servers/10809858',
  deskBans: 'https://desk.famerp.ru/bans/?page=1',
  deskEco: 'https://desk.famerp.ru/economy/',
  rulesUrl: 'https://famerp.ru/'
};

const now = () => Math.floor(Date.now() / 1000);
const ns = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const lower = (s) => ns(s).toLowerCase();

async function fetchJson(url, timeoutMs = 12000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: { 'accept': 'application/json,*/*' } });
    if (!r.ok) return null;
    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return null;
    return await r.json().catch(() => null);
  } catch (_) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function push(payload) {
  if (!CFG.pushUrl) throw new Error('PUSH_URL is not set');
  const u = CFG.pushUrl + (CFG.pushUrl.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(CFG.pushKey);
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 20000);
  try {
    const r = await fetch(u, {
      method: 'POST',
      signal: ac.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const txt = await r.text().catch(() => '');
    if (!r.ok) throw new Error('push failed ' + r.status + ' ' + txt);
  } finally {
    clearTimeout(t);
  }
}

function findIndex(headers, patterns) {
  const h = headers.map(x => lower(x));
  for (let i = 0; i < h.length; i++) {
    const v = h[i];
    for (const p of patterns) {
      if (p instanceof RegExp) {
        if (p.test(v)) return i;
      } else {
        if (v.includes(String(p).toLowerCase())) return i;
      }
    }
  }
  return -1;
}

async function bestTable(page) {
  return await page.evaluate(() => {
    const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
    const tables = Array.from(document.querySelectorAll('table'));
    let best = null;
    for (const t of tables) {
      const headers = Array.from(t.querySelectorAll('thead th')).map(th => norm(th.textContent));
      const rows = Array.from(t.querySelectorAll('tbody tr')).map(tr =>
        Array.from(tr.querySelectorAll('td')).map(td => norm(td.textContent))
      ).filter(r => r.some(x => x));
      const score = rows.length;
      if (!headers.length || score === 0) continue;
      if (!best || score > best.score) best = { headers, rows, score };
    }
    return best ? { headers: best.headers, rows: best.rows } : null;
  });
}

async function gmServerViaApi() {
  const urls = [
    `https://api.gamemonitoring.net/servers/${CFG.serverId}`,
    `https://api.gamemonitoring.ru/servers/${CFG.serverId}`
  ];
  for (const u of urls) {
    const j = await fetchJson(u, 12000);
    if (!j) continue;
    const r = (j.response && typeof j.response === 'object') ? j.response : j;
    const connect = r.connect || (r.ip && r.port ? `${r.ip}:${r.port}` : '') || r.address || '';
    return {
      ok: true,
      name: ns(r.name || ''),
      online: Number(r.numplayers ?? r.online ?? 0) || 0,
      max: Number(r.maxplayers ?? r.max ?? 0) || 0,
      map: ns(r.map || ''),
      connect: connect || `${CFG.serverIp}:${CFG.serverPort}`,
      last_update: r.last_update ?? r.updated ?? null,
      updated_at: now()
    };
  }
  return {
    ok: true,
    name: 'КапюшонRP',
    online: 0,
    max: 0,
    map: '',
    connect: `${CFG.serverIp}:${CFG.serverPort}`,
    last_update: null,
    updated_at: now()
  };
}

async function gmPlayersViaApi() {
  const urls = [
    `https://api.gamemonitoring.net/servers/${CFG.serverId}/players?limit=200`,
    `https://api.gamemonitoring.ru/servers/${CFG.serverId}/players?limit=200`
  ];
  for (const u of urls) {
    const j = await fetchJson(u, 12000);
    if (!j) continue;
    const r = (j.response && typeof j.response === 'object') ? j.response : j;
    const arr = Array.isArray(r.players) ? r.players : Array.isArray(r) ? r : null;
    if (!arr) continue;
    const players = arr.map(p => {
      if (p && typeof p === 'object') {
        return {
          name: ns(p.name || p.nickname || p.player || ''),
          score: p.score ?? p.frags ?? null,
          time: p.time ?? p.time_played ?? null
        };
      }
      return { name: ns(p) };
    }).filter(x => x.name);
    return { ok: true, players, updated_at: now(), source: 'gamemonitoring' };
  }
  return null;
}

async function gmPlayersViaPage(context) {
  const page = await context.newPage();
  await page.goto(CFG.gmPage, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1200);

  const table = await bestTable(page);
  let players = [];
  if (table) {
    const idx = findIndex(table.headers, [/игрок/, /player/, /nickname/, /ник/]);
    const col = idx >= 0 ? idx : 1;
    players = table.rows.map(r => ({ name: ns(r[col] || '') })).filter(p => p.name && p.name !== '#');
  }

  await page.close();
  return { ok: true, players, updated_at: now(), source: 'gamemonitoring' };
}

async function scrapeBans(context) {
  const page = await context.newPage();
  await page.goto(CFG.deskBans, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1200);

  const table = await bestTable(page);
  await page.close();
  if (!table) return { ok: true, bans: [], updated_at: now(), source: 'desk' };

  const idxPlayer = findIndex(table.headers, [/кого/, /игрок/, /player/, /ник/]);
  const idxReason = findIndex(table.headers, [/за что/, /причин/, /reason/]);
  const idxAdmin = findIndex(table.headers, [/кто/, /админ/, /admin/]);
  const idxDate = findIndex(table.headers, [/дата/, /date/]);
  const idxLen = findIndex(table.headers, [/срок/, /duration/, /length/]);
  const idxStatus = findIndex(table.headers, [/статус/, /status/]);

  const bans = table.rows.map(r => ({
    player: ns(r[idxPlayer] ?? ''),
    reason: ns(r[idxReason] ?? ''),
    admin: ns(r[idxAdmin] ?? ''),
    date: ns(r[idxDate] ?? ''),
    length: ns(r[idxLen] ?? ''),
    status: idxStatus >= 0 ? ns(r[idxStatus] ?? '') : ''
  })).filter(b => b.player || b.reason || b.admin);

  return { ok: true, bans, updated_at: now(), source: 'desk' };
}

async function scrapeEconomy(context) {
  const page = await context.newPage();
  await page.goto(CFG.deskEco, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1200);

  const table = await bestTable(page);
  await page.close();
  if (!table) return { ok: true, players: [], top3: [], updated_at: now(), source: 'desk' };

  const idxName = findIndex(table.headers, [/игрок/, /player/, /ник/]);
  const idxSteam = findIndex(table.headers, [/steam/, /steamid/]);
  const idxMoney = findIndex(table.headers, [/деньг/, /баланс/, /money/, /balance/]);
  const idxTime = findIndex(table.headers, [/время/, /наигран/, /time/, /played/]);

  const players = table.rows.map(r => {
    const moneyRaw = ns(r[idxMoney] ?? '0');
    const money = Number(moneyRaw.replace(/[^\d.-]/g, '')) || 0;
    return {
      nickname: ns(r[idxName] ?? ''),
      name: ns(r[idxName] ?? ''),
      steamid: ns(r[idxSteam] ?? ''),
      playtime: ns(r[idxTime] ?? ''),
      time: ns(r[idxTime] ?? ''),
      money
    };
  }).filter(p => p.nickname || p.steamid);

  players.sort((a, b) => Number(b.money || 0) - Number(a.money || 0));
  const top3 = players.slice(0, 3);

  return { ok: true, players, top3, updated_at: now(), source: 'desk' };
}

async function discoverStaffUrl(page) {
  try {
    const href = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'))
        .map(a => ({
          t: (a.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase(),
          h: a.getAttribute('href') || ''
        }))
        .filter(x => x.h);
      const keys = ['персонал', 'staff', 'админ', 'administr', 'команда', 'состав'];
      for (const k of keys) {
        const f = links.find(x => x.t.includes(k) || x.h.toLowerCase().includes(k));
        if (f) return f.h;
      }
      return '';
    });
    if (!href) return '';
    if (href.startsWith('http')) return href;
    const base = new URL(page.url());
    return new URL(href, base).toString();
  } catch (_) {
    return '';
  }
}

async function scrapeStaff(context) {
  const candidates = [
    'https://desk.famerp.ru/staff/',
    'https://desk.famerp.ru/admins/',
    'https://desk.famerp.ru/team/',
    'https://desk.famerp.ru/users/',
    'https://desk.famerp.ru/'
  ];

  for (const url of candidates) {
    const page = await context.newPage();
    const ok = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).then(() => true).catch(() => false);
    if (!ok) {
      await page.close();
      continue;
    }
    await page.waitForTimeout(1200);
    let staffUrl = await discoverStaffUrl(page);
    if (staffUrl && staffUrl !== page.url()) {
      await page.goto(staffUrl, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => null);
      await page.waitForTimeout(900);
    }

    const table = await bestTable(page);
    await page.close();
    if (!table) continue;

    const idxName = findIndex(table.headers, [/имя/, /ник/, /игрок/, /player/]);
    const idxRole = findIndex(table.headers, [/должн/, /роль/, /ранг/, /role/, /rank/]);
    const idxTime = findIndex(table.headers, [/наигран/, /время/, /time/, /played/]);
    const idxLast = findIndex(table.headers, [/послед/, /last/, /seen/, /заход/]);
    const idxOnline = findIndex(table.headers, [/онлайн/, /online/, /в сети/]);

    const staff = table.rows.map(r => {
      const name = ns(r[idxName] ?? '');
      const role = ns(r[idxRole] ?? '');
      const playtime = ns(r[idxTime] ?? '');
      const last_seen = ns(r[idxLast] ?? '');
      const onlineRaw = idxOnline >= 0 ? ns(r[idxOnline] ?? '') : '';
      const online = /онлайн|online|в сети|yes|true|1/i.test(onlineRaw);
      return { name, role, playtime, last_seen, online };
    }).filter(x => x.name || x.role);

    if (staff.length) return { ok: true, staff, updated_at: now(), source: 'desk' };
  }

  return { ok: true, staff: [], updated_at: now(), source: 'desk' };
}

function parseRulesText(text) {
  const lines = String(text || '').split(/\r?\n/).map(s => ns(s)).filter(Boolean);

  let version = '';
  for (const l of lines) {
    const m = l.match(/Дата изменения правил\s*:?\s*([0-9]{2}\.[0-9]{2}\.[0-9]{4})/i);
    if (m) { version = 'Дата изменения правил: ' + m[1]; break; }
  }

  const stopPhrases = [
    'перейти в раздел',
    'нажать',
    'image:',
    'таблица'
  ];

  const clean = lines.filter(l => {
    const ll = lower(l);
    if (stopPhrases.some(p => ll.includes(p))) return false;
    return true;
  });

  const isTop = (l) => {
    const m = l.match(/^([0-9]{1,2})\.\s+(.+)$/);
    if (!m) return false;
    if (/^\d+\.\s+\d+\./.test(l)) return false;
    return true;
  };

  const topIdx = [];
  for (let i = 0; i < clean.length; i++) if (isTop(clean[i])) topIdx.push(i);

  const prune = (n) => {
    if (n.children && n.children.length) {
      n.children = n.children.map(prune).filter(Boolean);
      if (!n.children.length) delete n.children;
    } else {
      delete n.children;
    }
    if (!n.code) delete n.code;
    return n;
  };

  const sections = [];
  const addSection = (title, slice) => {
    const id = 'sec-' + (sections.length + 1);
    const itemsRaw = [];

    for (const line of slice) {
      if (!line) continue;
      if (/^Раздел\s*:/i.test(line)) continue;
      if (/^Правила сервера/i.test(line)) continue;

      let code = '';
      let text = line;

      const m1 = line.match(/^\d+\.\s+(\d+(?:\.\d+)+)\.?\s*(?:\|\s*)?(.+)$/);
      const m2 = line.match(/^(\d+(?:\.\d+)+)\.?\s*(?:\|\s*)?(.+)$/);
      const m3 = line.match(/^([0-9]{1,2})\.\s+(.+)$/);

      if (m1) { code = m1[1]; text = m1[2]; }
      else if (m2) { code = m2[1]; text = m2[2]; }
      else if (m3 && !/^\d+\.\s+\d+\./.test(line)) { code = m3[1]; text = m3[2]; }

      itemsRaw.push({ code: ns(code), text: ns(text) });
    }

    const keyMap = new Map();
    const codeMap = new Map();
    const roots = [];
    const childKeys = new Set();

    const ensure = (it) => {
      const key = it.code ? 'c:' + it.code : 'p:' + it.text;
      if (keyMap.has(key)) return keyMap.get(key);
      const node = { code: it.code || '', text: it.text || '', children: [] };
      keyMap.set(key, node);
      if (it.code) codeMap.set(it.code, node);
      return node;
    };

    for (const it of itemsRaw) {
      if (!it.text) continue;
      const node = ensure(it);

      if (!it.code) {
        roots.push(node);
        continue;
      }

      const parts = it.code.split('.').filter(Boolean);
      const parentCode = parts.length > 1 ? parts.slice(0, -1).join('.') : '';
      if (!parentCode) {
        roots.push(node);
        continue;
      }

      const parent = codeMap.get(parentCode);
      if (parent) {
        parent.children.push(node);
        childKeys.add('c:' + it.code);
      } else {
        roots.push(node);
      }
    }

    const uniqRoots = [];
    const seen = new Set();
    for (const r of roots) {
      const key = (r.code ? 'c:' + r.code : 'p:' + r.text);
      if (childKeys.has(key)) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      uniqRoots.push(prune(r));
    }

    sections.push({ id, title, items: uniqRoots });
  };

  if (topIdx.length) {
    for (let i = 0; i < topIdx.length; i++) {
      const a = topIdx[i];
      const b = (i + 1 < topIdx.length) ? topIdx[i + 1] : clean.length;
      const title = clean[a];
      const slice = clean.slice(a + 1, b);
      addSection(title, slice);
    }
  } else {
    addSection('Правила', clean);
  }

  return { ok: true, version: version || '-', sections, updated_at: now(), source: CFG.rulesUrl };
}

async function scrapeRules(context) {
  const page = await context.newPage();
  await page.goto(CFG.rulesUrl, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1200);
  const text = await page.evaluate(() => document.body ? document.body.innerText : '');
  await page.close();
  return parseRulesText(text);
}

async function main() {
  const server = await gmServerViaApi();

  let players = await gmPlayersViaApi();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: 'ru-RU' });

  if (!players) players = await gmPlayersViaPage(context);

  const bans = await scrapeBans(context);
  const economy = await scrapeEconomy(context);
  const staff = await scrapeStaff(context);
  const rules = await scrapeRules(context);

  await browser.close();

  const payload = {
    server,
    players,
    staff,
    bans,
    economy,
    rules
  };

  await push(payload);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
