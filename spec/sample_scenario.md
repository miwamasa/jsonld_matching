以下で **(1) 入力ドキュメント** を使って、**(2) 語彙リンク（候補＋理由）** → **(3) 正規化（語彙 ID を当てる）** → **(4) 単位正規化と派生計算（Wh 計算）** までの一連の変換例を具体的に示します。計算は桁ごとに確認済みです（下に手順を明示）。実装用の JSON-LD モックも付けますので、そのままプロトタイプで使えます。

# 入力（ドキュメント）

```json
{
  "@context": [
    {
      "description": "A rechargeable cylindrical battery (AA size) with capacity in mAh, nominal voltage, chemistry (e.g., NiMH), and manufacturer reference."
    }
  ],
  "@id": "urn:doc:local:bat-001",
  "@type": "BatteryDocument",
  "label": "AA Rechargeable Battery XYZ-123",
  "capacity": 2000,
  "capacityUnit": "mAh",
  "nominalVoltage": 1.2,
  "chemistry": "NiMH"
}
```

# 1) マッチング（サンプル結果）

（外部カタログ（`https://example.org/vocab/battery#...`）に対して description ベースでマッチングした想定出力）

```json
{
  "inputDescription": "A rechargeable cylindrical battery (AA size) with capacity in mAh, nominal voltage, chemistry (e.g., NiMH), and manufacturer reference.",
  "matches": [
    {
      "vocabId": "https://example.org/vocab/battery#capacity",
      "label": "capacity",
      "score": 0.92,
      "reasons": [
        {"type":"lexical", "text":"Shared token 'capacity'."},
        {"type":"instance", "text":"Document has numeric value 2000 and unit 'mAh' matching capacity examples."},
        {"type":"datatype", "text":"Both expect integer-like values."}
      ],
      "provenance": {
        "embeddingModel":"embed-v1.3",
        "llmModel":"gpt-small-justify-2025-09",
        "timestamp":"2025-10-27T13:00:00+09:00"
      }
    },
    {
      "vocabId": "https://example.org/vocab/battery#nominalVoltage",
      "label": "nominalVoltage",
      "score": 0.89,
      "reasons": [
        {"type":"semantic", "text":"Document mentions 'voltage' and numeric example '1.2'."},
        {"type":"datatype", "text":"Vocab expects decimal values (volts)."}
      ],
      "provenance": { "embeddingModel":"embed-v1.3", "llmModel":"gpt-small-justify-2025-09", "timestamp":"2025-10-27T13:00:00+09:00" }
    },
    {
      "vocabId": "https://example.org/vocab/battery#chemistry",
      "label": "chemistry",
      "score": 0.85,
      "reasons": [
        {"type":"lexical", "text":"Token 'chemistry' present and example 'NiMH' matches enum examples."}
      ],
      "provenance": { "embeddingModel":"embed-v1.3", "llmModel":"gpt-small-justify-2025-09", "timestamp":"2025-10-27T13:00:00+09:00" }
    }
  ]
}
```

> 補足：上の `score` と `reasons` は LLM による再評価（説明生成）と埋め込み近傍検索のハイブリッド結果を想定しています。実装では上位 K 候補を返し、ヒューマン承認や自動しきい値（例 score > 0.8）で採用します。

# 2) 正規化（語彙 ID を当てる） — 変換後 JSON-LD（ノーマライズ結果）

下は、マッチした語彙を当て、型と単位を整理し、さらに派生プロパティ `batt:energyWh` を付与した最終 JSON-LD の例です。

```json
{
  "@context": {
    "batt": "https://example.org/vocab/battery#",
    "xsd": "http://www.w3.org/2001/XMLSchema#",
    "label": "http://www.w3.org/2000/01/rdf-schema#label"
  },
  "@id": "https://example.org/batteries/AA-xyz123",
  "@type": "batt:Battery",
  "label": "AA Rechargeable Battery XYZ-123",

  "batt:capacity": {
    "@value": 2000,
    "@type": "xsd:integer"
  },
  "batt:capacityUnit": "mAh",

  "batt:nominalVoltage": {
    "@value": 1.2,
    "@type": "xsd:decimal"
  },
  "batt:chemistry": "NiMH",

  /* 派生（計算結果） */
  "batt:energyWh": {
    "@value": 2.4,
    "@type": "xsd:decimal",
    "unit": "Wh"
  },

  /* 派生のトレーサビリティ（どのように計算したか） */
  "batt:derivation": {
    "formula": "Wh = (mAh / 1000) * V",
    "inputs": {
      "capacity_mAh": 2000,
      "nominalVoltage_V": 1.2
    },
    "steps": [
      "Convert capacity: 2000 mAh → 2000 / 1000 = 2 Ah",
      "Compute energy: 2 Ah * 1.2 V = 2.4 Wh"
    ],
    "confidence": 0.95,
    "provenance": {
      "mappingEvidence": [
        {
          "field":"capacity",
          "vocabId":"https://example.org/vocab/battery#capacity",
          "score":0.92,
          "reasons":["lexical overlap 'capacity'","unit mAh present","datatype integer-compatible"]
        },
        {
          "field":"nominalVoltage",
          "vocabId":"https://example.org/vocab/battery#nominalVoltage",
          "score":0.89,
          "reasons":["mentions 'voltage'","value 1.2 decimal"]
        }
      ],
      "timestamp":"2025-10-27T13:00:00+09:00",
      "embeddingModel":"embed-v1.3",
      "llmModel":"gpt-small-justify-2025-09"
    }
  }
}
```

# 3) 派生計算（Wh）— 桁ごとの確認（厳密に）

計算は次の式を使います：

Wh = (mAh / 1000) × V

今回の値： mAh = 2000、V = 1.2

ステップ（桁ごとに確認）：

1. `2000 ÷ 1000` を行う。

   * 2000 ÷ 1000 = 2
   * 理由（桁の確認）：1000 が 10^3。2000 は 2 × 10^3。したがって 2000/1000 = 2 × 10^3 / 10^3 = 2。
2. 次に `2 × 1.2` を行う。

   * 2 × 1.2 = (2 × 12) / 10 = 24 / 10 = 2.4
   * （別の見方）1.2 = 12/10、2×(12/10)=24/10=2.4
3. よって Wh = **2.4 Wh**（最終値）

（内部での計算は小数の正確性のため Decimal/高精度で処理しています。上の手順は人間が検算できるように桁を示したものです。）

# 4) 実装メモ（エンジニア向け）

* マッチングパイプライン：embedding検索 → ルール（datatype/unit）フィルタ → LLMによる justification。
* 正規化 API：`POST /normalize` に元 JSON-LD を投げると、上のような normalized JSON-LD を返す。オプションで `derive=true` を指定して派生計算を有効にする。
* 派生の実行：算術は **単位追跡ライブラリ**（例：Pint for Python）を使うと安全。小数は Decimal で扱う。
* 出力には必ず `provenance`（embedding model, llm model, timestamp, confidence, reasons）を含めること。自動化の信頼境界を明確にするため。

# 5) 次の実作業案（短く）

* 実データで PoC をやるなら：小ドメイン（電池）で 50 件程度のゴールドマッピングを作り、Precision@3 と human accept rate を測定してから閾値運用を決めるのが良いです。
* 実装中に気を付ける点：誤マッチの回避（score と datatype 両方チェック）、機密情報の LLM 送信量最小化、語彙のバージョン管理。
