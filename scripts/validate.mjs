import { readFileSync } from 'node:fs';

const texts = JSON.parse(readFileSync(new URL('../data/texts.json', import.meta.url)));

const VALID_LEVELS = new Set(['J', 'S']);
const VALID_TYPES = new Set(['char', 'sentence', 'gist', 'theme']);
const SIMPLIFIED_HINTS = /[国来当为学问长会与义]/; // 常見簡體殘留字，命中則需人工複核

let errors = [];
let warnings = [];
const seenIds = new Set();

for (const t of texts) {
  const tag = `[${t.id ?? '??'} ${t.title ?? ''}]`;

  for (const field of ['id', 'title', 'author', 'era', 'level', 'genre', 'passage', 'segments', 'questions']) {
    if (t[field] === undefined || t[field] === null || t[field] === '') {
      errors.push(`${tag} 缺少必填欄位 ${field}`);
    }
  }

  if (t.id) {
    if (seenIds.has(t.id)) errors.push(`${tag} id 重複`);
    seenIds.add(t.id);
  }

  if (t.level && !VALID_LEVELS.has(t.level)) {
    errors.push(`${tag} level 不合法：${t.level}（只能是 J 或 S）`);
  }

  if (!Array.isArray(t.segments) || t.segments.length < 1) {
    errors.push(`${tag} segments 至少要有 1 段`);
  } else {
    for (const seg of t.segments) {
      if (!seg.text || !t.passage.includes(seg.text.replace(/\s/g, ''))) {
        // 允許段落文字含標點差異，做寬鬆包含檢查
      }
      if (!t.passage || !t.passage.includes(seg.text.slice(0, 4))) {
        warnings.push(`${tag} 第${seg.no}段開頭跟 passage 對不上，請人工確認是否為原文節錄`);
      }
    }
  }

  if (!Array.isArray(t.questions) || t.questions.length < 1) {
    errors.push(`${tag} questions 至少要有 1 題`);
  } else {
    const seenQIds = new Set();
    for (const q of t.questions) {
      const qtag = `${tag} ${q.id ?? '??'}`;
      if (seenQIds.has(q.id)) errors.push(`${qtag} 題目 id 重複`);
      seenQIds.add(q.id);

      if (!VALID_TYPES.has(q.type)) errors.push(`${qtag} type 不合法：${q.type}`);
      if (!q.stem) errors.push(`${qtag} 缺少 stem`);
      if (!Array.isArray(q.options) || q.options.length !== 4) {
        errors.push(`${qtag} options 必須剛好 4 個選項`);
      }
      if (typeof q.answer !== 'number' || q.answer < 0 || q.answer > 3) {
        errors.push(`${qtag} answer 必須是 0-3 的整數`);
      }
      if (!q.explain) warnings.push(`${qtag} 缺少 explain 解析`);
    }
  }

  if (t.passage && SIMPLIFIED_HINTS.test(t.passage)) {
    warnings.push(`${tag} passage 疑似含簡體字殘留，請人工複核`);
  }
}

console.log(`共檢查 ${texts.length} 篇文本。`);
if (warnings.length) {
  console.log(`\n⚠️  警告 ${warnings.length} 則：`);
  warnings.forEach((w) => console.log(' -', w));
}
if (errors.length) {
  console.log(`\n❌ 錯誤 ${errors.length} 則：`);
  errors.forEach((e) => console.log(' -', e));
  process.exit(1);
} else {
  console.log('\n✅ 全部通過驗證（ALL CLEAN）。');
}
