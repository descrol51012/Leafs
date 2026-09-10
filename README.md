# 藍色樹葉留言

可透過 QR Code 分享的多人留言樹。訪客能從手機或電腦新增葉子，所有留言會儲存在同一個線上資料庫，畫面每 5 秒自動同步。

## 正式網站

https://blue-leaf-message-tree.daliyworker.chatgpt.site

## 主要功能

- 多人共用同一棵留言樹
- QR Code 分享
- 線上持久儲存
- 留言清單與 JSON 備份
- 管理者刪除、清除與還原
- 手機、平板及電腦版面

## 本機開發

需要 Node.js 22.13 以上版本及 pnpm。

```bash
pnpm install
pnpm db:generate
pnpm dev
```

資料表定義位於 `db/schema.ts`，資料庫遷移檔位於 `drizzle/`。

## 部署提醒

這個專案包含 `/api/messages` 伺服器端 API 與 D1 資料庫，因此不能只把檔案交給 GitHub Pages 靜態託管。GitHub repository 用於程式碼版本管理；正式網站與資料庫由目前的 Sites 部署提供。

管理密碼只存放在部署平台的環境變數中，不應寫入 repository、公開網址或 QR Code。
