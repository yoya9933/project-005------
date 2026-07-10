# 成大獎學金監控

## 執行監控

```powershell
node monitor_scholarships.js
```

## 主要檔案

- `monitor_sources.md`：監控來源、關鍵字、分類規則與已確認子頁。
- `scholarship_watch.csv`：可申請或值得追蹤的獎學金/補助連結。
- `application_ideas.md`：每筆獎學金的申請想法與專題成果包裝策略。
- `monitor_results/`：每次監控產生的 Markdown 報告。

## 目前判斷規則

腳本會先抓每個來源頁面，再找出標題或網址含有下列核心詞的連結：

```text
獎學金
獎助學金
助學金
補助
scholarship
grant
subsidy
```

如果標題同時含有下列詞，會把「是否要求專題/研究/成果」標成待確認：

```text
專題
成果
研究
競賽
論文
project
research
competition
thesis
```

## 目前限制

- 成大水利系首頁目前本機自動抓取失敗，需要再找可直接讀取的公告子頁或改用瀏覽器檢查。
- KUAP 目前抓到的是 APP 介紹頁，不是完整公告列表，因此暫時只能當人工檢查來源。
- 成大獎學金系統可抓入口與查詢頁，但實際查詢結果可能需要表單條件或登入。
