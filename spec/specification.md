
以下では、**（A）設計目標／要件の整理**、**（B）具体的な JSON-LD の書き方（`@context` に `description` を置くパターン）**、**（C）語彙リンク処理のパイプライン（埋め込み＋LLM を含む）**、**（D）リンク結果の表現（理由付き）サンプル**、**（E）語彙間の演算（合成／引き算／変換など）の設計案**、**（F）運用上の注意点と評価指標**、を順に提示します。結果は実装可能な設計スケッチで、プロトタイプ化までつなげられるレベルの具体性を目指しました（長めですが Think Harder でお届けします）。

# A. 設計ゴール（短く）

* 外部コンテキスト URI の代わりに**人間に読める description** を `@context` に置き、別途公開されている語彙（description を含む）群と**意味的にゆるく結びつけ**る。
* 結びつけは完全一致ではなく **スコア付きの「ゆるいリンク」**（候補集合＋理由テキスト＋信頼度）を返す。
* その上で、語彙の**合成、差分、変換（単位・型の整合化）**などを行い、新しい語彙を生成・利用できるようにする。
* トレース可能性（provenance）とヒューマンレビューを組み込み、安全かつ説明可能に。

# B. JSON-LD：`@context` に description を置く具体例

ドキュメント側（外部辞書を URI で参照する代わりに説明を置く例）：

```json
{
  "@context": [
    {
      "note": "Battery context described in free text for ML matching",
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

外部に置く「語彙カタログ」（語彙ごとに説明を持つ）例 — これはサーバで公開する JSON（従来の context.jsonld の代替あるいは補助）：

```json
{
  "vocabularies": [
    {
      "id": "https://example.org/vocab/battery#capacity",
      "label": "capacity",
      "description": "Electric charge capacity expressed in milliampere-hours (integer), typical for cells such as AA/AAA rechargeable batteries."
    },
    {
      "id": "https://example.org/vocab/battery#nominalVoltage",
      "label": "nominalVoltage",
      "description": "Nominal voltage of the battery in volts (decimal). e.g., 1.2 for NiMH cells."
    },
    {
      "id": "https://example.org/vocab/battery#chemistry",
      "label": "chemistry",
      "description": "Battery chemistry type, such as NiMH, Li-ion, Alkaline, describing electrochemical family."
    }
  ],
  "version": "2025-10-27"
}
```

要点：ドキュメントは `description` を使い、マッチングは**外部カタログの description とテキスト的／意味的に比較**する。

# C. マッチング／リンク生成パイプライン（実装フロー）

1. **事前準備（オフライン）**

   * 外部語彙カタログの各 `description` を埋め込み（ベクトル）化してベクトル DB に格納。
   * 各語彙には `id`, `label`, `description`, `datatype`, `unit`, `examples` を持たせる（メタデータ整備）。
2. **ドキュメント受信時**

   * ドキュメントの `@context` 中の `description`（短い文章）を抽出。
   * そのテキストを埋め込み化してベクトル DB で近傍検索 → 候補語彙リスト（上位 K）。
3. **候補フィルタリング（ルールベース）**

   * データ型互換性チェック（例：値が整数なら候補の `datatype` が数値であること）。
   * 単位一致・変換可能性チェック（`mAh` と `Ah` など）。
   * ラベル・語形一致スコア（編集距離、トークン重なり）。
4. **LLM による再評価と理由生成**

   * 候補ごとに小さなプロンプトで **「なぜこの候補が合うか」** を LLM に生成させる（短い説明文と、structured reasons： lexical, semantic, instanceEvidence, unitCompatibility）。
   * LLM は候補の description とドキュメントの description/値の例を受け取り、**自然言語の理由 + スコア（0..1）**を返す。
   * 例：`{"candidate":"batt:capacity","score":0.92,"reason":"document mentions mAh and 2000 which matches capacity; datatype integer; lexical overlap 'capacity'."}`
5. **最終集合の出力**

   * 候補リスト（上位 N）を返し、それぞれに `id`、`score`、`reasons[]`、`provenance`（embedding model version, LLM model + prompt id, timestamp）を付与する。
   * ユーザ／システムはその中から採用（merge）または拒否できる（ヒューマン・イン・ループ）。

### 技術スタックの提案（実用）

* 埋め込みモデル：小〜中規模（コストと速度のバランス）→ OpenAI/花里系など。
* ベクトル DB：FAISS, Milvus, Pinecone。
* LLM：短い justification 用に軽量モデルで高速確認。
* API：`/match-context`（POST: documentContext → returns candidate mappings）

# D. リンク結果表現の具体例（JSON）

```json
{
  "inputContextDescription": "A rechargeable cylindrical battery (AA size) with capacity in mAh, nominal voltage, chemistry (e.g., NiMH), and manufacturer reference.",
  "matches": [
    {
      "vocabId": "https://example.org/vocab/battery#capacity",
      "label": "capacity",
      "score": 0.92,
      "reasons": [
        {"type":"lexical", "text":"Shared token 'capacity' in both descriptions."},
        {"type":"instance", "text":"Document contains '2000' and 'mAh' which matches examples in vocab."},
        {"type":"datatype", "text":"Both expect integer-like values."}
      ],
      "provenance": {
        "embeddingModel":"embed-v1.3",
        "embeddingScore":0.85,
        "llmModel":"gpt-small-justify-2025-09",
        "llmPromptId":"prompt_justify_v1",
        "timestamp":"2025-10-27T13:00:00+09:00"
      }
    },
    {
      "vocabId": "https://example.org/vocab/battery#nominalVoltage",
      "label": "nominalVoltage",
      "score": 0.71,
      "reasons": [
        {"type":"semantic", "text":"Document mentions 'voltage' and numeric value '1.2'"},
        {"type":"datatype", "text":"Vocab expects decimal; document provides 1.2"}
      ],
      "provenance": { "...": "..." }
    }
  ]
}
```

`reasons` は複数の観点で説明（lexical, semantic, instance, unitCompatibility, ontologyPath など）を与えることで、**「なぜリンクされたか」**を人間にも機械にも理解可能にします。

# E. 語彙間演算（合成・差分・変換）の考え方と具体パターン

ここでの「演算」は語彙の **メタデータ（型・単位・制約）と意味的定義** を操作するものです。基本的に **ルールベース + 構文化された意味（構成子）＋LLM による合成提案** のハイブリッドで行います。

1. 合成（merge / compose）

   * 入力：`V1`（capacity）, `V2`（nominalVoltage）など
   * 出力：`V_new`（BatterySpec） = 合成クラス。プロセス：

     1. 共通プロパティを列挙、衝突は単位変換・型正規化で解決。
     2. `rdfs:subClassOf` や `owl:equivalentClass` としてリンク。
     3. 自動生成された `rdfs:comment` と LLM 生成の説明（“合成理由”）を付与。
   * 例：`BatterySpec` に `capacity (mAh:int)`, `voltage (V:decimal)`, `chemistry (enum)` を含む。

2. 引き算（difference）

   * `V_all - V_unwanted`：特定の語彙を取り除きたいとき（例：合成語彙から `safetyInfo` を除く）
   * 実装：単純にプロパティ差分 → 変更ログを残す（誰が／いつ差分を作ったか）。

3. 変換（transform）

   * 単位変換（mAh ⇄ Ah）、スケール・正規化、文字列正規化（"NiMH"⇄"Ni-MH"）を自動適用。
   * 変換ルールは語彙に `unitHints` として保持し、変換チェーンを可視化する（`transform: [{from, to, formula, provenance}]`）。

4. 推論／派生（derive）

   * 例：`energyEstimate` を派生 → `capacity (mAh)` と `nominalVoltage (V)` から `energy (Wh)` を計算：`Wh = (mAh / 1000) * V`。
   * ここは**算術演算と単位追跡**が必要。自動化は型/単位の厳密チェックを前提とする。

5. 合成における曖昧さ解決

   * LLM に「合成提案」を作らせ、複数案出力 → 人間がレビューして確定。
   * 各合成オペレーションに対して `confidence` と `explain` を付与（どのマッチが決め手だったかを示す）。

# F. 運用上の注意・リスク・評価

* **曖昧性と誤誘導（LLM Poisoning）**：説明ベースのマッチングは誤リンクを招きやすい。必ず `confidence` と `provenance` を付け、重要な変換はヒューマン承認を要求する。
* **バージョンと互換性**：語彙カタログはバージョン管理（/v1/, /v2/）を必須に。マッチ結果にも語彙バージョンを保存。
* **セキュリティ／プライバシー**：外部 description に個人情報や機密が無いかチェック。LLM に送る情報は最小限に。
* **評価指標**：

  * 自動評価：Precision@K、Recall（既知のゴールドマッピングがある場合）、Mean Reciprocal Rank (MRR)。
  * 人間評価：説明（reason）の有用さを 3-5 人のドメイン専門家で評価。
  * 経済的指標：ヒューマン承認率（低いほど自動化成功）。

# G. API & UX（運用フロー）

* `POST /match-context` — body: `{ description, examples?, sampleValues? }` → returns mapping candidates.
* `POST /apply-mapping` — apply chosen mapping to document; returns normalized JSON-LD using selected vocab IDs and unit conversions.
* UI：候補一覧＋理由（短文）＋生データ比較（before/after）。ワンクリックで「採用」「修正」「却下」。

# H. まとめ（実践提案）

* 技術的には **(1) 埋め込み検索 → (2) ルールフィルタ → (3) LLM による精緻化と理由生成** のパイプラインが現実的で安全に実装可能です。
* 語彙演算（合成／差分／変換）は **メタデータの構造化（datatype, unit, examples）＋算術ルール** を備えることで自動化でき、LLM は「提案」と「説明（言語的根拠）」で使うのが良いバランスです。
* まずは小さなドメイン（電池）で PoC を作り、評価指標（Precision@3、human accept rate）を計測してから拡張するのを強くおすすめします。



