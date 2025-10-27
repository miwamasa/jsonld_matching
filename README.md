# JSON-LD Matching System

description ベースの語彙マッチング・正規化・派生計算システム

## 概要

このシステムは、JSON-LDの `@context` に記述された自然言語の description を使って、外部の語彙カタログと意味的にマッチングし、正規化されたJSON-LDを生成します。さらに、派生プロパティ（エネルギー計算など）も自動的に追加します。

## 特徴

- **description ベースのマッチング**: 埋め込み検索の代わりにテキスト類似度を使用
- **ルールベースフィルタリング**: データ型、単位の互換性チェック
- **スコアリング**: 複数の観点（テキスト類似度、ルール、モックLLM）から総合評価
- **理由付き結果**: なぜマッチしたかを複数のタイプで説明
- **正規化**: 語彙URIへのマッピングと型付きリテラル化
- **派生計算**: エネルギー（Wh）などの自動計算
- **Provenance**: マッチング結果の出所を記録

## ディレクトリ構造

```
jsonld_matching/
├── index.html                    # メインアプリケーション
├── data/
│   ├── vocabulary_catalog.json   # 語彙カタログ
│   ├── sample_document_1.json    # サンプル: AA NiMH
│   ├── sample_document_2.json    # サンプル: 18650 Li-ion
│   └── sample_document_3.json    # サンプル: AAA Alkaline
├── src/
│   ├── matching_engine.js        # マッチングエンジン
│   ├── normalizer.js             # 正規化エンジン
│   ├── derivation.js             # 派生計算エンジン
│   └── app.js                    # アプリケーションロジック
└── spec/
    ├── specification.md          # 仕様書
    ├── sample_scenario.md        # サンプルシナリオ
    └── prompt_and_scoring.md     # プロンプトとスコアリング

```

## 使い方

### 1. ローカルサーバーで起動

```bash
# Python 3を使用する場合
python3 -m http.server 8000

# または Node.js の http-server を使用
npx http-server
```

ブラウザで `http://localhost:8000` にアクセス

### 2. アプリケーションの操作

1. **サンプルの読み込み**:
   - 「サンプル1」「サンプル2」「サンプル3」ボタンをクリック
   - または、左側のテキストエリアに独自のJSON-LDを入力

2. **マッチング閾値の設定**:
   - スライダーで閾値を調整（0.00〜1.00）
   - デフォルトは0.75

3. **マッチング実行**:
   - 「マッチング実行」ボタンをクリック
   - 右側にマッチング結果が表示される

4. **結果の確認**:
   - 各候補のスコア、理由、説明を確認
   - 下部に正規化されたJSON-LDと派生計算結果を表示

### 3. 独自のドキュメントを入力

以下の形式でJSON-LDドキュメントを入力:

```json
{
  "@context": [
    {
      "description": "バッテリーの説明文をここに記述..."
    }
  ],
  "@id": "urn:doc:local:my-battery",
  "@type": "BatteryDocument",
  "label": "マイバッテリー",
  "capacity": 2500,
  "capacityUnit": "mAh",
  "nominalVoltage": 1.2,
  "chemistry": "NiMH"
}
```

## システムアーキテクチャ

### マッチングパイプライン

1. **テキスト類似度計算** (E): Jaccard類似度を使用
2. **ルールベースフィルタリング** (R): 型、単位、ラベルの一致をチェック
3. **モックLLMスコアリング** (L): 理由生成とスコア算出
4. **最終スコア計算**: `S = 0.45*E + 0.25*R + 0.30*L`

### 正規化

- 採用されたマッチ（閾値以上）を使用
- 語彙URIへのマッピング
- 型付きリテラル（xsd:integer, xsd:decimalなど）への変換
- 単位の正規化

### 派生計算

- **エネルギー (Wh)**: `Wh = (mAh / 1000) * V`
- 計算ステップとProvenanceを記録
- 信頼度スコアを付与

## 語彙カタログの拡張

`data/vocabulary_catalog.json` に新しい語彙を追加:

```json
{
  "id": "https://example.org/vocab/battery#newProperty",
  "label": "newProperty",
  "description": "プロパティの説明...",
  "datatype": "integer|decimal|string|boolean",
  "units": ["単位1", "単位2"],
  "examples": [例1, 例2],
  "category": "カテゴリ"
}
```

## スコアの解釈

- **0.90以上**: 高信頼度 - 自動採用推奨
- **0.75-0.90**: 中信頼度 - 確認後採用
- **0.75未満**: 低信頼度 - ヒューマンレビュー必須

## 理由タイプ

- **lexical**: 字句的な一致（トークンの重なり）
- **semantic**: 意味的な関連性
- **instance**: 実際の値とサンプル例の一致
- **datatype**: データ型の互換性
- **unitCompatibility**: 単位の互換性
- **ontology**: オントロジー上の関係

## 制限事項と今後の改善

### 現在の実装

- テキスト類似度はJaccard類似度（シンプル）
- LLMスコアはモック実装（ルールベース）
- 埋め込み検索は未実装（テキストマッチング）

### 本格実装への拡張

1. **埋め込みモデルの統合**:
   - OpenAI Embeddings API
   - Sentence Transformers
   - ベクトルDB (FAISS, Milvus)

2. **実際のLLM統合**:
   - GPT-4, Claude などのAPI
   - Justificationプロンプトの実装

3. **より高度な単位変換**:
   - 単位追跡ライブラリの統合
   - 複雑な単位変換

4. **バージョン管理**:
   - 語彙カタログのバージョン管理
   - 後方互換性の確保

## ライセンス

MIT License

## 参考資料

- [仕様書](spec/specification.md)
- [サンプルシナリオ](spec/sample_scenario.md)
- [プロンプトとスコアリング](spec/prompt_and_scoring.md)
