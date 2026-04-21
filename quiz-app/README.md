# クイズルーム - サイト公開手順

このアプリをVercelで公開して、みんなで使えるようにする手順です。
全部無料でできます。所要時間は約30分。

## 用意するもの

以下の3つのアカウント(全部無料):

1. **Googleアカウント** (Firebase用)
2. **GitHubアカウント** → https://github.com/signup
3. **Vercelアカウント** → https://vercel.com/signup (GitHubでログインOK)

---

## ステップ1: Firebaseでデータベースを用意する

回答データを保存する場所です。

1. https://console.firebase.google.com にアクセスしてGoogleでログイン
2. **「プロジェクトを追加」** をクリック
3. プロジェクト名を入力(例: `quiz-app`)→「続行」
4. Googleアナリティクスは **無効でOK** →「プロジェクトを作成」
5. 作成完了したら左メニューから **「Firestore Database」** を開く
6. **「データベースの作成」** をクリック
7. 場所は **「asia-northeast1 (Tokyo)」** を選択 →「次へ」
8. **「テストモードで開始」** を選択 →「有効にする」

### Firebase設定情報を取得

1. 左上の歯車アイコン →「プロジェクトの設定」
2. 下の方の「マイアプリ」セクションで **`</>`(ウェブ)アイコン** をクリック
3. アプリのニックネーム入力(例: `quiz-web`)→「アプリを登録」
4. 表示される `firebaseConfig = { ... }` の中身を **まるごとコピー**(あとで使います)

例えばこんな感じの内容です:
```
apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXX",
authDomain: "quiz-app-xxxxx.firebaseapp.com",
projectId: "quiz-app-xxxxx",
...
```

---

## ステップ2: GitHubにコードを置く

1. https://github.com にログイン
2. 右上の **「+」→「New repository」**
3. リポジトリ名: `quiz-app` (任意の名前でOK)
4. **「Public」** を選択
5. **「Create repository」** をクリック

### プロジェクトをアップロード

作成されたリポジトリ画面で **「uploading an existing file」** リンクをクリック。

このフォルダ内の **すべてのファイルとフォルダ** をドラッグ&ドロップでアップロードします:
- `package.json`
- `vite.config.js`
- `index.html`
- `.gitignore`
- `src/` フォルダ(中身ごと)

アップロード後、画面下の **「Commit changes」** をクリック。

### Firebase設定を書き換える

1. リポジトリの `src/firebase.js` ファイルを開く
2. 右上の **鉛筆アイコン(編集)** をクリック
3. ファイルの中の `YOUR_API_KEY` などの部分を、先ほどコピーしたFirebase設定で置き換える

例:
```javascript
const firebaseConfig = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "quiz-app-xxxxx.firebaseapp.com",
  projectId: "quiz-app-xxxxx",
  storageBucket: "quiz-app-xxxxx.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdefg"
};
```

4. 下の **「Commit changes」** をクリック

---

## ステップ3: Vercelにデプロイ

1. https://vercel.com にGitHubアカウントでログイン
2. **「Add New...」→「Project」** をクリック
3. GitHubリポジトリ一覧から `quiz-app` の横の **「Import」** をクリック
4. 設定はそのまま(Vercelが自動でViteを認識します)
5. **「Deploy」** をクリック

1〜2分待つと、**`https://quiz-app-xxxxx.vercel.app`** のようなURLが発行されて完成です!
このURLを参加者に共有すれば、みんなで使えます。

---

## 修正したくなったら

- `src/App.jsx` を直接GitHubで編集して保存すれば、Vercelが自動で再デプロイしてくれます
- 独自ドメインを使いたい場合はVercelの「Settings」→「Domains」から設定可能

## ⚠️ セキュリティについて

Firestoreを「テストモード」で作ると30日後に期限切れになります。身内で使うだけなら、その後に下記のルールを設定しておくと継続利用できます。

Firebase Console →「Firestore Database」→「ルール」タブで以下を貼り付け →「公開」:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

※ このルールは「誰でも読み書きできる」状態なので、URLを不特定多数に公開する場合は認証を足すなどの対策を検討してください。

---

## ローカルで試したい場合(任意)

Node.jsをインストール済みなら、ターミナルで:

```bash
npm install
npm run dev
```

`http://localhost:5173` で開発サーバーが立ち上がります。
