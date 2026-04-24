# Tasuku — タスク管理ツール

タスク管理・カレンダー・日報作成を1つにまとめたWebアプリ。  
Firebase (Firestore) + GitHub Pages で動作します。

## 機能

- **タスク管理**: ステータス別グループ表示、サブタスク、進捗バー、営業日計算
- **カレンダー**: 月表示、締切日表示、祝日対応
- **日報作成**: テンプレート生成、クリップボードコピー

## セットアップ

### 1. Firestore セキュリティルール

Firebase Console → Firestore → ルール に以下を設定:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /tasks_v2/{docId} {
      allow read, write: if true;
    }
    match /meta/{docId} {
      allow read, write: if true;
    }
  }
}
```

> ⚠️ 本番運用では認証を追加してください。

### 2. GitHub Pages の有効化

Settings → Pages → Source: **GitHub Actions** を選択

### 3. 担当者・案件マスターの設定

Firestore の `meta/config` ドキュメントに以下の形式で登録:

```json
{
  "assignees": ["田中", "鈴木", "佐藤"],
  "projects": ["プロジェクトA", "プロジェクトB"]
}
```

## 技術スタック

- HTML / CSS / Vanilla JS (ES Modules)
- Firebase v10 (Firestore)
- Google Fonts (Noto Sans JP)
- GitHub Actions (自動デプロイ)
