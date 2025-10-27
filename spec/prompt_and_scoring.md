いい選択 — では **LLM による「justification（理由付け）」プロンプトテンプレート**と、それを使った **スコアリング擬似コード** を具体的にお渡しします。
目的は「埋め込み検索で得た候補」を LLM に渡して**（1）候補ごとの自然言語理由を作らせ、（2）構造化された説明（reason types）とスコアを返させる**ことです。さらに **埋め込みスコア＋ルールスコア＋LLMスコア** を合成して最終スコアを出す方式を示します。すぐ使えるプロンプト、期待出力スキーマ、取り込み用パーサ、スコア合成式、閾値運用まで含めています。

# 1) 要件（短く）

* LLM に出す入力は「候補語彙の label/description/metadata」「ドキュメントの description とサンプル値」だけに限定してプライバシーを守る。
* LLM は **JSON only**（機械パースしやすい）で返す。自由文は `explanation` に入れるが主要情報は構造化する。
* 出力に `score`（0..1）と `reasons[]`（複数の reason type）を含める。
* プロンプトは few-shot（2例）で安定化。温度は低め（0.0–0.3）。最大トークンは節度ある値（例 512）。

# 2) プロンプトテンプレート（system + user）

**注意**：プロンプトは LLM によって調整してください（モデル固有のトークン化や制約）。

```
SYSTEM:
You are a concise mapping-justifier assistant. Your job is to evaluate how well a candidate vocabulary entry matches a short document context description and optional sample values. Return JSON only (no extra text). Follow the JSON schema exactly.

For each candidate produce:
- candidateId: string (vocab id)
- candidateLabel: string
- score: number between 0 and 1 (higher = better match)
- reasons: array of { type: one of ["lexical","semantic","instance","datatype","unitCompatibility","ontology","other"], text: short reason string }
- explanation: a short (1-2 sentences) human-readable justification
- provenanceHint: small text about which tokens or values were most influential

USER:
Here is the document context and sample values. Then one or more candidate vocab entries follow. Evaluate each candidate independently.

Document:
{doc_description}
SampleValues (if present): {sample_values}

Candidate:
id: {candidate_id}
label: {candidate_label}
description: {candidate_description}
datatype: {candidate_datatype}
examples: {candidate_examples}
units: {candidate_units}

Return JSON exactly like this array structure:
[
  {
    "candidateId":"....",
    "candidateLabel":"...",
    "score":0.00,
    "reasons":[ {"type":"lexical","text":"..."} ],
    "explanation":"...",
    "provenanceHint":"..."
  }
]
```

# 3) Few-shot examples (inject into prompt) — 2 short examples

Include these after `USER:` and before candidates to stabilize output.

Example 1 (positive):

* Document: "A rechargeable AA battery with capacity in mAh"
* Candidate: label="capacity", description="Electric charge capacity in mAh", datatype="integer", units="mAh"
  Expected LLM output: score 0.95, reasons include lexical + instance + unitCompatibility.

Example 2 (negative):

* Document: "A rechargeable AA battery with capacity in mAh"
* Candidate: label="warrantyPeriod", description="Warranty duration in years", datatype="integer", units="years"
  Expected: score 0.05, reasons include semantic mismatch.

(You will embed these examples in the prompt; keep them very short.)

# 4) 出力 JSON スキーマ（厳密）

```json
[
  {
    "candidateId": "string",
    "candidateLabel": "string",
    "score": 0.0,
    "reasons": [
      { "type": "lexical|semantic|instance|datatype|unitCompatibility|ontology|other", "text": "string" }
    ],
    "explanation": "string",
    "provenanceHint": "string"
  }
]
```

# 5) パースしやすい LLM 出力例（バッテリーケース）

**入力要素**（埋め込み検索で得た candidate と document）を埋めて呼ぶと、LLM が返す想定：

```json
[
  {
    "candidateId": "https://example.org/vocab/battery#capacity",
    "candidateLabel": "capacity",
    "score": 0.92,
    "reasons": [
      { "type": "lexical", "text": "Shared token 'capacity'." },
      { "type": "instance", "text": "Document contains '2000' and unit 'mAh' matching examples." },
      { "type": "datatype", "text": "Both expect integer-like values." }
    ],
    "explanation": "High lexical overlap and matching unit/instance values indicate a strong match.",
    "provenanceHint": "Tokens: 'capacity','mAh','2000'"
  }
]
```

# 6) スコア合成 — 数式と重み（提案）

最終スコア `S_final` は **埋め込みスコア E (0..1)**、**ルールスコア R (0..1)**、**LLM スコア L (0..1)** の重み和で算出します。ルールスコアは単位/型チェック・必須語フィルタなどの deterministic 判定。

提案重み（実務での初期値）：

* w_E = 0.45
* w_R = 0.25
* w_L = 0.30

式：

```
S_final = clamp( w_E * E + w_R * R + w_L * L , 0.0, 1.0 )
```

`clamp` は 0..1 に切り詰め。

**ルールスコア R の計算例（0..1）**:

* 型互換 (datatype): +0.4 if compatible, +0 if incompatible
* 単位互換: +0.3 if exact match or convertible, +0 if incompatible
* label token overlap: +0.2 if label token appears
* mandatory field match: +0.1

合算後 normalize（最大が1になるよう除算） — つまり R を 0..1 に正規化する。

# 7) 疑似コード（Python風） — 全体パイプライン

```python
def match_and_score(doc_description, sample_values, candidates, embed_model, llm):
    # 1. embed doc
    doc_vec = embed_model.embed(doc_description)

    results = []
    for cand in candidates:
        # 2. embedding similarity
        cand_vec = cand['embedding']  # precomputed
        E = cosine_similarity(doc_vec, cand_vec)  # in 0..1

        # 3. rule-based checks => R_raw
        R_raw = 0.0
        if datatype_compatible(sample_values, cand['datatype']):
            R_raw += 0.4
        if units_compatible(sample_values.get('unit'), cand.get('units')):
            R_raw += 0.3
        if token_overlap(doc_description, cand['label']):
            R_raw += 0.2
        if mandatory_field_matches(doc_description, cand):
            R_raw += 0.1
        # normalize R_raw to 0..1 (max possible = 1.0 here)
        R = min(R_raw, 1.0)

        # 4. LLM justification => L (0..1) and structured reasons
        llm_input = fill_prompt_template(doc_description, sample_values, cand)
        llm_json = llm.call(llm_input, temperature=0.2)
        # parse JSON
        L = llm_json['score']  # expects 0..1
        reasons = llm_json['reasons']
        explanation = llm_json['explanation']

        # 5. final score
        wE, wR, wL = 0.45, 0.25, 0.30
        S_final = max(0.0, min(1.0, wE*E + wR*R + wL*L))

        results.append({
            'candidateId': cand['id'],
            'label': cand['label'],
            'E': E, 'R': R, 'L': L, 'score': S_final,
            'llm_reasons': reasons, 'explanation': explanation
        })

    # 6. sort and return
    results.sort(key=lambda x: x['score'], reverse=True)
    return results
```

# 8) LLM プロンプトの実装メモ（安定化のための注意）

* 指定は **「JSON only」** にして、失敗時にフォールバックで `{"error":"..."} ` を返すように促す。
* Few-shot 例を必ず入れる（1 positive / 1 negative）。
* トークン数抑制：候補ごとに個別に LLM 呼び出しをする（候補数が多いとコスト高になるので上位 K のみに絞る）。
* 温度は 0.0–0.3、トップK/TopP も抑える。
* 返却 `score` を LLM に算出させる場合は「0..1 の数値を出せ」と明確指示する（例: "Return a JSON where score is a number between 0 and 1. Do not output percent signs.").
* LLM が JSON を壊すことがあるので **出力を厳密にバリデート**して、parse エラーなら再試行 or fallback to simple heuristic.

# 9) 閾値運用（推奨初期設定）

* `S_final >= 0.90` → **自動採用（no human）**
* `0.75 <= S_final < 0.90` → **自動候補として提示（UI: one-click confirm）**
* `S_final < 0.75` → **ヒューマンレビュー必須**（表示理由付き）

これらはドメイン・リスクにより調整。

# 10) 典型的な failure ケース と対策

* **症状**: LLM gives plausible-sounding but wrong reason. → **対策**: require anchoring by instance evidence and unit checks (deterministic filters) before allowing high `S_final`.
* **症状**: JSON malformed → **対策**: re-prompt with strict wrapper or use a small parser model to extract JSON.
* **症状**: ambiguous short descriptions → **対策**: request sample values or context expansion; present top-K to human.

# 11) 出力に付ける provenance 例（必須）

各 candidate の `provenance` に下記事項を入れる：

* embeddingModel, embeddingScore (E), embeddingTimestamp
* llmModel, llmPromptId, llmScore (L), llmTimestamp
* ruleChecks summary (R breakdown)
  これで後追い監査と改善が可能。

# 12) 小さな実行例（擬似入出力）

Input to pipeline:

* doc_description = "A rechargeable cylindrical battery (AA) with capacity in mAh and nominal voltage 1.2V."
* sample_values = {"capacity":2000,"unit":"mAh","nominalVoltage":1.2}
* candidate = { id: "...#capacity", label:"capacity", description:"Electric charge capacity expressed in mAh", datatype:"integer", units:"mAh", embedding: [...]}

Pipeline returns (truncated):

```json
{
  "candidateId":"...#capacity",
  "E":0.86,
  "R":0.95,
  "L":0.92,
  "score": 0.902  // after weighted sum
}
```

→ 自動採用（S_final >= 0.90）

