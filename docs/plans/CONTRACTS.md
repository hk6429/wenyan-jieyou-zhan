# 文言解憂站改版 — 子系統實作契約（所有 subagent 必讀，介面簽名寫死不可漂移）

母版路徑：`~/Library/Mobile Documents/com~apple~CloudDocs/naicheng-claude-agent/文言解憂站/`
設計總綱：`docs/plans/2026-07-20-wenyan-revamp-design.md`
機制級參考（可讀取移植，但資料形狀要改）：`~/…/100_Todo/projects/字字珠璣/docs/superpowers/plans/2026-07-20-zizizhuji-{rtbattle,shuyuan,fusion,market}.md`

## 架構鐵律（違反即無法整合）

1. **純前端無 build、無框架、無 import/export（前端）**：所有前端模組是 IIFE，掛一個全域物件（如 `window.WYCaotang`），用 `<script>` 載入。**後端 `functions/` 與 `test/*.mjs` 可用 ESM**（Node 22.22 / Cloudflare Functions 支援）。
2. **前端禁用相對路徑呼叫後端**：一律走 `WYAPI.call('/api/...')`（見 `js/wyapi.js`，已建好）。禁止 `fetch('api/...')`。
3. **檔案所有權——你只能新增自己的檔，禁止編輯這些共用檔**：`index.html`、`js/app.js`、`js/store.js`、`js/wyapi.js`、`css/main.css`、`scripts/validate.mjs`、`test/smoke.mjs`。這些由主線程最後整合時統一改。若你需要 CSS，**自己新增 `css/<你的模組>.css`**。
4. **整合交接**：每個模組在回報時，**必須附一段「整合筆記」**，明確列出主線程要在 index.html 加哪些 `<script>`／`<link>`／nav tab button，以及要在 app.js 的 `renderTab()` 加哪條路由、`boot()` 加哪個 init 呼叫。
5. **繁體台灣用語**；文言腔台詞可用但別出簡體。
6. **美術資產尚未生成**：所有 `<img>` 指向 `assets/…` 的新圖檔，一律加 `onerror` fallback（隱藏或替換為 emoji/純色底），確保缺圖時 UI 不破。圖檔路徑請在整合筆記列一張「待生圖清單」。

## 你可以依賴的既有全域（已存在，直接用，別重寫）

```js
// js/store.js —— 已加好墨錠與班級碼
WYStore.load() / .save(state)
WYStore.getTextState(textId) // {seen,correct,total,mastered}
WYStore.recordAnswer(textId, isCorrect) // 答對自動 +2 墨錠
WYStore.masteryRatio(textId) // 0~1
WYStore.allMastered() // → [textId,…] 已精通(答對率≥80%且≥8題)篇目
WYStore.touchStreak() / .getStreak() // {last,days}
WYStore.getInk() // → number 墨錠餘額
WYStore.addInk(delta) // delta 可負，回異動後餘額（不低於0）
WYStore.spendInk(amount) // 夠才扣回 true，不夠回 false
WYStore.getClassCode() // → 'ABCD1' | null
WYStore.setClassCode(code) // 正規化(去空白/大寫/英數/4~8碼)後存，回存的值或 null

// js/quiz.js —— 出題器，已支援 seed（即時對戰同機出題靠它）
WYQuiz.init(allTexts)
WYQuiz.buildQuiz(textId, { type = null, seed = Date.now() })
//   → { title, textId, questions:[{id,stem,options:[4],answerIdx,explain,type}] }
//   同一 (textId, type, seed) 保證題序＋選項序完全相同 → 雙機一致
WYQuiz.typeLabel(type) // char字義/sentence句義/gist段旨/theme篇章文意
WYQuiz.seededShuffle(arr, seed)

// js/battle.js —— PvE 純函式核心（不要改它）
WYBattle.ROSTER // [{id,name,hp,atk,unlockText:'tNN',img},…] 27 人
WYBattle.newBattle(opponentId) // → {opponent,player,combo,log}
WYBattle.resolveAnswer(state, isCorrect) // → 新 state（combo 封頂、勝負旗標）
WYBattle.unlockedRoster() // → ROSTER 每項加 .unlocked

// 全域 TEXTS（boot 時 fetch data/texts.json 得到）
// 每篇：{id:'tNN',title,author,era,level:'J'|'S',genre,passage,
//        segments:[{no,text,note,translation,glossary:[{word,gloss}]}],
//        questions:[{id,stem,options:[4],answer:0..3,explain,type}]}
```

## 後端地基契約（擂台 subagent 負責建；市集之後 import，勿重建）

- 平台：Cloudflare Pages Functions + D1，wrangler binding 名 `wenyan_db`（wrangler.toml 由擂台建）。
- D1 四表 kv/hash/list/zset（`IF NOT EXISTS`，可重複執行）＋惰性 TTL 過期，schema 附在 `schema.sql`。**移植自** `~/projects/vocab-duel/functions/api/_redis.js`（206 行）與其 `schema.sql`。
- `functions/api/_kv.js` 匯出 `kvFor(db)`，方法語意同 Upstash Redis：`get/set/incr/del/exists/expire`、`hget/hgetall/hset/hlen`、`lpush/lrange/ltrim`、`zadd/zincrby/zrange/zrem/zremrangebyrank`。get 一律回原始字串或 null，呼叫端防禦式 `JSON.parse`。
- **金鑰命名空間分離**：擂台 key 前綴 `wy_rt:`、合契 `wy_fuse:`、市集 `wy_mkt:`；需簽章者用 `env.WY_HMAC_SECRET`（Pages 環境變數，不入版控）。
- 前端呼叫一律 `WYAPI.call('/api/rt-room', {body:{op,…}})`。

## 各子系統要交付的全域與進場點（主線程據此整合）

| 子系統 | 全域物件 | 進場 API（主線程會呼叫） | nav tab 文字 |
|---|---|---|---|
| 解憂草堂 | `WYCaotang` | `WYCaotang.render(mountEl)`＋`WYCaotang.init(TEXTS)` | 草堂 |
| 文戰擂台 | `WYRt` | `WYRt.render(mountEl)`＋`WYRt.init(TEXTS)` | 擂台 |
| 文魄合契 | `WYFusion` | `WYFusion.render(mountEl)`＋`WYFusion.init(TEXTS)` | 合契 |
| 文房市集 | `WYMarket` | `WYMarket.render(mountEl)`＋`WYMarket.init(TEXTS)` | 市集 |

- `render(mountEl)`：mountEl 是 `document.getElementById('app')`，你負責清空並渲染自己的畫面與綁事件。
- `init(TEXTS)`：boot 時呼叫一次（可省，若不需要 TEXTS 就別要求主線程呼叫）。
- 別自己搶 nav：不要動 index.html 的 `<nav>`；在整合筆記告訴主線程加哪個 button 即可。

## 驗證要求

- 有純邏輯的（rtbattle 記帳、合契資格、市集驗貨、草堂 derive）→ 附 `test/**/*.test.mjs`，用 `node --test` 可跑綠。
- 後端 → 附 wrangler `--local` 煙霧測試指令與預期輸出。
- 回報時附：新增檔案清單、跑過的測試證據、整合筆記、待生圖清單。**不可只說「已完成」。**
