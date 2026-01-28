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
    const r = await fetch(url, {
      signal: ac.signal,
      headers: {
        'accept': 'application/json, text/plain, */*'
      }
    });
    if (!r.ok) return null;
    const txt = await r.text().catch(() => '');
    if (!txt) return null;
    // Некоторые API отвечают JSON-ом как text/plain — не доверяем content-type.
    return JSON.parse(txt);
  } catch (_) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function asList(j) {
  if (!j || typeof j !== 'object') return [];
  const r = (j.response && typeof j.response === 'object') ? j.response : j;
  if (Array.isArray(r)) return r;
  const keys = ['records', 'items', 'result', 'list', 'players', 'economy', 'bans', 'banList', 'staff', 'admins', 'users', 'data'];
  for (const k of keys) {
    const v = r[k];
    if (Array.isArray(v)) return v;
  }
  return [];
}

async function tryJsonCandidates(urls, timeoutMs = 12000) {
  for (const u of urls) {
    const j = await fetchJson(u, timeoutMs);
    if (!j) continue;
    return { url: u, json: j };
  }
  return null;
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
  // 1) Пытаемся забрать напрямую JSON (быстрее и надежнее)
  const base = new URL(CFG.deskBans).origin;
  const apiTry = await tryJsonCandidates([
    `${base}/api/bans?page=1`,
    `${base}/api/bans?offset=0&limit=200`,
    `${base}/api/banlist?page=1`,
    `${base}/api/punishments?page=1`,
    `${base}/api/v1/bans?page=1`,
    `${base}/api/v2/bans?page=1`
  ], 14000);
  if (apiTry) {
    const arr = asList(apiTry.json);
    const bans = arr.map(b => {
      const o = (b && typeof b === 'object') ? b : {};
      return {
        player: ns(o.player ?? o.nick ?? o.name ?? ''),
        reason: ns(o.reason ?? o.cause ?? o.text ?? ''),
        admin: ns(o.admin ?? o.banner ?? o.who ?? ''),
        date: ns(o.date ?? o.banTime ?? o.created_at ?? o.createdAt ?? ''),
        length: ns(o.length ?? o.banLength ?? o.time ?? o.duration ?? ''),
        status: ns(o.status ?? '')
      };
    }).filter(b => b.player || b.reason || b.admin);
    return { ok: true, bans, updated_at: now(), source: apiTry.url };
  }

  const page = await context.newPage();
  await page.goto(CFG.deskBans, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('table tbody tr', { timeout: 12000 }).catch(() => null);
  await page.waitForTimeout(800);

  const table = await bestTable(page);
  await page.close();
  if (!table) return { ok: true, bans: [], updated_at: now(), source: 'desk' };

  const idxPlayer = findIndex(table.headers, [/кого/, /игрок/, /player/, /ник/]);
  const idxReason = findIndex(table.headers, [/за что/, /причин/, /reason/]);
  const idxAdmin = findIndex(table.headers, [/кто/, /админ/, /admin/]);
  const idxDate = findIndex(table.headers, [/дата/, /date/]);
  const idxLen = findIndex(table.headers, [/срок/, /продолж/, /duration/, /length/]);
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
  // 1) Пытаемся забрать напрямую JSON (быстрее и надежнее)
  const base = new URL(CFG.deskEco).origin;
  const apiTry = await tryJsonCandidates([
    `${base}/api/economy?offset=0&limit=200`,
    `${base}/api/economy?limit=200`,
    `${base}/api/economy?page=1`,
    `${base}/api/economy/top?limit=200`,
    `${base}/api/rich?limit=200`,
    `${base}/api/money?limit=200`,
    `${base}/api/v1/economy?limit=200`,
    `${base}/api/v2/economy?limit=200`
  ], 14000);
  if (apiTry) {
    const arr = asList(apiTry.json);
    const players = arr.map(p => {
      const o = (p && typeof p === 'object') ? p : {};
      const name = ns(o.nickname ?? o.nick ?? o.name ?? o.player ?? '');
      const steamid = ns(o.steamid ?? o.steamId ?? o.steam ?? '');
      const moneyRaw = String(o.money ?? o.balance ?? o.cash ?? o.wallet ?? o.bank ?? 0);
      const money = Number(moneyRaw.replace(/[^\d.-]/g, '')) || 0;
      const playtime = ns(o.playtime ?? o.played ?? o.time ?? o.hours ?? '');
      return { nickname: name, name, steamid, playtime, time: playtime, money };
    }).filter(p => p.nickname || p.steamid);

    players.sort((a, b) => Number(b.money || 0) - Number(a.money || 0));
    const top3 = players.slice(0, 3);
    return { ok: true, players, top3, updated_at: now(), source: apiTry.url };
  }

  const page = await context.newPage();
  await page.goto(CFG.deskEco, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('table tbody tr', { timeout: 12000 }).catch(() => null);
  await page.waitForTimeout(800);

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
      // На оригинале часто нет отдельной колонки "Онлайн" — статус лежит в "последний заход" как "Сейчас в сети".
      const probe = onlineRaw || last_seen;
      const online = /(сейчас\s+в\s+сети|в\s+сети|онлайн|online|online\s+now|now\s+online|yes|true|\b1\b)/i.test(probe);
      return { name, role, playtime, last_seen, online };
    }).filter(x => x.name || x.role);

    if (staff.length) return { ok: true, staff, updated_at: now(), source: 'desk' };
  }

  return { ok: true, staff: [], updated_at: now(), source: 'desk' };
}

function parseRulesText(text) {
  const rawLines = String(text || '').split(/\r?\n/);

  // Версия (дата изменения)
  let version = '';
  for (const raw of rawLines) {
    const t = String(raw || '').trim();
    const m = t.match(/Дата изменения правил\s*:?\s*([0-9]{2}\.[0-9]{2}\.[0-9]{4})/i);
    if (m) { version = 'Дата изменения правил: ' + m[1]; break; }
  }

  const stopPhrases = [
    'перейти в раздел',
    'нажать',
    'image:',
    'таблица'
  ];

  const lines = rawLines
    .map(raw => {
      const s = String(raw ?? '');
      const m = s.match(/^\s*/);
      const indent = m ? m[0].length : 0;
      const t = s.trim();
      return { raw: s, t, indent };
    })
    .filter(x => x.t)
    .filter(x => {
      const ll = x.t.toLowerCase();
      return !stopPhrases.some(p => ll.includes(p));
    });

  const isSection = (x) => {
    // Заголовки разделов: "1. ...", "2. ..." (обычно с небольшим отступом)
    if (x.indent > 4) return false;
    const m = x.t.match(/^([0-9]{1,2})\.\s+(.+)$/);
    if (!m) return false;
    if (/^\d+\.\s+\d+\./.test(x.t)) return false;
    return true;
  };

  const secIdx = [];
  for (let i = 0; i < lines.length; i++) if (isSection(lines[i])) secIdx.push(i);

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
  const addSection = (titleLine, slice) => {
    const id = 'sec-' + (sections.length + 1);
    const m = titleLine.match(/^([0-9]{1,2})\./);
    const secNo = m ? m[1] : '';

    // базовый отступ для пунктов (чтобы определить уровни вложенности)
    const numbered = slice.filter(x => /^\d+\./.test(x.t));
    const baseIndent = numbered.length ? Math.min(...numbered.map(x => x.indent)) : 0;
    const step = 2; // на сайте отступы чаще всего кратны 2

    const roots = [];
    const stack = []; // { level, node }
    let nums = []; // текущая цепочка номеров внутри раздела
    let lastNode = null;

    const pushNode = (level, node) => {
      while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
      const parent = stack.length ? stack[stack.length - 1].node : null;
      if (parent) {
        parent.children = parent.children || [];
        parent.children.push(node);
      } else {
        roots.push(node);
      }
      stack.push({ level, node });
      lastNode = node;
    };

    for (const x of slice) {
      const t = x.t;
      if (!t) continue;
      if (/^Раздел\s*:/i.test(t)) continue;
      if (/^Правила сервера/i.test(t)) continue;

      // Заголовок внутри раздела (иногда попадается)
      if (isSection(x)) continue;

      // Абсолютный код вида 3.13 / 1.2.3
      const abs = t.match(/^((?:\d+\.)+\d+)\.?\s*(.+)$/);
      const rel = t.match(/^(\d+)\.\s*(.+)$/);

      if (abs) {
        const code = abs[1].replace(/\.$/, '');
        const text = ns(abs[2]);
        const node = prune({ code, text, children: [] });
        // По коду пытаемся определить уровень (кол-во точек)
        const level = Math.max(0, code.split('.').length - 2);
        pushNode(level, node);
        continue;
      }

      if (rel) {
        const n = rel[1];
        const text = ns(rel[2]);
        const level = Math.max(0, Math.round((x.indent - baseIndent) / step));
        nums = nums.slice(0, level);
        nums[level] = n;
        const code = secNo ? [secNo, ...nums].join('.') : nums.join('.');
        const node = { code, text, children: [] };
        pushNode(level, prune(node));
        continue;
      }

      // продолжение предыдущего пункта
      if (lastNode) {
        lastNode.text = ns(lastNode.text + '\n' + t);
      } else {
        roots.push({ text: ns(t) });
      }
    }

    sections.push({ id, title: ns(titleLine), items: roots.map(prune) });
  };

  if (secIdx.length) {
    for (let i = 0; i < secIdx.length; i++) {
      const a = secIdx[i];
      const b = (i + 1 < secIdx.length) ? secIdx[i + 1] : lines.length;
      const titleLine = lines[a].t;
      const slice = lines.slice(a + 1, b);
      addSection(titleLine, slice);
    }
  } else {
    addSection('Правила', lines);
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
