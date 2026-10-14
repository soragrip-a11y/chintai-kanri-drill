# 画像＋指示文コピー（試行機能・未公開）

- 「画像＋指示文をコピー」を追加。番号・ID入りの写真まとめをPNGとして準備し、元の作問指示文と一緒に1つのClipboardItemへ入れて、クリックから直接clipboard.writeを呼ぶ。画像変換のawaitでSafariの操作権限を失わないよう、変換は先に済ませる。
- コピー完了後も「ChatGPTに貼り付け、画像と指示文が両方表示されたことを確認して送信」と案内する。貼り付け先が一方の形式のみを採用する可能性があるため、1回の貼り付けで両方が届くとは保証しない。対応しない場合は、個別の指示文コピー・画像保存を引き続き使う。
- ClipboardItem／画像書込が利用できない場合、PNG変換に失敗した場合、PNGが20MBを超える場合は同時コピーを無効にする。JPEGの保存・共有は残す。許可拒否や同期例外は成功と表示せず、個別操作へ案内する。連打による重複書込を防止。
- 写真・指示文は端末のクリップボードへ書き込むだけで、自動的にChatGPTへ送信しない。原画像・問題・履歴・DBスキーマを変更しない。

根拠：WebKit公式 Async Clipboard API（画像と文字の複数形式、iOS/macOSで受取側が形式を選ぶ仕組み、ユーザー操作の要件） https://webkit.org/blog/10855/async-clipboard-api/

`node --test loopq/pasted-json.test.cjs loopq/batch.test.cjs loopq/batch-flow.test.cjs loopq/simple-ui.test.cjs loopq/notice.test.cjs loopq/clipboard.test.cjs`：37件成功。追加分はクリップボード代替実装によるPNG＋元指示文の1回書込、許可拒否、同期例外、連打抑止。構文・差分チェック成功。iPhone実機のコピー、ChatGPTアプリ／Webへの貼付け、実画像・文字の両方の受信は未検証。

公開通信は名前解決に失敗し、権限拡張が実行環境の承認設定で拒否されたため未公開。公開前ローカル参照：`rollback/loopq-before-copy-20261014`。公開前に最新mainを確認し、戻す際は今回のコミットをrevertする。端末のサイトデータを消さない。
