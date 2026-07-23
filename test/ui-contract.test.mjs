import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../css/main.css', import.meta.url), 'utf8');

test('360px 手機寬度可容納五個主分頁，首屏 hero 高度不超過 150px', () => {
  assert.match(css, /nav\.tabs button\s*\{[^}]*min-width:\s*68px/s);
  assert.match(css, /@media \(max-width:\s*480px\)[\s\S]*header\.hero\s*\{\s*min-height:\s*150px;/);
});

test('選項按鈕提供可讀名稱，作答後以 aria-pressed 標示正解，且保留非顏色提示', () => {
  assert.match(app, /aria-label="選項 \$\{i \+ 1\}：\$\{opt\}"/);
  assert.match(app, /setAttribute\('aria-pressed',\s*bi === q\.answerIdx \? 'true' : 'false'\)/);
  assert.ok(app.includes('✅ 答對了！'));
  assert.ok(app.includes('❌'));
});
