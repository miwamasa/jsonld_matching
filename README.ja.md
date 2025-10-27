# JSON-LD マッチングシステム

description ベースの語彙マッチング・正規化・派生計算システム

[English](README.md) | 日本語

## 概要

このシステムは、JSON-LDの `@context` に記述された自然言語の description を使って、外部の語彙カタログと意味的にマッチングし、正規化されたJSON-LDを生成します。さらに、派生プロパティ（エネルギー計算など）も自動的に追加します。

## 主な特徴

- **自然言語による語彙マッチング**: URIを覚える必要なし
- **スコア付き候補**: 信頼度と理由を明示
- **自動正規化**: 標準的なJSON-LDに変換
- **派生計算**: エネルギー（Wh）などを自動計算
- **Provenance記録**: すべての変換の出所を追跡
- **インタラクティブUI**: ブラウザで簡単操作

## クイックスタート

### 1. サーバー起動

```bash
python3 server.py
```

### 2. ブラウザで開く

```
http://localhost:8000
```

### 3. サンプルを試す

1. 「サンプル1 (AA NiMH)」ボタンをクリック
2. 「マッチング実行」ボタンをクリック
3. 結果を確認

詳細は [クイックスタートガイド](docs/quick_start.md) を参照してください。

## ドキュメント

- **[クイックスタートガイド](docs/quick_start.md)** - 5分で始める
- **[詳細な取り扱い説明書](docs/user_guide.md)** - 完全なユーザーガイド
- **[仕様書](spec/specification.md)** - 技術仕様
- **[サンプルシナリオ](spec/sample_scenario.md)** - 具体的な使用例
- **[プロンプトとスコアリング](spec/prompt_and_scoring.md)** - LLM統合ガイド

## 使用例

### 入力ドキュメント

```json
{
  "@context": [{
    "description": "充電可能な単三電池。容量2000mAh、電圧1.2V、ニッケル水素"
  }],
  "@id": "urn:doc:local:bat-001",
  "@type": "BatteryDocument",
  "label": "単三充電池 XYZ-123",
  "capacity": 2000,
  "capacityUnit": "mAh",
  "nominalVoltage": 1.2,
  "chemistry": "NiMH"
}
```

### マッチング結果

システムが自動的に：
- **capacity** (スコア: 0.92) と照合
- **nominalVoltage** (スコア: 0.89) と照合
- **chemistry** (スコア: 0.85) と照合
- 理由を生成（lexical、instance、datatype など）

### 正規化された出力

```json
{
  "@context": {
    "batt": "https://example.org/vocab/battery#",
    "xsd": "http://www.w3.org/2001/XMLSchema#"
  },
  "@id": "urn:doc:local:bat-001",
  "@type": "batt:Battery",
  "batt:capacity": {
    "@value": 2000,
    "@type": "xsd:integer"
  },
  "batt:nominalVoltage": {
    "@value": 1.2,
    "@type": "xsd:decimal"
  },
  "batt:energyWh": {
    "@value": 2.4,
    "@type": "xsd:decimal"
  }
}
```

エネルギー（2.4 Wh）は自動計算されます！

## ディレクトリ構成

```
jsonld_matching/
├── index.html                    # メインアプリケーション
├── server.py                     # 開発用サーバー
├── README.md                     # 英語版README
├── README.ja.md                  # 日本語版README
├── data/
│   ├── vocabulary_catalog.json   # 語彙カタログ
│   └── sample_document_*.json    # サンプルドキュメント
├── src/
│   ├── matching_engine.js        # マッチングエンジン
│   ├── normalizer.js             # 正規化エンジン
│   ├── derivation.js             # 派生計算エンジン
│   └── app.js                    # UIロジック
├── docs/
│   ├── quick_start.md            # クイックスタート
│   └── user_guide.md             # 詳細ガイド
├── spec/
│   ├── specification.md          # 技術仕様
│   ├── sample_scenario.md        # サンプルシナリオ
│   └── prompt_and_scoring.md     # スコアリングガイド
└── test/
    └── test.js                   # テストスクリプト
```

## 技術アーキテクチャ

### マッチングパイプライン

```
入力ドキュメント
    ↓
1. テキスト類似度計算 (E: 0~1)
    ↓
2. ルールベース評価 (R: 0~1)
    ↓
3. LLMスコアリング (L: 0~1)
    ↓
最終スコア = 0.45×E + 0.25×R + 0.30×L
    ↓
候補リスト（スコア順）
```

### 正規化と派生

```
マッチング結果
    ↓
語彙URIへのマッピング
    ↓
型付きリテラル化
    ↓
単位正規化
    ↓
派生計算（Wh = (mAh/1000) × V）
    ↓
正規化されたJSON-LD
```

## スコアの解釈

| スコア | 評価 | アクション |
|--------|------|-----------|
| 0.90～1.00 | 非常に高い | 自動採用 |
| 0.75～0.90 | 高い | 確認後採用 |
| 0.60～0.75 | 中程度 | レビュー必須 |
| 0.00～0.60 | 低い | 不採用推奨 |

## カスタマイズ

### 独自の語彙カタログを作成

`data/vocabulary_catalog.json` を編集：

```json
{
  "vocabularies": [
    {
      "id": "https://example.org/vocab/custom#myProperty",
      "label": "myProperty",
      "description": "プロパティの詳細な説明",
      "datatype": "integer",
      "units": ["単位"],
      "examples": [100, 200],
      "category": "カテゴリ"
    }
  ]
}
```

### 閾値の調整

UI上のスライダーで調整可能：
- 保守的: 0.90 以上
- 標準: 0.75（推奨）
- 実験的: 0.50 以上

## テスト

Node.jsでのテスト実行：

```bash
node test/test.js
```

期待される出力：
```
✓ マッチングエンジン: 8件の候補
✓ 正規化エンジン: 動作確認
✓ 派生計算: エネルギー 2.4 Wh
✓ すべてのテストがパス
```

## 現在の実装と本格運用への拡張

### 現在の実装（プロトタイプ）

- ✅ テキスト類似度（Jaccard）
- ✅ ルールベースフィルタリング
- ✅ モックLLMスコアリング
- ✅ 単位変換
- ✅ 派生計算（Wh）

### 本格運用への拡張

1. **埋め込みモデルの統合**
   - OpenAI Embeddings
   - Sentence Transformers
   - ベクトルDB（FAISS、Milvus）

2. **実際のLLM統合**
   - GPT-4、Claude などのAPI
   - `spec/prompt_and_scoring.md` 参照

3. **高度な単位変換**
   - Pint（Python）などの単位追跡ライブラリ

4. **バージョン管理**
   - 語彙カタログのバージョニング
   - 後方互換性の確保

詳細は [仕様書](spec/specification.md) の「本格実装への拡張」セクションを参照してください。

## トラブルシューティング

### よくある問題

| 問題 | 原因 | 解決策 |
|------|------|--------|
| 候補0件 | description がない | `@context` に description を追加 |
| スコアが低い | 説明文が短い | 20文字以上の詳細な説明を書く |
| JSONエラー | 構文エラー | カンマ、引用符を確認 |
| 起動できない | ポート競合 | 別のポート（8080など）を使用 |

詳細は [取り扱い説明書](docs/user_guide.md) のトラブルシューティングセクションを参照してください。

## 貢献

バグ報告や機能要望は [GitHub Issues](https://github.com/miwamasa/jsonld_matching/issues) にお願いします。

## ライセンス

MIT License

## 参考文献

- JSON-LD 1.1: https://www.w3.org/TR/json-ld11/
- RDF Schema: https://www.w3.org/TR/rdf-schema/
- XML Schema Datatypes: https://www.w3.org/TR/xmlschema11-2/

## 作者

Claude Code による実装

---

**質問がある場合は**: [取り扱い説明書](docs/user_guide.md) の「よくある質問」セクションを参照してください。
