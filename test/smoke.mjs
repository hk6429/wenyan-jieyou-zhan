// 端到端煙霧測試：選文 → 閃卡 → 自測 → 對戰 → 文豪錄，390px 手機寬度不跑版、無 console error。
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

const server = createServer(async (req, res) => {
  try {
    const path = req.url === '/' ? '/index.html' : req.url;
    const data = await readFile(join(ROOT, path));
    res.writeHead(200, { 'Content-Type': MIME[extname(path)] || 'text/plain' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});

await new Promise((r) => server.listen(8099, r));

const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
// 忽略尚未生成的美術圖檔 404（皆有 onerror fallback 接住，非程式錯誤）；真正的 JS 例外走 pageerror 捕捉
page.on('console', (msg) => {
  if (msg.type() !== 'error') return;
  const t = msg.text();
  if (/Failed to load resource/.test(t) || /404/.test(t)) return;
  errors.push(t);
});
page.on('pageerror', (err) => errors.push(String(err)));

await page.goto('http://localhost:8099');
await page.waitForSelector('.text-list-item');
await page.click('.text-list-item');
await page.waitForSelector('.segment-original');

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
