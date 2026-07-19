# 部署檢查清單

- [ ] `node scripts/validate.mjs` 全綠
- [ ] Playwright smoke test（選文→閃卡→自測→對戰→文豪錄，390px 手機寬度不跑版）
- [ ] Vercel：`vercel --prod`
- [ ] Cloudflare Pages：`wrangler pages deploy . --project-name=wenyan-jieyou-zhan`
- [ ] Netlify：`netlify deploy --prod`
- [ ] 三平台 `vercel.json` / `_headers` 的 CSP 內容一致
- [ ] 更新 memory：三平台網址、副本路徑
