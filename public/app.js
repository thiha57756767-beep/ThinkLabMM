'use strict';
/* ThinkLab Story Studio — frontend */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

/* ---------- options ---------- */
const GENRES = ['ဟာသ','ဝမ်းနည်းစရာ','အချစ်','စိတ်ကူးယဉ်','မိသားစု','ပညာပေး','သိပ္ပံ','စွန့်စားခန်း','လျှို့ဝှက်ဆန်းကြယ်','ထိတ်လန့်','သမိုင်း','ရိုးရာပုံပြင်','ခင်မင်ရင်းနှီးမှု','တိရစ္ဆာန်ပုံပြင်','ဘဝသင်ခန်းစာ'];
const ART_STYLES = ['နှစ်ဖက်မြင် (2D)','သုံးဖက်မြင် (3D)','တုတ်ရုပ် (Stick figure)','ရေဆေး (Watercolour)','ဂျပန်အန်နီမေး (Anime)','ပုံပြင်စာအုပ် (Storybook)','ဂျီဘလီ (Ghibli)','ရုပ်ပြ (Comic)','ရွှံ့ရုပ် (Claymation)','သုံးဖက်မြင် လှုပ်ရှားပုံ (3D animation)','လက်တွေ့ဆန် (Realistic)','ဒီဂျစ်တယ် ပန်းချီ','ဆီဆေး ပန်းချီ','ခဲတံ ကောက်ကြောင်း','ချစ်စရာ ချီဘီ (Chibi)','သုံးဖက်မြင် ကာတွန်း (3D cartoon)'];
const CLOTHING = ['မသတ်မှတ်ပါ','မြန်မာရိုးရာ','ခေတ်သစ် နေ့စဉ်ဝတ်','ရုံးဝတ်စုံ','ကျောင်းဝတ်စုံ','ပွဲဝတ်စုံ','အားကစားဝတ်','ဆောင်းဝတ်','နွေပေါ့ပါးဝတ်','သမိုင်းဝင် / ရှေးခေတ်ဝတ်','စိတ်ကူးယဉ် / မှော်ဝတ်'];
const BACKGROUNDS = ['မသတ်မှတ်ပါ','မြန်မာရွာ','မြို့ပြ ခေတ်သစ်','သဘာဝ တောတောင်','ကမ်းခြေ / မြစ်','ကျောင်း','ဈေး / လမ်း','အိမ်အတွင်း','နန်းတော် / ရှေးဟောင်း','စိတ်ကူးယဉ် ကမ္ဘာ','ည / ကြယ်ရောင်ည'];

/* ---------- state ---------- */
let me = null;
let draft = freshDraft();
let currentProjectId = null;
let scenes = [];
function freshDraft() {
  return {
    hasOwnCharacters: null,
    characters: [],
    allowOthers: true, contextStyle: 'photo',
    genre: GENRES[0], artStyle: ART_STYLES[15], clothingStyle: CLOTHING[0], backgroundStyle: BACKGROUNDS[0],
    writeMode: 'expand', dialogue: 'yes', duration: 3,
    idea: '', summary: '', ending: '', story: '',
    titleType: 'engaging', titles: [], selectedTitle: '',
    videoRatio: '9:16', prompts: '',
  };
}
function characterContext() {
  if (draft.hasOwnCharacters !== true) return null;
  return {
    characters: draft.characters.map(c => ({ name: c.name, role: c.role, traits: c.traits, appearance: c.appearance })),
    allowOthers: draft.allowOthers,
    artStyle: draft.contextStyle === 'photo' ? 'ဇာတ်ကောင်ပုံအတိုင်း' : draft.artStyle,
  };
}

/* ---------- api ---------- */
async function api(path, opts = {}) {
  const r = await fetch(path, { credentials: 'include', headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) }, ...opts });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'လုပ်ဆောင်ချက် မအောင်မြင်ပါ။ ထပ်စမ်းပါ။');
  return data;
}
function busy(text, on = true) { $('#loadingText').textContent = text || 'ဖန်တီးနေပါသည်...'; $('#loading').hidden = !on; }
function toast(id, msg) { const t = $(id); t.textContent = msg; t.hidden = false; setTimeout(() => t.hidden = true, 4200); }

/* ---------- device fingerprint (AVT-style) ---------- */
async function deviceFingerprint() {
  const a = navigator;
  let canvasSig = 'no-canvas', webglSig = 'no-webgl';
  try {
    const c = document.createElement('canvas'); c.width = 220; c.height = 40;
    const x = c.getContext('2d');
    if (x) { x.textBaseline = 'top'; x.font = "16px 'Arial'"; x.fillStyle = '#c48a2c'; x.fillRect(10, 5, 90, 24); x.fillStyle = '#2f6b3a'; x.fillText('ThinkLab Studio ဇာတ်လမ်း', 4, 10); canvasSig = c.toDataURL(); }
  } catch {}
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    if (gl) { const ext = gl.getExtension('WEBGL_debug_renderer_info'); webglSig = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER)); }
  } catch {}
  const raw = [a.userAgent, a.platform, a.language, (a.languages || []).join(','), a.hardwareConcurrency ?? '', a.deviceMemory ?? '', a.maxTouchPoints ?? '', `${screen.width}x${screen.height}x${screen.colorDepth}`, window.devicePixelRatio, Intl.DateTimeFormat().resolvedOptions().timeZone, canvasSig, webglSig].join('::');
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/* ---------- auth ---------- */
let authMode = 'login';
function setAuthMode(mode) {
  authMode = mode;
  $('#tabLogin').classList.toggle('active', mode === 'login');
  $('#tabRegister').classList.toggle('active', mode === 'register');
  $('#authTitle').textContent = mode === 'login' ? 'အကောင့်ဝင်ရန်' : 'အကောင့်ဖွင့်ရန်';
  $('#authSub').textContent = mode === 'login' ? 'သင့်စတူဒီယိုသို့ ပြန်လည်ဝင်ရောက်ပါ။' : 'သင့်အတွက် စတူဒီယို နေရာတစ်ခု ဖန်တီးပါ။';
  $('#authSubmit').textContent = mode === 'login' ? 'အကောင့်ဝင်ရန် →' : 'အကောင့်ဖွင့်ရန် →';
  $('#registerNotes').hidden = mode !== 'register';
  $('#authError').hidden = true;
}
$('#tabLogin').onclick = () => setAuthMode('login');
$('#tabRegister').onclick = () => setAuthMode('register');
$('#pwToggle').onclick = () => { const i = $('#authPassword'); i.type = i.type === 'password' ? 'text' : 'password'; $('#pwToggle').textContent = i.type === 'password' ? 'ပြရန်' : 'ဖျောက်ရန်'; };
$('#authForm').onsubmit = async e => {
  e.preventDefault();
  const err = $('#authError'); err.hidden = true;
  $('#authSubmit').disabled = true;
  try {
    const fp = await deviceFingerprint();
    me = await api(`/api/auth/${authMode}`, { method: 'POST', body: JSON.stringify({ username: $('#authUsername').value.trim(), password: $('#authPassword').value, deviceFingerprint: fp }) });
    enterApp();
  } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  finally { $('#authSubmit').disabled = false; }
};
$('#btnLogout').onclick = async () => { await api('/api/auth/logout', { method: 'POST' }).catch(() => {}); location.reload(); };

function enterApp() {
  $('#authView').hidden = true;
  $('#appView').hidden = false;
  $('#userName').textContent = me.username;
  $('#userRole').textContent = me.role === 'owner' ? 'ပိုင်ရှင်' : '';
  $('#navAdmin').hidden = me.role !== 'owner';
  $('#accountInfo').textContent = `အသုံးပြုသူအမည်: ${me.username} · အဆင့်: ${me.role === 'owner' ? 'ပိုင်ရှင် (Owner)' : 'အသုံးပြုသူ'}`;
  loadSettings(); loadMedia(); loadRecords();
}

/* ---------- nav ---------- */
$$('.nav-btn').forEach(b => b.onclick = () => {
  $$('.nav-btn').forEach(x => x.classList.toggle('active', x === b));
  for (const v of ['studio', 'image', 'records', 'settings', 'admin']) $('#view-' + v).hidden = v !== b.dataset.nav;
  if (b.dataset.nav === 'admin') loadUsers();
  if (b.dataset.nav === 'records') loadRecords();
  if (b.dataset.nav === 'image') loadMedia();
});

/* ---------- studio: options ---------- */
function fillSelect(id, items) { const s = $(id); s.innerHTML = items.map(v => `<option>${v}</option>`).join(''); }
fillSelect('#genre', GENRES); fillSelect('#artStyle', ART_STYLES); fillSelect('#clothingStyle', CLOTHING); fillSelect('#backgroundStyle', BACKGROUNDS);
$('#genre').onchange = e => draft.genre = e.target.value;
$('#artStyle').onchange = e => draft.artStyle = e.target.value;
$('#clothingStyle').onchange = e => draft.clothingStyle = e.target.value;
$('#backgroundStyle').onchange = e => draft.backgroundStyle = e.target.value;
$('#writeMode').onchange = e => draft.writeMode = e.target.value;
$('#dialogue').onchange = e => draft.dialogue = e.target.value;
$('#allowOthers').onchange = e => draft.allowOthers = e.target.value === 'yes';
$('#contextStyle').onchange = e => draft.contextStyle = e.target.value;
$('#idea').oninput = e => draft.idea = e.target.value;
$('#summary').oninput = e => draft.summary = e.target.value;
$('#ending').oninput = e => draft.ending = e.target.value;
$('#story').oninput = e => draft.story = e.target.value;
$('#prompts').oninput = e => draft.prompts = e.target.value;
$('#durationRow').addEventListener('click', e => { const b = e.target.closest('[data-dur]'); if (!b) return; $$('#durationRow .chip').forEach(c => c.classList.toggle('active', c === b)); draft.duration = Number(b.dataset.dur); });
$('#ratioRow').addEventListener('click', e => { const b = e.target.closest('[data-ratio]'); if (!b) return; $$('#ratioRow .chip').forEach(c => c.classList.toggle('active', c === b)); draft.videoRatio = b.dataset.ratio; });
$('#titleTypeRow').addEventListener('click', e => { const b = e.target.closest('[data-tt]'); if (!b) return; $$('#titleTypeRow .chip').forEach(c => c.classList.toggle('active', c === b)); draft.titleType = b.dataset.tt; });
$('#ownYes').onclick = () => setOwn(true);
$('#ownNo').onclick = () => setOwn(false);
function setOwn(v) {
  draft.hasOwnCharacters = v;
  $('#ownYes').classList.toggle('active', v === true);
  $('#ownNo').classList.toggle('active', v === false);
  $('#characterCard').hidden = v !== true;
  if (v && !draft.characters.length) addCharacter();
}

/* ---------- characters ---------- */
function addCharacter() {
  draft.characters.push({ id: 'c' + Math.random().toString(36).slice(2, 9), name: '', role: draft.characters.length ? 'support' : 'main', traits: '', traitsMode: 'ai', appearance: '', images: [] });
  renderCharacters();
}
$('#addCharacter').onclick = addCharacter;
function renderCharacters() {
  const wrap = $('#characterList'); wrap.innerHTML = '';
  draft.characters.forEach((c, idx) => {
    const card = document.createElement('div'); card.className = 'char-card';
    card.innerHTML = `
      <div class="grid2">
        <label class="field">အမည်<input data-f="name" value="${esc(c.name)}" placeholder="ဇာတ်ကောင်အမည်" /></label>
        <label class="field">အခန်းဏ္ဍ
          <select data-f="role"><option value="main" ${c.role === 'main' ? 'selected' : ''}>အဓိက</option><option value="support" ${c.role === 'support' ? 'selected' : ''}>အရန်</option></select>
        </label>
      </div>
      <div class="char-imgs">${c.images.map((im, i) => `<figure><img src="${im.url}" alt=""/><button type="button" data-del-img="${i}" title="ဖယ်ရန်">×</button></figure>`).join('')}</div>
      ${c.images.length < 5 ? `<label class="upload-btn">ပုံထည့်ရန် (၁ မှ ၅ ပုံ)<input type="file" accept="image/png,image/jpeg,image/webp" data-upload hidden /></label>` : ''}
      <label class="field">လက္ခဏာများ
        <textarea data-f="traits" rows="2" placeholder="ဥပမာ - အမြဲ အနီရောင် ဦးထုပ်ဆောင်းသည်၊ ရယ်ရွှင်တတ်သည်">${esc(c.traits)}</textarea>
      </label>
      <label class="field">AI ဖော်ပြထားသော ပုံပန်းသဏ္ဌာန်
        <textarea data-f="appearance" rows="2" placeholder="ခေါင်းစဉ်/Prompt ထုတ်ရာတွင် AI က ဖြည့်ပေးပါမည်">${esc(c.appearance)}</textarea>
      </label>
      <button type="button" class="secondary danger" data-del-char>ဇာတ်ကောင်ဖျက်ရန်</button>`;
    card.querySelector('[data-f="name"]').oninput = e => c.name = e.target.value;
    card.querySelector('[data-f="role"]').onchange = e => c.role = e.target.value;
    card.querySelector('[data-f="traits"]').oninput = e => { c.traits = e.target.value; c.traitsMode = 'manual'; };
    card.querySelector('[data-f="appearance"]').oninput = e => c.appearance = e.target.value;
    const up = card.querySelector('[data-upload]');
    if (up) up.onchange = async e => {
      const file = e.target.files[0]; if (!file) return;
      if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return toast('#studioMsg', 'PNG, JPEG, WebP ပုံများသာ ထည့်နိုင်ပါသည်။');
      if (file.size > 8 * 1024 * 1024) return toast('#studioMsg', 'ပုံအရွယ်အစား 8MB ထက် မကျော်ရပါ။');
      busy('ပုံတင်နေသည်...', true);
      try {
        const r = await fetch('/api/assets', { method: 'POST', credentials: 'include', headers: { 'Content-Type': file.type }, body: file });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || 'ပုံတင်၍ မရပါ။');
        c.images.push({ assetId: d.id, url: d.url }); renderCharacters();
      } catch (ex) { toast('#studioMsg', ex.message); }
      finally { busy('', false); }
    };
    card.querySelectorAll('[data-del-img]').forEach(b => b.onclick = () => { c.images.splice(Number(b.dataset.delImg), 1); renderCharacters(); });
    card.querySelector('[data-del-char]').onclick = () => { if (confirm('ဤဇာတ်ကောင်ကို ဖျက်မှာ သေချာပါသလား။')) { draft.characters.splice(idx, 1); renderCharacters(); } };
    wrap.appendChild(card);
  });
}
function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
function validateCharacters() {
  if (draft.hasOwnCharacters !== true) return null;
  if (!draft.characters.length) return 'ဇာတ်ကောင် အနည်းဆုံး တစ်ယောက် ထည့်ပါ။';
  if (!draft.characters.some(c => c.role === 'main')) return 'အဓိကဇာတ်ကောင် အနည်းဆုံး တစ်ယောက် လိုအပ်ပါသည်။';
  const names = draft.characters.map(c => c.name.trim());
  if (names.some(n => !n)) return 'ဇာတ်ကောင်တိုင်းတွင် အမည် လိုအပ်ပါသည်။';
  if (new Set(names.map(n => n.toLowerCase())).size !== names.length) return 'ဇာတ်ကောင်အမည်များ မထပ်ရပါ။';
  if (draft.characters.some(c => !c.images.length)) return 'ဇာတ်ကောင်တိုင်းတွင် ပုံ ၁ ပုံမှ ၅ ပုံအထိ လိုအပ်ပါသည်။';
  return null;
}

/* ---------- studio: AI steps ---------- */
function payloadBase() {
  return {
    genre: draft.genre, artStyle: draft.artStyle, clothingStyle: draft.clothingStyle, backgroundStyle: draft.backgroundStyle,
    mode: draft.writeMode, dialogue: draft.dialogue, duration: draft.duration,
    idea: draft.idea, summary: draft.summary, ending: draft.ending, story: draft.story,
    characterContext: characterContext(),
  };
}
async function ensureTraits() {
  if (draft.hasOwnCharacters !== true) return;
  const need = draft.characters.filter(c => c.traitsMode === 'ai' && !c.traits.trim());
  if (!need.length) return;
  const data = await api('/api/ai/traits', { method: 'POST', body: JSON.stringify({ context: characterContext(), story: draft.summary || draft.idea }) });
  const list = (data.result && data.result.characters) || [];
  for (const item of list) {
    const c = draft.characters.find(x => x.name.trim().toLowerCase() === String(item.name || '').trim().toLowerCase());
    if (c) { if (!c.traits.trim() && item.traits) c.traits = item.traits; if (item.appearance) c.appearance = item.appearance; }
  }
  renderCharacters();
}
$('#btnSummary').onclick = async () => {
  const v = validateCharacters(); if (v) return toast('#studioMsg', v);
  if (!draft.idea.trim()) return toast('#studioMsg', 'စိတ်ကူး / အကြောင်းအရာ အရင် ရေးပါ။');
  busy('ဇာတ်လမ်းအကျဉ်း ဖန်တီးနေပါသည်...', true);
  try { const d = await api('/api/ai/summary', { method: 'POST', body: JSON.stringify(payloadBase()) }); draft.summary = d.summary; $('#summary').value = d.summary; toast('#studioMsg', 'အကျဉ်း ရပါပြီ။'); }
  catch (e) { toast('#studioMsg', e.message); } finally { busy('', false); }
};
$('#btnStory').onclick = async () => {
  const v = validateCharacters(); if (v) return toast('#studioMsg', v);
  if (!draft.summary.trim() && !draft.idea.trim()) return toast('#studioMsg', 'အကျဉ်း ရှိမှ ဆက်လုပ်နိုင်ပါသည်။');
  busy('ဇာတ်လမ်း ရေးနေသည်... (ခဏကြာနိုင်ပါသည်)', true);
  try {
    await ensureTraits().catch(() => {});
    const d = await api('/api/ai/story', { method: 'POST', body: JSON.stringify(payloadBase()) });
    draft.story = d.story; $('#story').value = d.story; toast('#studioMsg', 'ဇာတ်လမ်းအပြည့် ရပါပြီ။');
  } catch (e) { toast('#studioMsg', e.message); } finally { busy('', false); }
};
$('#btnTitles').onclick = async () => {
  if (!draft.story.trim() && !draft.summary.trim()) return toast('#studioMsg', 'အကျဉ်း သို့မဟုတ် ဇာတ်လမ်းအပြည့် တစ်ခုခု ထည့်ပါ။');
  busy('ခေါင်းစဉ်များ စဉ်းစားနေပါသည်...', true);
  try {
    await ensureTraits().catch(() => {});
    const d = await api('/api/ai/titles', { method: 'POST', body: JSON.stringify({ ...payloadBase(), fullStory: draft.story || draft.summary, titleType: draft.titleType }) });
    draft.titles = d.titles; draft.selectedTitle = ''; renderTitles(); toast('#studioMsg', 'ခေါင်းစဉ်များ ရပါပြီ။ တစ်ခုကို ရွေးပါ။');
  } catch (e) { toast('#studioMsg', e.message); } finally { busy('', false); }
};
function renderTitles() {
  const wrap = $('#titleList'); wrap.innerHTML = '';
  draft.titles.forEach(t => {
    const div = document.createElement('label'); div.className = 'title-item' + (draft.selectedTitle === t ? ' selected' : '');
    div.innerHTML = `<input type="radio" name="ttl" ${draft.selectedTitle === t ? 'checked' : ''} style="width:auto"/> <span>${esc(t)}</span>`;
    div.onclick = () => { draft.selectedTitle = t; renderTitles(); };
    wrap.appendChild(div);
  });
}
$('#btnPrompts').onclick = async () => {
  if (!draft.selectedTitle) return toast('#studioMsg', 'ခေါင်းစဉ် အရင်ရွေးပါ။');
  if (!draft.story.trim() && !draft.summary.trim()) return toast('#studioMsg', 'ဇာတ်လမ်း ထည့်ပါ။');
  busy('Prompt များ ထုတ်နေသည်... (ခဏကြာနိုင်ပါသည်)', true);
  try {
    const d = await api('/api/ai/prompts', { method: 'POST', body: JSON.stringify({ ...payloadBase(), fullStory: draft.story, selectedTitle: draft.selectedTitle, videoRatio: draft.videoRatio }) });
    draft.prompts = d.prompts; $('#prompts').value = d.prompts; parseScenes(); toast('#studioMsg', 'Prompt များ ရပါပြီ။');
  } catch (e) { toast('#studioMsg', e.message); } finally { busy('', false); }
};
$('#btnCopyPrompts').onclick = async () => {
  if (!draft.prompts.trim()) return toast('#studioMsg', 'Prompt မရှိသေးပါ။');
  try { await navigator.clipboard.writeText(draft.prompts); toast('#studioMsg', 'ကူးယူပြီးပါပြီ ✅'); }
  catch { toast('#studioMsg', 'ကူးယူ၍ မရပါ။ စာသားကို ရွေးချယ်ပြီး ကူးယူနိုင်ပါသည်။'); }
};
$('#btnSaveRecord').onclick = () => saveRecord();
async function saveRecord(kind = 'story') {
  const title = draft.selectedTitle || (draft.summary || 'ခေါင်းစဉ်မရှိ').slice(0, 60);
  busy('သိမ်းနေသည်...', true);
  try {
    const d = await api('/api/projects', { method: 'POST', body: JSON.stringify({ id: currentProjectId || undefined, kind, title, draft }) });
    currentProjectId = d.item.id; toast('#studioMsg', 'သိမ်းဆည်းပြီးပါပြီ ✅'); loadRecords();
  } catch (e) { toast('#studioMsg', e.message); } finally { busy('', false); }
}
$('#btnToImage').onclick = () => { parseScenes(); $$('.nav-btn').find(b => b.dataset.nav === 'image').click(); };

/* ---------- scenes + image page ---------- */
function parseScenes() {
  scenes = [];
  const text = draft.prompts || '';
  const thumb = (text.match(/Thumbnail Prompt\s*[:：]\s*([^\n]+)/i) || [])[1] || '';
  const blocks = text.split(/(?=^Scene\s+\d+\s*[:：])/m).filter(b => /^Scene\s+\d+/m.test(b));
  for (const b of blocks) {
    const head = b.match(/^Scene\s+(\d+)\s*[:：]?\s*(.*)$/m);
    const img = (b.match(/Image Prompt\s*[:：]\s*([\s\S]*?)(?=\n\s*Video Prompt\s*[:：]|$)/i) || [])[1] || '';
    const chars = (b.match(/Included Characters in this Scene\s*[:：]\s*([^\n]+)/i) || [])[1] || '';
    if (head) scenes.push({ number: Number(head[1]), name: (head[2] || '').trim(), imagePrompt: img.trim(), characters: chars.trim() });
  }
  renderScenes(thumb);
}
function refAssetIdsFor(scene) {
  if (draft.hasOwnCharacters !== true || !scene.characters || /none/i.test(scene.characters)) return [];
  const ids = [];
  for (const c of draft.characters) {
    if (scene.characters.toLowerCase().includes(c.name.trim().toLowerCase()) && c.images.length) ids.push(c.images[0].assetId);
  }
  return ids.slice(0, 5);
}
function renderScenes(thumbPrompt) {
  const tc = $('#thumbnailCard'); tc.innerHTML = '';
  if (thumbPrompt) {
    tc.innerHTML = `<div class="scene-card"><h4>မျက်နှာဖုံးပုံ (Thumbnail)</h4><p class="muted">${esc(thumbPrompt)}</p><button type="button" class="primary" data-thumb>Thumbnail ပုံထုတ်ရန်</button><div class="scene-result"></div></div>`;
    tc.querySelector('[data-thumb]').onclick = e => generateInto(e.target.closest('.scene-card').querySelector('.scene-result'), { imagePrompt: thumbPrompt, aspectRatio: draft.videoRatio, sceneName: 'Thumbnail', storyTitle: draft.selectedTitle });
  }
  const wrap = $('#sceneList'); wrap.innerHTML = scenes.length ? '' : '<p class="muted">Scene မရှိသေးပါ။</p>';
  for (const s of scenes) {
    const refs = refAssetIdsFor(s);
    const card = document.createElement('div'); card.className = 'scene-card';
    card.innerHTML = `<h4>ဇာတ်ကွက် ${s.number}${s.name ? ' — ' + esc(s.name) : ''}</h4>
      <p class="muted">ပါဝင်သော ဇာတ်ကောင်: ${esc(s.characters || '—')} · ရည်ညွှန်းပုံ: ${refs.length ? refs.length + ' ပုံ ပို့မည်' : 'မပါ'}</p>
      <p>${esc(s.imagePrompt)}</p>
      <div class="btn-row"><button type="button" class="primary" data-gen>ပုံထုတ်ရန်</button><button type="button" class="secondary" data-copy-nar>Copy narration အတွက် ဇာတ်လမ်းကူးရန်</button></div>
      <div class="scene-result"></div>`;
    card.querySelector('[data-gen]').onclick = () => generateInto(card.querySelector('.scene-result'), { imagePrompt: s.imagePrompt, aspectRatio: draft.videoRatio, sceneNumber: s.number, sceneName: s.name, storyTitle: draft.selectedTitle, referenceAssetIds: refs });
    card.querySelector('[data-copy-nar]').onclick = async () => { try { await navigator.clipboard.writeText(draft.story || draft.summary); toast('#imageMsg', 'ဇာတ်လမ်းကို ကူးယူပြီးပါပြီ။ အသံသွင်းရန် သင်နှစ်သက်ရာ Voice tool မှာ သုံးနိုင်ပါသည်။'); } catch { toast('#imageMsg', 'ကူးယူ၍ မရပါ။'); } };
    wrap.appendChild(card);
  }
}
async function generateInto(container, body) {
  if (!body.imagePrompt || !body.imagePrompt.trim()) return toast('#imageMsg', 'Image Prompt မရှိပါ။');
  container.innerHTML = '<p class="muted">ပုံထုတ်လုပ်နေသည်... ⏳</p>';
  try {
    const d = await api('/api/ai/image', { method: 'POST', body: JSON.stringify(body) });
    container.innerHTML = `<img src="${d.item.url}" alt=""/><br/><a class="dl" href="${d.item.url}" download>ပုံကို ဒေါင်းလုဒ်လုပ်ရန် ⬇</a>`;
    loadMedia();
  } catch (e) { container.innerHTML = `<p class="error">${esc(e.message)}</p>`; }
}
$('#btnManualImage').onclick = () => generateInto($('#manualResult'), { imagePrompt: $('#manualPrompt').value, aspectRatio: draft.videoRatio, sceneName: 'ကိုယ်တိုင် Prompt', storyTitle: draft.selectedTitle });
async function loadMedia() {
  try {
    const d = await api('/api/media');
    const g = $('#mediaGallery');
    g.innerHTML = d.items.length ? '' : '<p class="muted">သိမ်းထားသော ပုံ မရှိသေးပါ။</p>';
    for (const it of d.items) {
      const f = document.createElement('figure');
      f.innerHTML = `<img src="${it.url}" alt=""/><figcaption>${it.sceneNumber ? 'ဇာတ်ကွက် ' + it.sceneNumber + ' · ' : ''}${esc(it.sceneName || '')}<br/>${esc(it.storyTitle || '')}</figcaption><a class="dl" href="${it.url}" download>ဒေါင်းလုဒ် ⬇</a>`;
      g.appendChild(f);
    }
  } catch {}
}

/* ---------- records ---------- */
$('#btnRefreshRecords').onclick = () => loadRecords();
async function loadRecords() {
  try {
    const d = await api('/api/projects');
    const wrap = $('#recordList');
    wrap.innerHTML = d.items.length ? '' : '<p class="muted">သိမ်းဆည်းထားသော မှတ်တမ်း မရှိသေးပါ။</p>';
    for (const it of d.items) {
      const row = document.createElement('div'); row.className = 'row-item';
      row.innerHTML = `<div><strong>${esc(it.title)}</strong><div class="meta">${new Date(it.updatedAt).toLocaleString('my-MM')}</div></div>
        <div class="btn-row"><button type="button" class="secondary" data-open>ဖွင့်ရန်</button><button type="button" class="secondary danger" data-del>ဖျက်ရန်</button></div>`;
      row.querySelector('[data-open]').onclick = () => {
        draft = { ...freshDraft(), ...it.draft }; currentProjectId = it.id; syncStudioFromDraft();
        $$('.nav-btn').find(b => b.dataset.nav === 'studio').click();
        toast('#studioMsg', 'မှတ်တမ်းကို ဖွင့်ပြီးပါပြီ။');
      };
      row.querySelector('[data-del]').onclick = async () => { if (confirm('ဤမှတ်တမ်းကို ဖျက်မှာ သေချာပါသလား။')) { await api('/api/projects/' + it.id, { method: 'DELETE' }); loadRecords(); } };
      wrap.appendChild(row);
    }
  } catch {}
}
function syncStudioFromDraft() {
  setOwn(draft.hasOwnCharacters === true ? true : (draft.hasOwnCharacters === false ? false : null));
  if (draft.hasOwnCharacters === null) { $('#characterCard').hidden = true; $('#ownYes').classList.remove('active'); $('#ownNo').classList.remove('active'); }
  renderCharacters();
  $('#genre').value = draft.genre; $('#artStyle').value = draft.artStyle; $('#clothingStyle').value = draft.clothingStyle; $('#backgroundStyle').value = draft.backgroundStyle;
  $('#writeMode').value = draft.writeMode; $('#dialogue').value = draft.dialogue;
  $('#allowOthers').value = draft.allowOthers ? 'yes' : 'no'; $('#contextStyle').value = draft.contextStyle;
  $$('#durationRow .chip').forEach(c => c.classList.toggle('active', Number(c.dataset.dur) === draft.duration));
  $$('#ratioRow .chip').forEach(c => c.classList.toggle('active', c.dataset.ratio === draft.videoRatio));
  $$('#titleTypeRow .chip').forEach(c => c.classList.toggle('active', c.dataset.tt === draft.titleType));
  $('#idea').value = draft.idea; $('#summary').value = draft.summary; $('#ending').value = draft.ending; $('#story').value = draft.story; $('#prompts').value = draft.prompts;
  renderTitles(); parseScenes();
}

/* ---------- settings ---------- */
async function loadSettings() {
  try {
    const d = await api('/api/settings');
    $('#keyStatus').textContent = d.hasKey
      ? (d.keySource === 'secret' ? 'Key အသင့်ရှိပါသည် (Replit Secret မှ)။ AI သုံးနိုင်ပါပြီ။' : 'Key အသင့်ရှိပါသည် (သိမ်းထားသော key)။ AI သုံးနိုင်ပါပြီ။')
      : 'Key မရှိသေးပါ။ AI သုံးရန် key လိုအပ်ပါသည်။';
    $('#keyForm').hidden = !(me && me.role === 'owner');
  } catch {}
}
$('#btnSaveKey').onclick = async () => {
  const key = $('#keyInput').value.trim();
  if (!key) return;
  busy('သိမ်းနေသည်...', true);
  try { await api('/api/settings/key', { method: 'POST', body: JSON.stringify({ key }) }); $('#keyInput').value = ''; loadSettings(); toast('#studioMsg', 'Key သိမ်းပြီးပါပြီ။'); }
  catch (e) { alert(e.message); } finally { busy('', false); }
};

/* ---------- admin ---------- */
$('#btnRefreshUsers').onclick = () => loadUsers();
async function loadUsers() {
  try {
    const d = await api('/api/admin/users');
    const wrap = $('#userList');
    wrap.innerHTML = d.items.length ? '' : '<p class="muted">အသုံးပြုသူ မရှိသေးပါ။</p>';
    for (const u of d.items) {
      const row = document.createElement('div'); row.className = 'row-item';
      row.innerHTML = `<div><strong>${esc(u.username)}</strong> <span class="pill ${u.role === 'owner' ? 'owner' : ''}">${u.role === 'owner' ? 'ပိုင်ရှင်' : 'အသုံးပြုသူ'}</span> ${u.disabled ? '<span class="pill off">ပိတ်ထား</span>' : '<span class="pill">အသုံးပြုနေ</span>'}
        <div class="meta">စက်: ${u.hasDevice ? 'ချိတ်ထားပြီး' : 'မချိတ်ရသေး'} · စဖွင့်သည့်နေ့: ${new Date(u.createdAt).toLocaleDateString('my-MM')}</div></div>
        <div class="btn-row">
          ${u.id !== me.id ? `<button type="button" class="secondary" data-act="${u.disabled ? 'enable' : 'disable'}">${u.disabled ? 'ပြန်ဖွင့်မည်' : 'ပိတ်မည်'}</button>` : ''}
          <button type="button" class="secondary" data-act="reset-device">စက် ပြန်သတ်မှတ်</button>
          ${u.id !== me.id ? '<button type="button" class="secondary danger" data-act="delete">ဖျက်မည်</button>' : ''}
        </div>`;
      row.querySelectorAll('[data-act]').forEach(b => b.onclick = async () => {
        const act = b.dataset.act;
        if (act === 'delete' && !confirm('ဤအကောင့်ကို ဖျက်မှာ သေချာပါသလား။')) return;
        if (act === 'reset-device' && !confirm('စက်ပြန်သတ်မှတ်ခြင်းသည် ချိတ်ဆက်မှုကိုဖယ်ရှားပြီး လက်ရှိ Session အားလုံးကို ရုပ်သိမ်းပါမည်။ ဆက်လုပ်မလား?')) return;
        if (act === 'disable' && !confirm('အကောင့်ပိတ်ခြင်းသည် သိမ်းထားသောဒေတာများကို မဖျက်ပါ။ ဆက်လုပ်မလား?')) return;
        try { await api(`/api/admin/users/${u.id}/${act}`, { method: 'POST' }); loadUsers(); } catch (e) { alert(e.message); }
      });
      wrap.appendChild(row);
    }
  } catch {}
}

/* ---------- boot ---------- */
(async () => {
  try { me = await api('/api/auth/me'); enterApp(); }
  catch { $('#authView').hidden = false; setAuthMode('login'); }
})();
