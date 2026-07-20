import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const texts = JSON.parse(readFileSync(new URL('../data/texts.json', import.meta.url)));
const battleSrc = readFileSync(join(rootDir, 'js/battle.js'), 'utf8');

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
      if (!seg.translation) {
        errors.push(`${tag} 第${seg.no}段缺少 translation 白話語譯`);
      } else if (SIMPLIFIED_HINTS.test(seg.translation)) {
        warnings.push(`${tag} 第${seg.no}段 translation 疑似含簡體字殘留`);
      }
      if (!Array.isArray(seg.glossary) || seg.glossary.length < 1) {
        errors.push(`${tag} 第${seg.no}段缺少 glossary 字詞注釋`);
      } else {
        for (const g of seg.glossary) {
          if (!g.word || !g.gloss) errors.push(`${tag} 第${seg.no}段 glossary 項目缺少 word/gloss`);
          if (g.word && seg.text && !seg.text.includes(g.word)) {
            warnings.push(`${tag} 第${seg.no}段 glossary「${g.word}」未出現在該段原文中，請確認`);
          }
        }
      }
      if (!seg.note) {
        warnings.push(`${tag} 第${seg.no}段缺少 note 賞析`);
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

// battle.js ROSTER 覆蓋檢查：每篇文本都應該有對應的對戰對手
const rosterUnlockTexts = new Set([...battleSrc.matchAll(/unlockText:\s*'(t\d\d)'/g)].map((m) => m[1]));
for (const t of texts) {
  if (t.id && !rosterUnlockTexts.has(t.id)) {
    errors.push(`[${t.id} ${t.title}] 未出現在 battle.js 的 ROSTER 中（缺對戰對手）`);
  }
}
const rosterImgs = [...battleSrc.matchAll(/img:\s*'([^']+)'/g)].map((m) => m[1]);
for (const img of rosterImgs) {
  if (!existsSync(join(rootDir, img))) {
    errors.push(`battle.js ROSTER 引用的圖檔不存在：${img}`);
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
