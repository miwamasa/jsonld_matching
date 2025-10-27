# JSON-LD Matching System クイックスタートガイド

## 5分で始める

### 1. サーバー起動（30秒）

```bash
cd /path/to/jsonld_matching
python3 server.py
```

ブラウザで開く: `http://localhost:8000`

### 2. サンプルを試す（1分）

1. 「サンプル1 (AA NiMH)」をクリック
2. 「マッチング実行」をクリック
3. 結果を確認

### 3. 独自のドキュメントを作成（3分）

**最小構成**
```json
{
  "@context": [{
    "description": "ここに説明文を書く（10文字以上推奨）"
  }],
  "@id": "urn:doc:my-doc-001",
  "プロパティ名": "値"
}
```

**例：バッテリー**
```json
{
  "@context": [{
    "description": "充電可能な単三電池。容量2000mAh、電圧1.2V"
  }],
  "@id": "urn:battery:001",
  "capacity": 2000,
  "capacityUnit": "mAh",
  "nominalVoltage": 1.2,
  "chemistry": "NiMH"
}
```

### 4. 結果を理解する

**スコアの見方**
- 0.90以上 = 自動採用OK
- 0.75-0.90 = 確認して採用
- 0.75未満 = 要レビュー

**理由タグ**
- 🔵 lexical = 単語が一致
- 🟢 semantic = 意味が関連
- 🟡 instance = 値が一致
- 🔴 datatype = 型が互換
- 🟣 unitCompatibility = 単位が互換

### トラブルシューティング

| 問題 | 解決策 |
|------|--------|
| 候補0件 | description を追加 |
| スコア低い | 説明文を詳細に（20文字以上） |
| JSONエラー | 最後のカンマを削除、引用符を確認 |
| 起動しない | ポート8000を確認、または8080を使用 |

### 次のステップ

- [詳細な取り扱い説明書](user_guide.md)
- [サンプルシナリオ](../spec/sample_scenario.md)
- [技術仕様](../spec/specification.md)

---

**ヒント**: 説明文は英語の方が精度が高いですが、日本語も使えます。
