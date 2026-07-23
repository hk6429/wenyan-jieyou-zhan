import { readFileSync } from 'node:fs';

const files = ['index.html', 'js/app.js', 'js/caotang-ui.js'];
const sources = Object.fromEntries(files.map((f) => [f, readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')]));
const errors = [];
for (const [file, src] of Object.entries(sources)) {
  for (const match of src.matchAll(/<div\b[^>]*role=["']button["'][^>]*>/g)) {
    if (!/tabindex=["']0["']/.test(match[0])) errors.push(`${file} role=button 缺 tabindex=0：${match[0]}`);
  }
}
for (const token of ["e.key === 'Enter'", "e.key === ' '"]) {
  if (!sources['js/app.js'].includes(token) || !sources['js/caotang-ui.js'].includes(token)) errors.push(`鍵盤處理缺少 ${token}`);
}

const rgb = (hex) => hex.match(/[\da-f]{2}/gi).map((x) => Number.parseInt(x, 16) / 255);
const luminance = (hex) => rgb(hex).map((c) => c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4).reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + .05) / (lo + .05);
};
const pairs = [
  ['一般小字 ink-dan/paper', '6b5f52', 'f7f2e7'],
  ['朱色文字 zhu/paper', '9e3b2c', 'f7f2e7'],
  ['白字/zhu', 'ffffff', '9e3b2c'],
  ['白字/qing-shi', 'ffffff', '3a5a6e'],
  ['白字/dai', 'ffffff', '3b5d4f'],
];
for (const [name, fg, bg] of pairs) {
  const ratio = contrast(fg, bg);
  console.log(`${name}：${ratio.toFixed(2)}:1`);
  if (ratio < 4.5) errors.push(`${name} 未達 4.5:1`);
}
if (errors.length) {
  console.log(`❌ a11y 稽核 ${errors.length} 項未通過`);
  errors.forEach((e) => console.log(` - ${e}`));
  process.exit(1);
}
console.log('✅ a11y 靜態稽核全部通過（ALL CLEAN）。動態焦點順序與光效仍需實機視覺確認。');
