# 文言解憂站後端上線指令清單（使用者自行執行）

即時對戰（文戰擂台）與交易（文房市集）需要 Cloudflare Pages Functions + D1。
草堂／合契／單機對戰是純前端，不需後端也能玩。

後端只跑在 **Cloudflare Pages** 一個平台（vercel／netlify 鏡像站透過 WYAPI 打絕對網址）。
以下指令請在 CF 部署副本目錄執行：`cd ~/projects/wenyan-jieyou-zhan-cf`
（部署時我會先把母版的 `functions/`、`wrangler.toml`、`schema.sql` 同步過去）。

前置：`npx wrangler login`（若還沒登入 Cloudflare）。

---

## Phase A — 一次性帳號設定

### 1. 建立 D1 資料庫，取得 database_id
```bash
npx wrangler d1 create wenyan-jieyou-zhan-db
```
輸出會有一行 `database_id = "xxxxxxxx-...."`，複製它。

### 2. 把 database_id 填進 wrangler.toml
編輯 `wrangler.toml`，把 `REPLACE_WITH_D1_DATABASE_ID` 換成上一步的值：
```toml
[[d1_databases]]
binding = "wenyan_db"
database_name = "wenyan-jieyou-zhan-db"
database_id = "剛剛複製的 id"
```

### 3. 套用資料表結構到「正式」D1（--remote）
```bash
npx wrangler d1 execute wenyan-jieyou-zhan-db --remote --file=schema.sql
# 驗證四張表都在：
npx wrangler d1 execute wenyan-jieyou-zhan-db --remote \
  --command="SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
# 預期看到：hash, kv, list, zset
```

### 4. 設定市集簽章密鑰（HMAC）
```bash
openssl rand -hex 32          # 產一組隨機密鑰，複製輸出
npx wrangler pages secret put WY_HMAC_SECRET --project-name wenyan-jieyou-zhan
# 互動式貼上剛剛那組值。這個值不入版控、只存在 Cloudflare。
```
⚠️ **不要**設 `WY_MKT_FORCE_OPEN`（那是本機測試用來繞過「週五才開市」的旗標，正式站設了會全天開市）。

---

## Phase B — 部署（跟整套改版一起，等你說「部署」時我做）

1. 我把母版的 `functions/`、`wrangler.toml`（已填 id）、`schema.sql`＋所有前端與 128MB 美術資產同步進 `~/projects/wenyan-jieyou-zhan{,-cf,-netlify}`。
2. CF Pages 部署（含 Functions＋D1 綁定）：
   ```bash
   cd ~/projects/wenyan-jieyou-zhan-cf
   npx wrangler pages deploy . --project-name=wenyan-jieyou-zhan --branch=master
   ```
3. Vercel／Netlify 照舊部署純前端（它們沒有 Functions，即時對戰／市集會透過 WYAPI 打到 CF Pages 的絕對網址，所以三站的這兩個功能都連同一個 CF 後端）。

---

## 上線後快速自驗
```bash
# 房間 API 活著（過期房號會回錯誤，代表後端有在跑）：
curl -s -X POST https://wenyan-jieyou-zhan.pages.dev/api/rt-room \
  -H 'Content-Type: application/json' -d '{"op":"poll","code":"0000","role":"p1"}'
# 市集瀏覽：
curl -s -X POST https://wenyan-jieyou-zhan.pages.dev/api/market \
  -H 'Content-Type: application/json' -d '{"op":"list","classCode":"TEST","scope":"class"}'
# 預期回 JSON（{"ok":...}），不是 404/HTML。
```

## 備註
- D1 免費額度：每天 500 萬列讀、10 萬列寫，班級規模綽綽有餘。
- 三系統共用同一 D1，key 前綴分離（`wy_rt:` / `wy_fuse:` / `wy_mkt:`），無互相污染。
- 之後要改密鑰：重跑 Phase A 第 4 步即可。
