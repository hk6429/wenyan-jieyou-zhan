# 文言解憂站

國中、高中文言文閱讀理解練功站。字義／句義／段旨／篇章文意判讀四類題型，
搭配閃卡複習、PvE 對戰、「文豪錄」收藏養成。

## 資料範圍（MVP）

- 國中：誡子書、五柳先生傳、燭之武退秦師（暫列高中，見下）、出師表（暫列高中）……
  實際範圍與各篇 `level` 以 `data/texts.json` 為準。
- 高中：108課綱 15 篇推薦選文（逐步補齊中）。

## 本機預覽

```
python3 -m http.server 8080
```
瀏覽器開 `http://localhost:8080`。

## 資料驗證

```
node scripts/validate.mjs
```

## 資料結構

見 `data/texts.json`，每篇文本含 `passage`（原文全文）、`segments`（分段，供段旨題使用）、
`questions`（`type` 為 char/sentence/gist/theme 四種題型）。
