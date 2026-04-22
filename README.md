# firebase-seatapp

Firebase Realtime Database と Firebase Hosting 上で動く、**イベント等の座席をリアルタイムで割り当て・表示する**静的 Web アプリです。ビルドツールは使わず、HTML / CSS / JavaScript（Firebase JS SDK v8）で構成されています。

## サービス概要

会場のテーブル・座席構成をあらかじめ登録し、参加者名簿に基づいて**ルーレット形式で席を決定**します。割り当て結果は全端末で即座に同期され、**座席一覧画面**で誰がどの席かを一覧できます。幹事向けに**固定席**や**イベント名などの表示文言**を管理画面から設定できます。

## 技術スタック

| 項目 | 内容 |
|------|------|
| ホスティング | Firebase Hosting（`firebase.json` の `public` はリポジトリルート） |
| データベース | Firebase Realtime Database |
| クライアント SDK | Firebase JavaScript SDK 8.x（`firebase-app` / `firebase-database` を CDN 読み込み） |
| スタイル | 共通 [common.css](common.css)（レスポンシブ・タッチ目安 44px など） |

## 画面と役割

| ファイル | 役割 |
|----------|------|
| [index.html](index.html) | **座席一覧表示**。`assignments` を購読し、テーブルごとに席を描画。管理者用クエリ `?admin=true` でリセットボタンと設定系リンクを表示可能。 |
| [control.html](control.html) | **ルーレット操作**。参加者ボタンを選び、空席から抽選して `assignments` に書き込み。固定席設定がある参加者は確定時にその席を優先。 |
| [admin.html](admin.html) | **管理者設定**。参加者リスト、テーブル座席数・有効/無効、固定席、イベント表示（タイトル・一覧見出し・ルーレット見出し）の編集と保存。 |

## Realtime Database のデータ構造（概要）

| パス | 内容 |
|------|------|
| `settings/members` | 参加者名の配列（文字列） |
| `settings/tables` | テーブル ID（A〜等）→ 座席数（数値）または `{ seats, enabled, ... }` |
| `settings/fixed` | 参加者名 → 固定する席コード（例 `A1`）。未記載の参加者は通常ルーレット。 |
| `settings/event` | `{ title, listTitle, rouletteTitle }` など。未設定時はコード内のデフォルト文言にフォールバック。 |
| `assignments` | 参加者名 → 確定した席コード |

## 主な機能仕様

### 座席一覧（index）

- `getSettings()` でテーブル定義を取得し、`assignments` を `on('value')` で購読して再描画。
- 無効テーブル・座席数 0 のブロックは表示しない。
- 管理者モード時のみ、全割り当てのリセットが可能。

### ルーレット（control）

- 参加者は `settings/members` から生成。既に `assignments` にいる名前はボタン無効。
- **論理予約**: `settings/fixed` に載っていてまだ割り当てられていない人の席は、他者の抽選候補から除外（固定の人を最後に回しても席が奪われない）。
- ストップ時は `fixed` があればその席、なければ候補からランダム。結果は `assignments/{名前}` に `set`。

### 管理画面（admin）

- 各セクションで Firebase に `set` / `once`（イベント表示は `seatAppUtils` 経由で保存・読込）。
- テーブル追加・削除、座席数変更、テーブル有効/無効切替。
- 固定席の追加・削除・保存。
- イベント表示の保存（一覧・ルーレットの見出しやブラウザタイトルに反映される値）。
- 座席割り当てのみリセット、または `settings` ごとリセット（確認ダイアログあり）。

### 共通ユーティリティ（utils.js）

- `SeatAppUtils`: `getData` / `setData` / `removeData`、パス単位キャッシュ、`addListener` とコンテキスト別 `removeListeners`。
- `getSettings()`、`generateSeats`、`getAvailableSeats`（上記論理予約込み）、イベント文字列の正規化・解決。

### セキュリティ

- [database.rules.json](database.rules.json) は開発用に読み書きが広い設定のままです。公開運用する場合は必ず見直してください。

## ローカルでの確認

静的ファイルのため、ルートを任意の HTTP サーバーで配信するか、Firebase Emulator を利用できます。

## デプロイ

```bash
firebase deploy
```

Hosting のみ、または Realtime Database のルールのみに限定する場合は `firebase deploy --only hosting` など `--only` を指定してください。

## 変更履歴（抜粋）

- **フッター**: `index.html` / `control.html` / `admin.html` に共通フッター（`common.css` の `.site-footer`）を追加。
- **ルーレット演出**: `utils.js` の `getVisualRouletteSeats` により、回転演出用の席プールを表示用と分離。
- **イベント表示**: `settings/event` で一覧・ルーレットの見出しを管理画面から設定可能。
- **UI**: 春向けのティール／ミント系配色、レスポンシブ調整（`common.css`）。

## ライセンス・利用

リポジトリ利用者のポリシーに従ってください。
