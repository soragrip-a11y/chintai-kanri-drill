# LoopQ — 明るいUI版 / Local-first exam practice

撮影した問題を端末内に保存し、自分のChatGPTアカウントの利用枠で**別の応用類題3問**を生成することを目指した、非公式の学習アプリです。資格に依存しません。

## 配布物・現状の区別

- **公開Webベータ（iPhone等）**：写真保存、メモ、苦手復習、バックアップ、手動ChatGPT受け渡し。色彩・ボタン数・視認性を改善。**WebサイトからのChatGPT自動連携は未対応**。
- **PCローカル検証版（Windows）**：上記に加えて、ローカルOAuth認証サーバー、ChatGPT本人利用枠に基づく画像分析・類題3問生成・別工程によるAI再検証のコードを収録。認証や実際のAI通信はアカウント本人が許可して初めて試せます。
- **最終目標：iPhoneのブラウザーだけで本人のChatGPTと自動接続**。OpenAI側のHosted Web連携の利用資格と、セッションを安全に処理するWebバックエンドの準備が必要。フロント側は`runtime-config.js`と`ai-bridge.js`に依存し、認証方式・モデルなどのUIを別途書き直さず接続先を切り替える設計。

## Windowsでローカル連携を試す

1. Windows PCに Python 3.11以降をインストール（`py`コマンドが使えるようにする）。
2. ZIPを展開し、`local/start-windows.bat`をダブルクリック。`requests`, `PyJWT[crypto]`, `pywin32` を初回にインストールします。
3. Windowsブラウザーで `http://127.0.0.1:8765/loopq/` を開く（自動で開く）。このURLは **自分のPC内だけ** で動きます。
4. 写真を端末に保存し、その問題を開いて「類題を3問作る」→「ChatGPTに接続する」。ブラウザーで本人が利用枠の使用に同意する。
5. 認証後にLoopQへ戻り、同画面のモデルを選択。写真のAI送信に明示的に同意して生成する。
6. 生成結果は必ず`review_required`（要確認）。法令・解説・難易度を確認してから学習する。

### 本人のChatGPT利用枠について

- 公式のローカルOSS向け動的登録フローに従い、`chatgpt.tokens.use.direct`権限を要求します。ChatGPTへの認証・利用許可は本人操作。
- Windows DPAPIで本人の認証情報を暗号化して保存。GitHubやブラウザーのlocalStorageには**アクセストークンを保存しません**。
- 本人の利用枠上限に達した場合は処理停止。運営者の有料APIへの自動切り替え、APIキー入力画面、共有の支払い設定はありません。
- リフレッシュトークンの更新で失敗する可能性が報告されており、その場合は再認証が必要（OpenAI公式DevKitの公開Issue #5）。
- 読み込み先は`https://api.openai.com/v1/responses`で`store:false,stream:true`を指定。画像を本人のAIへ送る際は毎回チェックを求めます。

## 将来のHosted Web版へ移行するための契約

フロント側は `window.LoopQAI` を通して以下の同一APIを利用：

- `GET /api/status` → 接続・本人利用枠権限
- `POST /api/auth/start` → OpenAI認証URL
- `GET /api/models` → 本人に利用可能なモデル
- `POST /api/generate` → `{model,image,exam,topic,consent:true}`、返答は`{questions:[...3],status:'review_required',note}`
- `POST /api/logout` → ローカル認証削除

**重要**：公開Webでの連携は、`runtime-config.js`を書き換えるだけでは動きません。OpenAIの正式なHosted Web連携権限取得と、同API契約を満たすセキュアなサーバー認証実装が必要です。フロントのUI・データ形式・復習機能はそのまま移行できるよう分離してあります。トークンをGitHub Pagesに埋め込まないこと。

## 個人データ

画像、問題、復習履歴は利用したブラウザーごとのIndexedDBに保存。GitHub PagesとWindowsローカル版は**別のオリジン**なので、学習履歴は自動同期されません。「設定」→JSONバックアップ→別環境で復元してください。現状は全件メモリ読み込みとbase64保存のため、大量画像運用は未対応。必ず定期的にバックアップしてください。

## テスト

- `python -m unittest discover -s tests -p 'test_*.py'`：OAuthパラメータ、CORS・同意、画像リクエスト形式・JSON検査を、外部への接続なしで検証。
- `python tests/smoke_ui_mock.py`：モックのIndexedDB・ChatGPT状態で、390pxと1366px画面の保存→詳細→接続ボタン、横はみ出しを確認。
- `node --check app.js; node --check ai-bridge.js`：構文検査。
- Windows PCでの**実際のChatGPTログインと画像入力、iPhone実機でのデザイン確認は未完了**。モック合格を実機合格とみなさない。

## 参照

- [OpenAI公式：OSSローカルでのChatGPT利用枠](https://developers.openai.com/siwc/token-sharing-open-source)
- [公式：認証・登録](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
- [公式：モデルとResponses API](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)
- [Web版の利用条件](https://developers.openai.com/siwc/website)

非商用の試作です。出版社の過去問を配布する目的には使わないでください。本人がアップロードした画像に著作物や個人情報が含まれる可能性があるため、送信への同意を分離しています。
