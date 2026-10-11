# ふたりのお財布 - OUR WALLET

ダーク系デザインの、カップル向け共有財布PWAです。GitHub Pages + Firebaseで動作する静的Webアプリです。

## 実装済み機能

- 共有コードによる2人の財布の作成・参加
- Firebase Authenticationの匿名認証
- Cloud Firestoreによるリアルタイム支出共有
- 支出登録：ジャンル、詳細、金額、日付、メモ
- 支出の編集・削除
- カレンダーで日別支出と日別合計を確認
- 月別合計、今日の合計、1日あたり平均
- ジャンル別の金額バーグラフ
- 月予算と使用率表示
- iPhoneホーム画面追加用PWA manifest / service worker
- CSV出力は未実装（後続対応）

## 1. Firebaseの設定

1. Firebase Consoleでプロジェクトを開く（なければ作成）。
2. Authentication > Sign-in method で **匿名 (Anonymous)** を有効にする。
3. Firestore Databaseを作成する。
4. プロジェクトの設定 > マイアプリ > Webアプリの設定からFirebase configを取得する。
5. `firebase-config.js` の `YOUR_...` を実際の値に置き換える。
6. Firestore Database > ルールに `firestore.rules` の内容を貼り付けて公開する。

**注意：** Firebase configはWebアプリに含まれる設定情報です。データ保護の中心はFirestore Security Rulesです。ルールをテスト環境で検証してから実データを入れてください。共有コードを知る人は参加を試せるため、コードを公開しないでください。

## 2. GitHub Pagesに公開

1. GitHubで新しいリポジトリを作成（例：`our-wallet`）。
2. `index.html`, `styles.css`, `app.js`, `firebase-config.js`, `manifest.webmanifest`, `icon.svg`, `service-worker.js` をリポジトリ直下へアップロード。
3. GitHubのリポジトリ > Settings > Pages を開く。
4. Build and deploymentを `Deploy from a branch`、branchを `main`、folderを `/(root)` にして保存。
5. 公開された `https://ユーザー名.github.io/リポジトリ名/` を開く。

## 3. iPhoneのホーム画面に追加

1. iPhoneのSafariでGitHub PagesのURLを開く。
2. 共有ボタンを押す。
3. 「ホーム画面に追加」を選択する。
4. 追加後はホーム画面のアイコンから起動する。

## 4. 2人で利用する

1. 1人目がアプリを開き「共有財布を作成」を押す。
2. 表示された8文字の共有コードを相手に個別に送る。
3. 2人目が自分の端末でアプリを開き、コードを入力して「参加」を押す。
4. 以降、登録・編集・削除された支出がリアルタイムに同期される。

## 現在の制約・確認事項

- このMVPは匿名認証です。端末のブラウザデータを消すと匿名ユーザーIDを失い、以前の共有財布へアクセスできなくなる場合があります。実運用前にメール/Apple等のアカウント連携を検討してください。
- 共有コードは8文字で、2人目が参加すると満員になります。メンバーの退出・交代・コード再発行UIは未実装です。
- 月予算は財布全体で1つの値を共有します。月ごとの予算履歴ではなく、現在設定した月予算を表示します。
- Service Workerはアプリの外枠をキャッシュしますが、Firebaseデータのオフライン編集を保証するものではありません。
- CSV出力は未実装です。
- Firestoreの利用量に応じて課金が発生する場合があります。Firebase Consoleで利用状況・予算アラートを確認してください。

## ディレクトリ

- `index.html` : 画面構造
- `styles.css` : ダーク系UI
- `app.js` : Firebase連携とアプリ動作
- `firebase-config.js` : Firebase設定（要入力）
- `firestore.rules` : Firestoreアクセス制御ルール
- `manifest.webmanifest` : PWA設定
- `service-worker.js` : アプリ外枠のキャッシュ
- `icon.svg` : ホーム画面アイコン
