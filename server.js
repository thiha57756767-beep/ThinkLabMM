'use strict';
/* ThinkLab Story Studio — server (zero-dependency Node.js)
   - Username/password accounts + device binding (AVT-style, NO credits)
   - Owner (first account) gets an admin panel
   - AI via Google Gemini, key from Replit Secret GEMINI_API_KEY
     (or a key the owner saves in Settings). Key never reaches the browser.
*/
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const MEDIA = path.join(DATA, 'media');
for (const d of [DATA, MEDIA]) fs.mkdirSync(d, { recursive: true });

/* ---------------- tiny JSON store ---------------- */
function readJson(name, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(DATA, name), 'utf8')); }
  catch { return fallback; }
}
function writeJson(name, value) {
  const tmp = path.join(DATA, name + '.tmp');
  fs.writeFileSync(tmp, JSON.stringify(value, null, 1));
  fs.renameSync(tmp, path.join(DATA, name));
}
let users = readJson('users.json', []);          // {id, username, passHash, salt, role, disabled, deviceFingerprint, createdAt}
let sessions = readJson('sessions.json', {});    // token -> {userId, createdAt}
let projects = readJson('projects.json', []);    // {id, userId, kind, title, draft, updatedAt}
let mediaItems = readJson('media.json', []);     // {id, userId, file, sceneNumber, sceneName, storyTitle, createdAt}
let settings = readJson('settings.json', {});    // {geminiKey}
const saveUsers = () => writeJson('users.json', users);
const saveSessions = () => writeJson('sessions.json', sessions);
const saveProjects = () => writeJson('projects.json', projects);
const saveMedia = () => writeJson('media.json', mediaItems);
const saveSettings = () => writeJson('settings.json', settings);

/* ---------------- helpers ---------------- */
const uid = () => crypto.randomBytes(9).toString('base64url');
function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}
function makeUser(username, password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return {
    id: uid(), username, salt,
    passHash: hashPassword(password, salt),
    role: users.length === 0 ? 'owner' : 'user',
    disabled: false, deviceFingerprint: null,
    createdAt: new Date().toISOString(),
  };
}
function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function currentUser(req) {
  const token = parseCookies(req).tls_session;
  if (!token || !sessions[token]) return null;
  const u = users.find(x => x.id === sessions[token].userId);
  if (!u || u.disabled) return null;
  return u;
}
function send(res, status, obj, headers = {}) {
  const body = typeof obj === 'string' || Buffer.isBuffer(obj) ? obj : JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': typeof obj === 'string' || Buffer.isBuffer(obj) ? (headers['Content-Type'] || 'application/octet-stream') : 'application/json; charset=utf-8', ...headers });
  res.end(body);
}
function readBody(req, limit = 12 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('TOO_BIG')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function readJsonBody(req) {
  const buf = await readBody(req);
  if (!buf.length) return {};
  try { return JSON.parse(buf.toString('utf8')); } catch { return {}; }
}
const ERR = {
  badLogin: 'အသုံးပြုသူအမည် သို့မဟုတ် စကားဝှက် မှားနေပါသည်။',
  dupUser: 'ဤအသုံးပြုသူအမည်ကို အသုံးပြုထားပြီးဖြစ်သည်။ အခြားအမည်တစ်ခု ရွေးပါ။',
  deviceBound: 'ဤဖုန်း/ဘရောက်ဇာတွင် အကောင့်တစ်ခု ရှိပြီးဖြစ်ပါသည်။',
  deviceMismatch: 'ဤအကောင့်ကို အခြားစက်တွင် ချိတ်ထားပါသည်။ စက်ပြန်သတ်မှတ်ရန် ပိုင်ရှင် (Owner) ကို ဆက်သွယ်ပါ။',
  deviceRequired: 'စက်အထောက်အထား မရရှိပါ။ စာမျက်နှာကို ပြန်ဖွင့်ပြီး ထပ်ကြိုးစားပါ။',
  disabled: 'ဤအကောင့်ကို ပိတ်ထားပါသည်။',
  auth: 'အရင် အကောင့်ဝင်ပါ။',
  noKey: 'Gemini API Key မထည့်ရသေးပါ။ ပိုင်ရှင်က ဆက်တင် (Settings) မှာ key ထည့်ပါ၊ သို့မဟုတ် Replit Secrets မှာ GEMINI_API_KEY ထည့်ပါ။',
  aiFail: 'AI ဖန်တီး၍ မရပါ။ ခဏနေမှ ထပ်မံကြိုးစားပါ။',
  aiBusy: 'AI ဆာဗာ အလုပ်များနေပါသည်။ ခဏစောင့်ပြီး ထပ်ကြိုးစားပါ။',
  aiQuota: 'API Key ရဲ့ quota (အခမဲ့ ကန့်သတ်ချက်) ပြည့်သွားပါသည်။ နာရီအနည်းငယ် စောင့်ပြီး ပြန်ကြိုးစားပါ၊ သို့မဟုတ် အခြား key သုံးပါ။',
};

/* ---------------- Gemini ---------------- */
const TEXT_MODELS = ['gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-3.5-flash-lite']; // 3.5 first: verified fast; 3.8 can hang when overloaded
const IMAGE_MODELS = ['gemini-3.1-flash-image', 'gemini-2.5-flash-image', 'gemini-3-pro-image'];
function geminiKey() { return process.env.GEMINI_API_KEY || settings.geminiKey || ''; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function geminiCall(model, body, key, timeoutMs = 120000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const data = await r.json().catch(() => ({}));
    return { status: r.status, data };
  } finally { clearTimeout(t); }
}
function extractText(data) {
  const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
  if (!Array.isArray(parts)) return '';
  return parts.map(p => p.text || '').join('');
}
/* Text generation with model fallback chain + retry/backoff. Returns {text} or throws {code} */
async function generateText(prompt, { maxTokens = 8192, temperature = 0.9 } = {}) {
  const key = geminiKey();
  if (!key) throw { code: 'NO_KEY' };
  let lastErr = null;
  for (const model of TEXT_MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { status, data } = await geminiCall(model, {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature, maxOutputTokens: maxTokens },
        }, key, 45000);
        if (status === 429 && JSON.stringify(data).toLowerCase().includes('quota')) throw { code: 'AI_QUOTA' };
        if (status === 200) {
          const text = extractText(data).trim();
          if (text) return text;
          lastErr = { code: 'AI_FAIL' };
        } else if (status === 400 || status === 403) {
          throw { code: status === 403 ? 'NO_KEY' : 'AI_FAIL', status };
        } else if (status === 404) {
          lastErr = { code: 'AI_FAIL', status }; break; // model gone -> next model
        } else {
          lastErr = { code: 'AI_BUSY', status }; // 429/503 -> backoff then next
        }
      } catch (e) {
        if (e && e.code) throw e;
        lastErr = { code: 'AI_BUSY' };
      }
      await sleep(700 * (attempt + 1));
    }
  }
  throw lastErr || { code: 'AI_FAIL' };
}
/* Image generation (optionally with reference images). Returns {base64, mime} */
async function generateImage(prompt, aspectRatio, refs) {
  const key = geminiKey();
  if (!key) throw { code: 'NO_KEY' };
  const parts = [{ text: prompt }];
  for (const ref of refs || []) parts.push({ inlineData: { mimeType: ref.mime, data: ref.base64 } });
  let lastErr = null;
  for (const model of IMAGE_MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { status, data } = await geminiCall(model, {
          contents: [{ parts }],
          generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: aspectRatio || '9:16' } },
        }, key, 180000);
        if (status === 429 && JSON.stringify(data).toLowerCase().includes('quota')) throw { code: 'AI_QUOTA' };
        if (status === 200) {
          const ps = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
          const img = ps.find(p => p.inlineData && p.inlineData.data);
          if (img) return { base64: img.inlineData.data, mime: img.inlineData.mimeType || 'image/png' };
          lastErr = { code: 'AI_FAIL' };
        } else if (status === 400 || status === 403) {
          throw { code: status === 403 ? 'NO_KEY' : 'AI_FAIL', status };
        } else if (status === 404) { lastErr = { code: 'AI_FAIL', status }; break; }
        else lastErr = { code: 'AI_BUSY', status };
      } catch (e) {
        if (e && e.code) throw e;
        lastErr = { code: 'AI_BUSY' };
      }
      await sleep(900 * (attempt + 1));
    }
  }
  throw lastErr || { code: 'AI_FAIL' };
}

/* ---------------- prompt builders (all original wording) ---------------- */
function characterContextText(ctx) {
  if (!ctx || !Array.isArray(ctx.characters) || !ctx.characters.length) return '';
  const lines = ctx.characters.map(c =>
    `- ${c.name} (${c.role === 'main' ? 'အဓိကဇာတ်ကောင်' : 'အရန်ဇာတ်ကောင်'}): ${c.traits || ''} ${c.appearance || ''}`.trim());
  return `\nဇာတ်ကောင်များ (အမည်၊ လက္ခဏာ၊ ပုံပန်းသဏ္ဌာန်တို့ကို တစ်သမတ်တည်း ထိန်းထားပါ):\n${lines.join('\n')}` +
    `\nအခြားဇာတ်ကောင် ပါဝင်ခွင့်: ${ctx.allowOthers ? 'လိုအပ်သလို ဇာတ်ကောင်အသစ် ထည့်နိုင်သည်' : 'အထက်ပါ ဇာတ်ကောင်များသာ သုံးပါ'}`;
}
function buildSummaryPrompt(b) {
  return `သင်သည် မြန်မာဇာတ်လမ်း ရေးသားသူ ကျွမ်းကျင်သူဖြစ်သည်။ အောက်ပါ စိတ်ကူး/အကြောင်းအရာကို အခြေခံပြီး ဆွဲဆောင်မှုရှိသော ဇာတ်လမ်းအကျဉ်း တစ်ပုဒ်ကို မြန်မာဘာသာဖြင့် ရေးပေးပါ။
အမျိုးအစား: ${b.genre || ''}
ရေးသားနည်း: ${b.mode === 'ai' ? 'AI က အစအဆုံး စိတ်ကူးဖန်တီးရေးရန်' : 'ရေးထားသည်ကို အကျဉ်းချုပ်ရန်'}
အကြောင်းအရာ/ရေးထားသော ဇာတ်လမ်း:
${b.idea || b.story || ''}
${characterContextText(b.characterContext)}
ဇာတ်လမ်းအကျဉ်းကိုသာ ပြန်ပေးပါ။ ရှင်းလင်းချက် မထည့်ပါနှင့်။`;
}
function buildStoryPrompt(b) {
  const minutes = Number(b.duration) || 3;
  const words = minutes * 130; // rough Burmese reading pace
  return `သင်သည် မြန်မာဇာတ်လမ်း ရေးသားသူ ကျွမ်းကျင်သူဖြစ်သည်။ အောက်ပါ ဇာတ်လမ်းအကျဉ်းကို အခြေခံပြီး ဖတ်ချိန် ${minutes} မိနစ်ခန့် (စာလုံးရေ ${words} ဝန်းကျင်) ရှိသော ဇာတ်လမ်းအပြည့်အစုံကို မြန်မာဘာသာဖြင့် ရေးပေးပါ။
အမျိုးအစား: ${b.genre || ''}
စကားပြောပုံစံ: ${b.dialogue === 'no' ? 'ဇာတ်ကောင်တွေ စကားမပြောဘဲ ပြောပြသူ (narrator) ကသာ ပြောပြရန်' : 'ဇာတ်ကောင်များ အပြန်အလှန် စကားပြောခန်းများ ပါရန်'}
${b.ending ? 'ဇာတ်သိမ်း (ဤအတိုင်း အဆုံးသတ်ရန်): ' + b.ending : ''}
ဇာတ်လမ်းအကျဉ်း:
${b.summary || ''}
${characterContextText(b.characterContext)}
ဇာတ်လမ်းကိုသာ ပြန်ပေးပါ။ ခေါင်းစဉ်၊ ရှင်းလင်းချက် မထည့်ပါနှင့်။`;
}
function buildTitlesPrompt(b) {
  const kind = b.titleType === 'clickbait' ? 'အာရုံဖမ်းစားသော (click လုပ်ချင်စရာ)' : 'စိတ်ဝင်စားဖွယ်';
  return `အောက်ပါ မြန်မာဇာတ်လမ်းအတွက် ${kind} ခေါင်းစဉ် ၈ ခု ဖန်တီးပေးပါ။ တစ်ခုကို တစ်ကြောင်းစီ ပြန်ပေးပါ။ နံပါတ် မတပ်ပါနှင့်၊ ရှင်းလင်းချက် မရေးပါနှင့်၊ ခေါင်းစဉ်များကိုသာ ပြန်ပေးပါ။ YouTube/Facebook thumbnail မှာ သုံးလို့ရအောင် တိုတိုနဲ့ ဆွဲဆောင်မှုရှိရှိရေးပါ။
ဇာတ်လမ်း:
${(b.fullStory || b.summary || '').slice(0, 4000)}`;
}
function buildPromptsPrompt(b) {
  const scenes = Math.max(4, Math.min(30, Math.round((Number(b.duration) || 3) * 3)));
  return `အောက်ပါ မြန်မာဇာတ်လမ်းကို ဗီဒီယိုထုတ်လုပ်ရန် Scene ${scenes} ခု ခွဲပြီး Scene တစ်ခုချင်းစီအတွက် အင်္ဂလိပ်ဘာသာဖြင့် Image Prompt နှင့် Video Prompt ရေးပေးပါ။
ပုံစံ (Art style): ${b.artStyle || '3D animation'}
ဗီဒီယို အချိုး: ${b.videoRatio || '9:16'}
စကားပြောပုံစံ: ${b.dialogue === 'no' ? 'ဇာတ်ကောင်တွေ စကားမပြောပါ (narration only)' : 'ဇာတ်ကောင်တွေ စကားပြောသည်'}
${characterContextText(b.characterContext)}
ခေါင်းစဉ်ရွေးထားသည်: ${b.selectedTitle || ''}
ဇာတ်လမ်း:
${(b.fullStory || b.summary || '').slice(0, 9000)}

ပြန်ပေးရမည့် ပုံစံ (အတိအကျ လိုက်နာပါ):
Thumbnail Prompt: <thumbnail အတွက် အင်္ဂလိပ် prompt တစ်ခု>

Scene 1: <scene အမည် တိုတို>
Included Characters in this Scene: <ပါဝင်သော ဇာတ်ကောင်အမည်များ၊ မပါရင် None>
Image Prompt: <အင်္ဂလိပ် image prompt>
Video Prompt: <အင်္ဂလိပ် video prompt — လှုပ်ရှားမှု၊ ကင်မရာ၊ အသံအကျိုးသက်ရောက်မှု ပါရန်>

Scene 2: ... စသည်ဖြင့် Scene ${scenes} အထိ ဆက်ရေးပါ။`;
}
function buildTraitsPrompt(b) {
  const names = (b.context && b.context.characters || []).map(c => c.name).join(', ');
  return `အောက်ပါ ဇာတ်လမ်းအကျဉ်းကို ဖတ်ပြီး ဇာတ်ကောင်များ (${names}) တစ်ယောက်ချင်းစီအတွက် လက္ခဏာများနှင့် ပုံပန်းသဏ္ဌာန် ဖော်ပြချက်ကို မြန်မာဘာသာဖြင့် ရေးပေးပါ။
ဇာတ်လမ်း: ${(b.story || '').slice(0, 3000)}
JSON ပုံစံဖြင့်သာ ပြန်ပေးပါ: {"characters":[{"name":"အမည်","traits":"လက္ခဏာများ","appearance":"ပုံပန်းသဏ္ဌာန်"}]}`;
}

/* ---------------- static + media serving ---------------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
function serveStatic(req, res, urlPath) {
  let p = decodeURIComponent(urlPath);
  if (p === '/') p = '/index.html';
  const file = path.join(PUBLIC, path.normalize(p).replace(/^([/\\])+/, ''));
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, 'Not found', { 'Content-Type': 'text/plain' });
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}

/* ---------------- router ---------------- */
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname;
  try {
    /* ----- auth ----- */
    if (p === '/api/auth/register' && req.method === 'POST') {
      const b = await readJsonBody(req);
      const username = String(b.username || ''), password = String(b.password || ''), fp = String(b.deviceFingerprint || '');
      if (!/^[A-Za-z0-9_]{3,50}$/.test(username)) return send(res, 400, { error: 'အသုံးပြုသူအမည်သည် အင်္ဂလိပ်စာလုံး၊ ဂဏန်းနှင့် _ သာ (၃–၅၀ လုံး) ဖြစ်ရမည်။', code: 'BAD_USERNAME' });
      if (password.length < 8 || password.length > 128) return send(res, 400, { error: 'စကားဝှက်သည် အက္ခရာ ၈–၁၂၈ လုံး ဖြစ်ရမည်။', code: 'BAD_PASSWORD' });
      if (!fp) return send(res, 400, { error: ERR.deviceRequired, code: 'DEVICE_REQUIRED' });
      if (users.some(x => x.username.toLowerCase() === username.toLowerCase())) return send(res, 409, { error: ERR.dupUser, code: 'DUP' });
      if (users.some(x => x.deviceFingerprint && x.deviceFingerprint === fp)) return send(res, 409, { error: ERR.deviceBound, code: 'DEVICE_ALREADY_BOUND' });
      const user = makeUser(username, password);
      user.deviceFingerprint = fp;
      users.push(user); saveUsers();
      return startSession(res, user, 201);
    }
    if (p === '/api/auth/login' && req.method === 'POST') {
      const b = await readJsonBody(req);
      const username = String(b.username || ''), password = String(b.password || ''), fp = String(b.deviceFingerprint || '');
      const user = users.find(x => x.username.toLowerCase() === username.toLowerCase());
      if (!user || user.passHash !== hashPassword(password, user.salt)) return send(res, 401, { error: ERR.badLogin, code: 'BAD_LOGIN' });
      if (user.disabled) return send(res, 403, { error: ERR.disabled, code: 'DISABLED' });
      if (!fp) return send(res, 400, { error: ERR.deviceRequired, code: 'DEVICE_REQUIRED' });
      if (!user.deviceFingerprint) { user.deviceFingerprint = fp; saveUsers(); }
      else if (user.deviceFingerprint !== fp) return send(res, 403, { error: ERR.deviceMismatch, code: 'DEVICE_MISMATCH' });
      return startSession(res, user, 200);
    }
    if (p === '/api/auth/logout' && req.method === 'POST') {
      const token = parseCookies(req).tls_session;
      if (token) { delete sessions[token]; saveSessions(); }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': 'tls_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax' });
      return res.end('{}');
    }
    if (p === '/api/auth/me' && req.method === 'GET') {
      const user = currentUser(req);
      if (!user) return send(res, 401, { error: ERR.auth, code: 'SESSION_REQUIRED' });
      return send(res, 200, publicUser(user));
    }

    /* ----- everything below needs auth ----- */
    const user = currentUser(req);
    const needsAuth = p.startsWith('/api/ai') || p.startsWith('/api/projects') || p.startsWith('/api/assets') || p.startsWith('/api/media') || p.startsWith('/api/admin') || p.startsWith('/api/settings') || p.startsWith('/media-file');
    if (needsAuth && !user) return send(res, 401, { error: ERR.auth, code: 'SESSION_REQUIRED' });

    /* ----- settings ----- */
    if (p === '/api/settings' && req.method === 'GET') {
      return send(res, 200, { hasKey: !!geminiKey(), keySource: process.env.GEMINI_API_KEY ? 'secret' : (settings.geminiKey ? 'saved' : 'none'), role: user.role });
    }
    if (p === '/api/settings/key' && req.method === 'POST') {
      if (user.role !== 'owner') return send(res, 403, { error: 'ပိုင်ရှင်သာ key ထည့်နိုင်ပါသည်။' });
      const b = await readJsonBody(req);
      settings.geminiKey = String(b.key || '').trim(); saveSettings();
      return send(res, 200, { hasKey: !!geminiKey() });
    }

    /* ----- AI ----- */
    if (p.startsWith('/api/ai/') && req.method === 'POST') {
      const b = await readJsonBody(req);
      try {
        if (p === '/api/ai/summary') return send(res, 200, { summary: await generateText(buildSummaryPrompt(b)) });
        if (p === '/api/ai/story') return send(res, 200, { story: await generateText(buildStoryPrompt(b), { maxTokens: 16384 }) });
        if (p === '/api/ai/titles') {
          const raw = await generateText(buildTitlesPrompt(b), { temperature: 1.0 });
          const titles = raw.split('\n').map(s => s.replace(/^\s*[\d၀-၉]+[\.\)၊]\s*/, '').replace(/^[\-•]\s*/, '').trim()).filter(s => s.length > 1 && s.length <= 120).slice(0, 8);
          return send(res, 200, { titles });
        }
        if (p === '/api/ai/prompts') return send(res, 200, { prompts: await generateText(buildPromptsPrompt(b), { maxTokens: 16384, temperature: 0.8 }) });
        if (p === '/api/ai/traits') {
          const raw = await generateText(buildTraitsPrompt(b), { temperature: 0.6 });
          let parsed = null;
          try { parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)); } catch {}
          return send(res, 200, { result: parsed, raw });
        }
        if (p === '/api/ai/image') {
          const refs = [];
          for (const assetId of (b.referenceAssetIds || []).slice(0, 5)) {
            const f = findAssetFile(user.id, assetId);
            if (f) refs.push({ mime: f.mime, base64: fs.readFileSync(f.file).toString('base64') });
          }
          const img = await generateImage(String(b.imagePrompt || ''), b.aspectRatio, refs);
          const ext = img.mime.includes('jpeg') ? 'jpg' : img.mime.includes('webp') ? 'webp' : 'png';
          const dir = path.join(MEDIA, user.id); fs.mkdirSync(dir, { recursive: true });
          const file = `${Date.now()}-${uid()}.${ext}`;
          fs.writeFileSync(path.join(dir, file), Buffer.from(img.base64, 'base64'));
          const item = { id: uid(), userId: user.id, file, sceneNumber: b.sceneNumber || null, sceneName: b.sceneName || '', storyTitle: b.storyTitle || '', createdAt: new Date().toISOString() };
          mediaItems.unshift(item); saveMedia();
          return send(res, 200, { item: mediaView(item) });
        }
        return send(res, 404, { error: 'မတွေ့ပါ။' });
      } catch (e) {
        const code = e && e.code;
        if (code === 'NO_KEY') return send(res, 400, { error: ERR.noKey, code });
        if (code === 'AI_BUSY') return send(res, 503, { error: ERR.aiBusy, code });
        if (code === 'AI_QUOTA') return send(res, 429, { error: ERR.aiQuota, code });
        return send(res, 502, { error: ERR.aiFail, code: 'AI_FAIL' });
      }
    }

    /* ----- character assets (reference images) ----- */
    if (p === '/api/assets' && req.method === 'POST') {
      const ct = req.headers['content-type'] || '';
      if (!/^image\/(png|jpeg|webp)$/.test(ct)) return send(res, 400, { error: 'PNG, JPEG, WebP ပုံများသာ ထည့်နိုင်ပါသည်။' });
      const buf = await readBody(req, 8 * 1024 * 1024 + 16);
      if (buf.length > 8 * 1024 * 1024) return send(res, 400, { error: 'ပုံအရွယ်အစား 8MB ထက် မကျော်ရပါ။' });
      const dir = path.join(MEDIA, user.id, 'assets'); fs.mkdirSync(dir, { recursive: true });
      const ext = ct.includes('jpeg') ? 'jpg' : ct.includes('webp') ? 'webp' : 'png';
      const id = uid();
      fs.writeFileSync(path.join(dir, id + '.' + ext), buf);
      return send(res, 200, { id, url: `/media-file/assets/${id}.${ext}` });
    }

    /* ----- projects / records ----- */
    if (p === '/api/projects' && req.method === 'GET') {
      return send(res, 200, { items: projects.filter(x => x.userId === user.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) });
    }
    if (p === '/api/projects' && req.method === 'POST') {
      const b = await readJsonBody(req);
      let item = b.id ? projects.find(x => x.id === b.id && x.userId === user.id) : null;
      if (item) { item.draft = b.draft; item.title = b.title || item.title; item.kind = b.kind || item.kind; item.updatedAt = new Date().toISOString(); }
      else { item = { id: uid(), userId: user.id, kind: b.kind || 'story', title: b.title || 'ခေါင်းစဉ်မရှိ', draft: b.draft || {}, updatedAt: new Date().toISOString() }; projects.unshift(item); }
      saveProjects();
      return send(res, 200, { item });
    }
    if (p.startsWith('/api/projects/') && req.method === 'DELETE') {
      const id = p.split('/')[3];
      projects = projects.filter(x => !(x.id === id && x.userId === user.id)); saveProjects();
      return send(res, 200, { ok: true });
    }

    /* ----- media library ----- */
    if (p === '/api/media' && req.method === 'GET') {
      return send(res, 200, { items: mediaItems.filter(x => x.userId === user.id).map(mediaView) });
    }
    if (p.startsWith('/media-file/')) {
      const rest = p.slice('/media-file/'.length);
      const file = path.join(MEDIA, user.id, rest);
      if (!file.startsWith(path.join(MEDIA, user.id)) || !fs.existsSync(file)) return send(res, 404, 'Not found', { 'Content-Type': 'text/plain' });
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      return fs.createReadStream(file).pipe(res);
    }

    /* ----- admin (owner) ----- */
    if (p.startsWith('/api/admin/')) {
      if (user.role !== 'owner') return send(res, 403, { error: 'ပိုင်ရှင်သာ ဝင်နိုင်ပါသည်။' });
      if (p === '/api/admin/users' && req.method === 'GET') {
        return send(res, 200, { items: users.map(x => ({ ...publicUser(x), disabled: x.disabled, createdAt: x.createdAt, hasDevice: !!x.deviceFingerprint })) });
      }
      const m = p.match(/^\/api\/admin\/users\/([^/]+)\/(disable|enable|reset-device|delete)$/);
      if (m && req.method === 'POST') {
        const target = users.find(x => x.id === m[1]);
        if (!target) return send(res, 404, { error: 'မတွေ့ပါ။' });
        if (target.id === user.id && m[2] !== 'reset-device') return send(res, 400, { error: 'ကိုယ့်အကောင့်ကို ကိုယ် ပိတ်/ဖျက် မရပါ။' });
        if (m[2] === 'disable') target.disabled = true;
        if (m[2] === 'enable') target.disabled = false;
        if (m[2] === 'reset-device') {
          target.deviceFingerprint = null;
          for (const t of Object.keys(sessions)) if (sessions[t].userId === target.id) delete sessions[t];
          saveSessions();
        }
        if (m[2] === 'delete') users = users.filter(x => x.id !== target.id);
        saveUsers();
        return send(res, 200, { ok: true });
      }
      return send(res, 404, { error: 'မတွေ့ပါ။' });
    }

    /* ----- static ----- */
    if (req.method === 'GET') return serveStatic(req, res, p);
    return send(res, 404, { error: 'မတွေ့ပါ။' });
  } catch (e) {
    if (e && e.message === 'TOO_BIG') return send(res, 413, { error: 'ဖိုင် အရွယ်အစား ကြီးလွန်းပါသည်။' });
    console.error(e);
    return send(res, 500, { error: 'ဆာဗာ အမှား ဖြစ်ပွားခဲ့သည်။' });
  }
});
function publicUser(u) { return { id: u.id, username: u.username, role: u.role }; }
function mediaView(item) { return { id: item.id, url: `/media-file/${item.file}`, sceneNumber: item.sceneNumber, sceneName: item.sceneName, storyTitle: item.storyTitle, createdAt: item.createdAt }; }
function findAssetFile(userId, assetId) {
  const dir = path.join(MEDIA, userId, 'assets');
  if (!fs.existsSync(dir)) return null;
  const f = fs.readdirSync(dir).find(x => x.startsWith(assetId + '.'));
  if (!f) return null;
  const ext = path.extname(f).slice(1);
  return { file: path.join(dir, f), mime: ext === 'jpg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png' };
}
function startSession(res, user, status) {
  const token = crypto.randomBytes(24).toString('base64url');
  sessions[token] = { userId: user.id, createdAt: Date.now() };
  saveSessions();
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Set-Cookie': `tls_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${30 * 24 * 3600}` });
  res.end(JSON.stringify(publicUser(user)));
}
server.listen(PORT, () => console.log(`ThinkLab Story Studio running on port ${PORT}`));
