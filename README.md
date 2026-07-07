# AG GROUP 勤務カレンダー

Next.js + Supabase の従業員タスク管理カレンダーです。Supabase Auth、Postgres、RLS を実データソースとして使用します。

## 技術構成

- Next.js App Router + TypeScript
- Ant Design
- Supabase Auth / Postgres / RLS
- dayjs

## 実装済み

- 月表示の勤務カレンダー
- 日本の土日・国民の祝日・休日の表示
- タスク作成、担当者選択、ステータス更新、削除
- 自分が依頼したタスク / 自分宛てのタスクの切り替え
- 管理者のアカウント作成・削除
- 右側の日別タスク詳細
- Supabase SSR client と Next 16 `proxy.ts`
- 管理者 API：`/api/admin/users`
- 全ユーザー取得 API：`/api/users`
- 初期データベース schema：`supabase/schema.sql`

祝日・休日データは内閣府公開の「国民の祝日」を基に、2025年から2027年までを収録しています。

## ローカル実行

```bash
pnpm dev
```

http://localhost:3000 を開きます。

ログインページは http://localhost:3000/login です。未ログインでトップページへアクセスするとログインページへ移動します。

## Supabase 設定

環境変数ファイルを作成します。

```bash
cp .env.example .env.local
```

`.env.local` に以下を設定します。

```bash
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
SUPABASE_JWKS_URL=
OSS_ACCESS_KEY_ID=
OSS_ACCESS_KEY_SECRET=
OSS_BUCKET=
# 省略時は日本リージョン oss-ap-northeast-1.aliyuncs.com
OSS_ENDPOINT=
# CNAME / カスタムドメインで公開 URL を保存したい場合のみ設定
OSS_PUBLIC_BASE_URL=
```

Supabase SQL Editor で次を実行します。

```bash
supabase/schema.sql
```

`SUPABASE_SECRET_KEY` と `OSS_ACCESS_KEY_SECRET` はサーバー側だけで使用します。ブラウザへ公開しないでください。`SUPABASE_PUBLISHABLE_KEY` はブラウザ側 Supabase client に渡されます。

日本リージョンの OSS 例:

```bash
OSS_BUCKET=client-track-crm
OSS_ENDPOINT=oss-ap-northeast-1.aliyuncs.com
OSS_PUBLIC_BASE_URL=https://client-track-crm.oss-ap-northeast-1.aliyuncs.com
```

CNAME で公開する場合は `OSS_PUBLIC_BASE_URL=https://client-track-crm.ap-northeast-1.thepacificqlx.com` に変更します。
`OSS_BUCKET` は `client-track-crm` を推奨します。誤って `client-track-crm.oss-ap-northeast-1.aliyuncs.com` のような bucket ドメインを入れても自動で bucket 名を解釈します。

## 確認待ち

- 繰り返しタスク、添付、コメントが必要か。
- 依頼されたタスクに承認フローが必要か。
- 週表示、日表示、ドラッグによる日程変更が必要か。
