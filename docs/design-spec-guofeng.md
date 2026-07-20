# 文言解憂站｜國風水墨視覺設計規劃書 v1.0

整合三位設計顧問提案（視覺風格系統／Q版人物美術／版面體驗），核心心法：
**水墨是舞台，文言原文是主角。裝飾密度跟「認知負荷」成反比——越要動腦讀字的頁面，
潑墨越退到背景；越是情緒獎勵的頁面（對戰、文豪錄），潑墨才上前台。**

## 1. 色彩系統（可直接貼入 `:root`）

```css
:root {
  /* 墨階（濃淡乾濕清五色） */
  --ink-jiao:#1a1613; --ink-nong:#2b2420; --ink-zhong:#4a4038;
  --ink-dan:#7d726a; --ink-qing:#b8ab9c; --ink-xi:#d9cfc0;

  /* 宣紙（生宣／熟宣／陳紙三階層次） */
  --paper:#f7f2e7; --paper-warm:#efe6d3; --paper-aged:#e6d9bf;

  /* 點綴色（每色兩階：重色描邊、淡色鋪底） */
  --zhu:#9e3b2c; --zhu-light:#c85a45;       /* 朱砂：主行動/答對/正解/印章 */
  --yan:#8a3d4a;                             /* 胭脂：扣血/錯誤/警示 */
  --qing-shi:#3a5a6e; --qing-shi-light:#5c7f94; /* 石青：資訊/連結/次要標籤 */
  --dai:#3b5d4f;                              /* 黛綠：已解鎖/完成 */

  /* 沿用舊變數名，不必改 markup */
  --accent: var(--zhu); --accent2: var(--dai); --ink: var(--ink-nong);

  /* 字體 */
  --font-brush:"Ma Shan Zheng","LXGW WenKai TC",cursive;   /* 標題/文豪名/技能名，≥28px才用 */
  --font-read:"Noto Serif TC","LXGW WenKai TC",serif;       /* 正文/文言原文，禁止整段用書法字 */
  --font-ui:"Noto Sans TC",system-ui,sans-serif;

  /* 墨影（取代藍灰陰影） */
  --shadow-paper:0 6px 18px rgba(26,22,19,.10);
  --shadow-lift:0 10px 30px rgba(26,22,19,.16);
}
```

**⚠️ 對比度紅線**：正文文字對背景 ≥ 4.5:1（建議直接做到 7:1 AAA），焦墨配米白
極易達標。**淡墨灰（`--ink-dan` 以下）絕不可承載正文文字**，只能當裝飾線、頁碼、
禁用態。朱砂當小字文字要另外驗證對比，優先用在深底上。

## 2. 紋理質感（純 CSS / 內嵌 SVG，零外部資源，手機端效能優先）

- 全站底噪宣紙紋：一個 `feTurbulence` SVG data-URI，`opacity 0.03–0.05`，**只放一層**、
  放在不滾動的固定背景層（多層 SVG 濾鏡疊加會拖手機效能，全站限用這一處）。
- 墨暈邊框：多個偏心 `radial-gradient`（不同 `at x% y%`、不同橢圓比例）疊出不規則暈染，
  避免圓形對稱感。
- 毛筆飛白邊：卡片外框用 `feDisplacementMap` 打亂矩形邊緣，或退而求其次用手繪
  SVG 筆觸框當 `border-image`（效能更省）。
- **效能紅線**：避免大面積 `blur()`/`backdrop-filter`（逐像素運算，中低階手機會掉幀）；
  裝飾動畫只動 `transform`/`opacity`（GPU 合成）；務必接 `prefers-reduced-motion`；
  紙紋理用可平鋪小圖（128×128 tile）而非整頁大圖。

## 3. 文言原文排版（可讀性是命脈，不可為風格犧牲）

- 字級：手機 18–20px，桌機 20–22px；行高 **1.9–2.1**（文言需上下對照斷句，行距要疏朗）；
  字距 `letter-spacing: 0.03–0.05em`。
- **正文一律用思源宋體，禁止整段用書法字型**（行書/隸書辨識成本高，書法字只留給
  標題、文豪名、按鈕短詞這類「幾個字不需逐字讀」的地方）。
- 橫排為主，不強上直排 `vertical-rl`（手機滾動與選字互動不友善）；國風感靠卷軸
  軸頭、印章、邊框營造，不必真的直式排版。
- 點選答題熱區 ≥ 44×44px，被選字用朱紅圈點/底線標示（不改字色，保持原文對比）。

## 4. 五分頁裝飾密度分配

| 分頁 | 密度 | 做法 |
|---|---|---|
| 選文 | **最低** | 四角淡墨飛白＋捲軸軸頭，中央閱讀區維持近純米白，文字後方禁止鋪紋理 |
| 閃卡 | 中 | 潑墨放**卡背**（翻面時），正面維持高對比純底；邊框走朱紅點綴 |
| 自測 | 低到中 | 題幹區素底，潑墨反饋**綁在答對/答錯的瞬間事件**，不做常駐背景裝飾 |
| 對戰 | **高** | 潑墨技能特效、水墨粒子、Q版立繪登場動畫，這裡是情緒高點可以放手做 |
| 文豪錄 | 中到高 | 人物立繪可佔大版面＋潑墨背景，但生平文字說明區塊仍要回素底卡片 |

導覽維持現有頂部五分頁扁平結構（**不改成書卷抽屜式**，那會犧牲手機可用性），
只換皮：分頁做成匾額造型、active 態用印章底或墨染底線（**不能只靠顏色深淺
區分**，色弱使用者需要額外的線索如底線/粗體）。

## 5. Q版潑墨人物規格

**核心心法：外實內虛**——輪廓線用中鋒濃墨勾一圈連續乾淨線（Q版剪影一眼可辨），
色塊內部才潑墨渲染，渲染絕不越過外輪廓線。頭身比 1.6:1～2:1，五官只勾眼眉嘴
三件套（濃墨圓點眼、書法一撇眉），手腳極簡化，臉頰大面積留白。

主色 85% 走水墨黑白灰四階，彩色（朱砂/石青）僅 15% 點綴，**一個角色限用一種
彩色主調**。頭髮鬍鬚用枯筆飛白（這是把日系Q版拉回國畫感的關鍵）。動作特效
一律用墨點噴濺＋枯筆掃痕，不用日系放射線/光效粒子，背景計白當黑。

**三位既有角色設計方向**：
- **諸葛亮**（誡子書/出師表）：寬袖鶴氅＋羽扇綸巾，代表色石青，兩種狀態外觀
  （誡子書居家淡墨袍／出師表深墨戰袍）。
- **陶淵明**（五柳先生傳）：粗布葛衣、衣襬飛白最多，道具菊花＋酒葫蘆，代表色
  淡赭／菊黃，赤足抱膝閉眼悠然。
- **燭之武**（燭之武退秦師）：老者深衣佝僂但眼神銳利，道具燈燭／繩索，代表色
  朱砂，拱手前傾作說服狀。

**AI 生圖 prompt 骨架**（正向關鍵詞優先序：chibi proportions → ink wash/splash ink
→ calligraphic outline → flying-white brush → xieyi → vermilion accent → negative
space）：
```
chibi character, exaggerated 2-heads-tall proportions, big head tiny body,
simplified facial features (two ink-dot eyes, single brush-stroke eyebrows,
no realistic highlights), 【角色描述：服飾/道具/代表色】,
traditional Chinese ink painting style, splash-ink (potangmo) wash filling
the robe with gradient from dark to dry-brush light, clean bold calligraphic
outline (zhongfeng brush) around the silhouette, flying-white (feibai)
dry-brush hair and beard, xieyi freehand brushwork, sumi-e, rice-paper
texture background, generous negative space, minimal vermilion accent,
splattered ink dots as effect, white background, full-body sprite
```
負向詞：`anime, manga, cel shading, glossy eyes, star highlights, neon,
3D render, over-saturated colors, muddy grey blur, realistic anatomy,
five detailed fingers`

輸出規格：PNG 透明背景；對戰立繪 3:4（1200×1600）；文豪錄頭像 1:1
（800×800，胸像，識別道具入鏡）。

## 6. 實作優先順序（風險低→高）

1. **色彩系統＋字體換皮**（純 CSS 變數，不動 DOM，可隨時回退）
2. **卡片/按鈕/邊框國風點綴**（宣紙紋理、印章朱紅、墨影）
3. **分頁列匾額化**（active 態印章底，不改互動範式）
4. **事件綁定式潑墨動畫**（自測對錯反饋、閃卡翻面，先接 `prefers-reduced-motion`）
5. **文豪錄／對戰的Q版潑墨人物立繪**（需生圖資源，效能風險較高，只影響這兩頁）
6. **（不建議做）版面結構性改造**：捲軸抽屜式導覽、強制直排原文——扁平分頁＋
   換皮已足夠國風感，這類改動風險最高、效益最低。

**收尾守則**：每加一層裝飾，回選文頁與自測頁實測「讀字答題有沒有變慢變難」，
一旦核心讀寫體驗被裝飾拖累，退回上一版。
