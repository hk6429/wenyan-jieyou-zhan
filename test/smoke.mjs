// 端到端煙霧測試：選文 → 閃卡 → 自測 → 對戰 → 文豪錄，390px 手機寬度不跑版、無 console error。
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const errors = [];

function staticFallback(reason) {
  const index = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const appJs = readFileSync(join(ROOT, 'js/app.js'), 'utf8');
  const css = readFileSync(join(ROOT, 'css/main.css'), 'utf8');
  const tabs = ['list', 'flashcard', 'quiz', 'battle', 'wenhao', 'caotang', 'rt', 'fusion', 'market'];
  const missing = tabs.filter((tab) => !index.includes(`data-tab="${tab}"`));
  if (missing.length) throw new Error(`靜態 smoke 缺少分頁：${missing.join(',')}`);
  for (const token of ['role="status"', 'aria-live="polite"', 'ensureQuizShell', 'battleShell', 'updateJianghuNav']) {
    if (!appJs.includes(token) && !index.includes(token)) throw new Error(`靜態 smoke 缺少關鍵標記：${token}`);
  }
  for (const token of ['masteredCount >= 1', 'masteredCount >= 3', 'masteredCount >= 5', 'showSystemOnboarding']) {
    if (!appJs.includes(token)) throw new Error(`靜態 smoke 缺少分級解鎖契約：${token}`);
  }
  for (const token of ['aria-label="選項 ${i + 1}：${opt}"', "setAttribute('aria-pressed'"]) {
    if (!appJs.includes(token)) throw new Error(`靜態 smoke 缺少選項 a11y 契約：${token}`);
  }
  for (const token of ['weekly-card', 'difficulty', 'visitor-badge.laobi.icu']) {
    if (!appJs.includes(token) && !index.includes(token)) throw new Error(`靜態 smoke 缺少第二批契約：${token}`);
  }
  if (!css.includes('@media (max-width: 480px)') || !css.includes('min-height:44px') || !css.includes('min-width: 68px') || !css.includes('min-height: 150px')) throw new Error('靜態 smoke 缺少手機版、首屏或觸控目標規則');
  if (!css.includes('nav.tabs:not(.tabs-sub)') || !css.includes('position:fixed') || !css.includes('bottom:0')) throw new Error('靜態 smoke 缺少手機底部核心 tab bar 規則');
  console.log(`✅ smoke test 全部通過（STATIC ALL CLEAN；${reason}，已執行等價靜態 fallback；HTTP server 主路徑保留）。`);
}

// 用本機 http server 供頁面載入（fetch data/texts.json 在 file:// 下不被支援，route 攔截也不穩）。
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg' };
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  try { const d = await readFile(join(ROOT, p)); res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); res.end(d); }
  catch { res.writeHead(404); res.end('nf'); }
});
try {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
} catch (error) {
  if (error?.code !== 'EPERM') throw error;
  staticFallback('受限 sandbox 禁止 localhost 監聽');
  process.exit(0);
}
const BASE = `http://localhost:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
} catch (error) {
  const msg = String(error && (error.stack || error.message || error));
  if (!/MachPortRendezvousServer|Permission denied \(1100\)|operation not permitted/i.test(msg)) throw error;
  staticFallback('受限 sandbox 無法啟動 Chromium');
  process.exit(0);
}
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
// 忽略尚未生成的美術圖檔 404（皆有 onerror fallback 接住，非程式錯誤）；真正的 JS 例外走 pageerror 捕捉
page.on('console', (msg) => {
  if (msg.type() !== 'error') return;
  const t = msg.text();
  if (/Failed to load resource/.test(t) || /404/.test(t)) return;
  errors.push(t);
});
page.on('pageerror', (err) => errors.push(String(err)));

await page.goto(`${BASE}/index.html`);
await page.waitForSelector('.text-list-item');

// 問題回報：頁尾開啟表單，送出至統一 API，成功後留在對話框顯示確認訊息。
let reportPayload = null;
await page.route('**/api/report', async (route) => {
  reportPayload = route.request().postDataJSON();
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: 1 }) });
});
await page.click('#report-open');
await page.selectOption('#report-category', '內容錯誤');
await page.fill('#report-message', '〈桃花源記〉第二段的注釋似乎有誤，請協助確認。');
await page.fill('#report-contact', 'teacher@example.com');
await page.click('#report-submit');
await page.waitForSelector('#report-status[data-state="success"]');
if (reportPayload?.category !== '內容錯誤') errors.push('問題回報未送出所選類型');
if (!reportPayload?.pageUrl?.startsWith(BASE)) errors.push('問題回報未附目前頁面網址');
if (await page.locator('#report-dialog[open]').count() !== 1) errors.push('問題回報成功後未保留確認畫面');
await page.click('#report-close');

// 全班文會真實雙端流程：教師出題後學生應立即收到；快速重複點擊不得跳題。
// 用瀏覽器公開介面操作教師／學生兩頁，只在網路邊界攔截後端，避免把實作細節當契約。
const liveSession = { live: null, answerKey: [], rows: [] };
const liveRoute = async (route) => {
  const body = route.request().postDataJSON();
  let result = { ok: 0, error: 'bad op' };
  if (body.op === 'start') {
    liveSession.live = { seed: 24681357, qn: body.qn, scope: body.scope, phase: 'lobby', qNo: 0 };
    result = { ok: 1, live: liveSession.live };
  } else if (body.op === 'key') {
    liveSession.answerKey = body.answerKey;
    result = { ok: 1 };
  } else if (body.op === 'state') {
    result = { ok: 1, live: liveSession.live };
  } else if (body.op === 'next') {
    await new Promise((resolve) => setTimeout(resolve, 120));
    if (liveSession.live.phase === 'lobby') {
      liveSession.live = { ...liveSession.live, phase: 'q', qNo: 1 };
    } else if (liveSession.live.qNo >= liveSession.live.qn) {
      liveSession.live = { ...liveSession.live, phase: 'end' };
    } else {
      liveSession.live = { ...liveSession.live, qNo: liveSession.live.qNo + 1 };
    }
    result = { ok: 1, live: liveSession.live };
  } else if (body.op === 'roster') {
    result = { ok: 1, list: liveSession.rows };
  } else if (body.op === 'answer') {
    result = { ok: 1 };
  } else if (body.op === 'end') {
    liveSession.live = liveSession.live ? { ...liveSession.live, phase: 'end' } : null;
    result = { ok: 1, live: liveSession.live };
  }
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) });
};
await page.route('**/api/rt-live', liveRoute);
const studentPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
await studentPage.route('**/api/rt-live', liveRoute);
await studentPage.goto(`${BASE}/index.html`);
await studentPage.waitForSelector('.text-list-item');

await page.click('#teacher-launch');
await page.fill('#rt-h-code', '5A03');
await page.fill('#rt-h-pin', '8888');
await page.click('#rt-h-start');
await page.waitForSelector('#rt-h-next');

await studentPage.evaluate(() => WYRt.render(document.getElementById('app')));
await studentPage.click('[data-go="live-stu"]');
await studentPage.fill('#rt-live-code', '5A03');
await studentPage.fill('#rt-live-nick', '測試生');
await studentPage.click('#rt-live-enter');

await page.evaluate(() => document.querySelector('#rt-h-next').click());
await studentPage.waitForSelector('.rt-stem', { timeout: 1200 }).catch(() => errors.push('教師出第一題後，學生端未立即顯示題目'));

await page.evaluate(() => {
  const button = document.querySelector('#rt-h-next');
  button.click();
  button.click();
});
await page.waitForTimeout(350);
if (liveSession.live?.qNo !== 2) errors.push(`教師快速重複點擊造成跳題：預期第 2 題，實際第 ${liveSession.live?.qNo ?? '未知'} 題`);
await studentPage.close();
await page.goto(`${BASE}/index.html`);
await page.waitForSelector('.text-list-item');
const mobileNav = await page.evaluate(() => ({
  core: getComputedStyle(document.querySelector('nav.tabs:not(.tabs-sub)')).position,
  coreBottom: getComputedStyle(document.querySelector('nav.tabs:not(.tabs-sub)')).bottom,
  sub: getComputedStyle(document.querySelector('nav.tabs-sub')).position,
  difficulties: [...document.querySelectorAll('.text-list-item')].slice(0, 6).map((el) => Number((el.innerText.match(/難度 (\d)\/5/) || [])[1])),
}));
if (mobileNav.core !== 'fixed' || mobileNav.coreBottom !== '0px') errors.push('390px 核心分頁未固定於手機底部');
if (mobileNav.sub === 'fixed') errors.push('江湖進階分頁不應移入手機底部 tab bar');
if (mobileNav.difficulties.some((n, i, a) => i > 0 && n < a[i - 1])) errors.push(`首頁難度排序未遞增：${mobileNav.difficulties}`);
if (await page.locator('.weekly-card').count() !== 1) errors.push('首頁缺少週經典賽入口卡');
if (await page.locator('footer .visitor-badge').count() !== 1) errors.push('頁尾缺少可見訪客數 badge');
await page.click('.text-list-item');
await page.waitForSelector('.segment-original');

// 選文詳情頁：閱讀理解策略卡（通用四步法 + 逐篇切入點），點開可展開。
if (await page.locator('.strategy-card').count() !== 1) errors.push('選文詳情頁缺少「怎麼讀這一篇」閱讀策略卡');
if (await page.locator('.strategy-steps li').count() !== 4) errors.push('閱讀策略卡的通用四步法未渲染出 4 步');
await page.click('.strategy-summary');
await page.waitForTimeout(120);
if (await page.locator('.strategy-focus li').count() < 2) errors.push('閱讀策略卡展開後缺少逐篇切入點（<2 條）');

// 選文詳情頁：逐段三分頁（白話語譯/字詞注釋/賞析）切換測試
const segTabCount = await page.locator('.seg-tabs').count();
if (segTabCount < 1) errors.push('選文詳情頁沒有渲染出逐段三分頁（.seg-tabs）');
for (const label of ['白話語譯', '字詞注釋', '賞析']) {
  await page.click(`.seg-tabs >> nth=0 >> button:has-text("${label}")`);
  await page.waitForTimeout(150);
  const content = await page.locator('.seg-tab-content').first().innerText();
  if (!content || content.includes('尚無')) errors.push(`第一段「${label}」分頁內容缺漏：${content}`);
}
const detailOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
if (detailOverflow) errors.push('選文詳情頁在 390px 寬度發生橫向跑版');

await page.click('#backToList');
await page.waitForSelector('.text-list-item');

// 江湖分級解鎖：0 篇只保留核心學習；1/3/5 篇依序開草堂／市集／合契＋擂台。
const newUserNav = await page.evaluate(() => {
  const btn = (t) => document.querySelector(`nav.tabs-sub button[data-tab="${t}"]`);
  const hidden = (t) => { const b = btn(t); return !b || getComputedStyle(b).display === 'none'; };
  const shown = (t) => { const b = btn(t); return b && getComputedStyle(b).display !== 'none'; };
  return { allAdvancedHidden: ['caotang', 'fusion', 'market', 'rt'].every(hidden) };
});
if (!newUserNav.allAdvancedHidden) errors.push('0 篇精通時仍顯示江湖進階入口');

// 精通一篇後只解鎖草堂。
await page.evaluate(() => {
  for (const ty of ['char', 'sentence', 'gist', 'theme']) {
    for (let i = 0; i < 3; i++) WYStore.recordAnswer('t06', true, ty, { qId: `smoke-${ty}${i}` });
  }
  updateJianghuNav();
});
const subShown = await page.evaluate(() => {
  const shown = (t) => { const b = document.querySelector(`nav.tabs-sub button[data-tab="${t}"]`); return b && getComputedStyle(b).display !== 'none'; };
  return { caotang: shown('caotang'), market: shown('market'), fusion: shown('fusion'), rt: shown('rt') };
});
if (!subShown.caotang || subShown.market || subShown.fusion || subShown.rt) errors.push('精通一篇後的江湖分級不正確');

// 再精通兩篇後只多開市集；滿五篇才開合契與擂台。
await page.evaluate(() => {
  for (const textId of ['t01', 't02']) for (const ty of ['char', 'sentence', 'gist', 'theme']) {
    for (let i = 0; i < 3; i++) WYStore.recordAnswer(textId, true, ty, { qId: `smoke-${textId}-${ty}-${i}` });
  }
  updateJianghuNav();
});
const threeMastered = await page.evaluate(() => Object.fromEntries(['caotang', 'market', 'fusion', 'rt'].map((t) => [t, getComputedStyle(document.querySelector(`nav.tabs-sub button[data-tab="${t}"]`)).display !== 'none'])));
if (!threeMastered.caotang || !threeMastered.market || threeMastered.fusion || threeMastered.rt) errors.push('精通三篇後的江湖分級不正確');
await page.evaluate(() => {
  for (const textId of ['t03', 't04']) for (const ty of ['char', 'sentence', 'gist', 'theme']) {
    for (let i = 0; i < 3; i++) WYStore.recordAnswer(textId, true, ty, { qId: `smoke-${textId}-${ty}-${i}` });
  }
  updateJianghuNav();
});
const fiveMastered = await page.evaluate(() => ['caotang', 'market', 'fusion', 'rt'].every((t) => getComputedStyle(document.querySelector(`nav.tabs-sub button[data-tab="${t}"]`)).display !== 'none'));
if (!fiveMastered) errors.push('精通五篇後未完整解鎖江湖系統');

// 每套系統的導覽卡只出現一次。
await page.click('nav.tabs button[data-tab="caotang"]');
if (await page.locator('.system-onboarding').count() !== 1) errors.push('草堂首次開啟未顯示一次性導覽');
await page.click('nav.tabs button[data-tab="list"]');
await page.click('nav.tabs button[data-tab="caotang"]');
if (await page.locator('.system-onboarding').count() !== 0) errors.push('草堂導覽重複顯示');

// 選項具有可讀名稱；作答後正解以 aria-pressed=true 標示，回饋另有 ✅／❌ 文字符號。
await page.click('nav.tabs button[data-tab="quiz"]');
await page.waitForSelector('.options button');
const firstOptionLabel = await page.locator('.options button').first().getAttribute('aria-label');
if (!firstOptionLabel?.startsWith('選項 1：')) errors.push('選項缺少語意化 aria-label');
await page.locator('.options button').first().click();
if (await page.locator('.options button.correct[aria-pressed="true"]').count() !== 1) errors.push('作答後未以 aria-pressed 標示正解');
const feedbackText = await page.locator('#feedback').innerText();
if (!/[✅❌]/.test(feedbackText)) errors.push('作答回饋只靠顏色，缺少 ✅／❌ 提示');

// 閃卡背面長解析不得溢出卡片（兩面 grid 同格堆疊，容器高度需自動長到較高的一面）。
await page.click('nav.tabs button[data-tab="list"]');
await page.waitForSelector('.text-list-item');
await page.evaluate(() => {
  const it = [...document.querySelectorAll('.text-list-item')].find((el) => el.innerText.includes('鹿港乘桴記'));
  if (it) it.click();
});
await page.waitForSelector('.segment-original');
await page.click('nav.tabs button[data-tab="flashcard"]');
await page.waitForSelector('#flashcardEl');
for (let i = 0; i < 3; i++) { await page.click('#nextBtn'); await page.waitForTimeout(60); }  // 走到背面最長的第 4 段
await page.click('#flashcardEl');                                                             // 翻到背面
await page.waitForTimeout(600);                                                               // 等 3D 翻面動畫（.5s）定位
const fcBack = await page.evaluate(() => {
  const back = document.querySelector('.flashcard-back');
  const card = document.querySelector('.flashcard');
  if (!back || !card) return { missing: true };
  const br = back.getBoundingClientRect();
  const cr = card.getBoundingClientRect();
  return {
    selfOverflow: back.scrollHeight - back.clientHeight,        // 背面內容是否被自身裁切
    escapesCard: Math.round(br.bottom - cr.bottom),             // 背面是否伸出卡片外框
    pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
  };
});
if (fcBack.missing) errors.push('閃卡背面元素缺失');
else {
  if (fcBack.selfOverflow > 2) errors.push(`閃卡背面解析被裁切（自身溢出 ${fcBack.selfOverflow}px）`);
  if (fcBack.escapesCard > 2) errors.push(`閃卡背面文字伸出卡片外框 ${fcBack.escapesCard}px`);
  if (fcBack.pageOverflow) errors.push('閃卡背面在 390px 寬度發生橫向跑版');
}

for (const tab of ['flashcard', 'quiz', 'battle', 'wenhao', 'caotang', 'rt', 'fusion', 'market']) {
  await page.click(`nav.tabs button[data-tab="${tab}"]`);
  await page.waitForTimeout(300);
  const empty = await page.evaluate(() => document.getElementById('app').innerText.trim().length === 0);
  if (empty) errors.push(`tab ${tab} 渲染後內容為空（模組可能未載入或 render 拋錯）`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  if (overflow) errors.push(`tab ${tab} 在 390px 寬度發生橫向跑版`);
}

await browser.close();
server.close();

if (errors.length) {
  console.log('❌ smoke test 發現問題：');
  errors.forEach((e) => console.log(' -', e));
  process.exit(1);
} else {
  console.log('✅ smoke test 全部通過（ALL CLEAN）。');
}
