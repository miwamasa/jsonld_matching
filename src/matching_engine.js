/**
 * JSON-LD Matching Engine
 * Implements text-based similarity matching with rule-based filtering and scoring
 */

class MatchingEngine {
  constructor(vocabularyCatalog) {
    this.vocabularies = vocabularyCatalog.vocabularies;
    this.version = vocabularyCatalog.version;
  }

  /**
   * Main matching function: takes document and returns scored candidates
   */
  matchDocument(doc) {
    const docDescription = this.extractDescription(doc);
    const sampleValues = this.extractSampleValues(doc);

    if (!docDescription) {
      return { error: "No description found in @context" };
    }

    const candidates = this.vocabularies.map(vocab => {
      return this.scoreCandidate(vocab, docDescription, sampleValues, doc);
    });

    // Sort by final score descending
    candidates.sort((a, b) => b.score - a.score);

    return {
      inputDescription: docDescription,
      sampleValues: sampleValues,
      matches: candidates.filter(c => c.score > 0.3), // threshold
      timestamp: new Date().toISOString(),
      provenance: {
        matchingEngine: "MatchingEngine-v1.0",
        catalogVersion: this.version
      }
    };
  }

  /**
   * Extract description from @context
   */
  extractDescription(doc) {
    if (!doc["@context"]) return null;

    const contexts = Array.isArray(doc["@context"])
      ? doc["@context"]
      : [doc["@context"]];

    for (const ctx of contexts) {
      if (ctx.description) {
        return ctx.description;
      }
    }
    return null;
  }

  /**
   * Extract sample values from document
   */
  extractSampleValues(doc) {
    const values = {};
    for (const [key, value] of Object.entries(doc)) {
      if (!key.startsWith('@') && typeof value !== 'object') {
        values[key] = value;
      }
    }
    return values;
  }

  /**
   * Score a single candidate vocabulary against document
   */
  scoreCandidate(vocab, docDescription, sampleValues, doc) {
    // 1. Text similarity score (E - embedding approximation)
    const E = this.computeTextSimilarity(docDescription, vocab.description);

    // 2. Rule-based score (R)
    const R = this.computeRuleScore(vocab, sampleValues, document);

    // 3. Mock LLM score with reasons (L)
    const llmResult = this.computeLLMScore(vocab, docDescription, sampleValues);
    const L = llmResult.score;

    // 4. Weighted final score
    const wE = 0.45, wR = 0.25, wL = 0.30;
    const finalScore = Math.max(0, Math.min(1, wE * E + wR * R + wL * L));

    return {
      vocabId: vocab.id,
      label: vocab.label,
      score: finalScore,
      scores: { E, R, L }, // breakdown
      reasons: llmResult.reasons,
      explanation: llmResult.explanation,
      provenance: {
        embeddingScore: E,
        ruleScore: R,
        llmScore: L,
        timestamp: new Date().toISOString(),
        method: "text-similarity + rules + mock-llm"
      }
    };
  }

  /**
   * Compute text similarity using simple token-based approach
   * (approximates embedding similarity)
   */
  computeTextSimilarity(text1, text2) {
    const tokens1 = this.tokenize(text1.toLowerCase());
    const tokens2 = this.tokenize(text2.toLowerCase());

    // Jaccard similarity
    const set1 = new Set(tokens1);
    const set2 = new Set(tokens2);
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    if (union.size === 0) return 0;

    const jaccard = intersection.size / union.size;

    // Boost for exact label matches
    const labelBoost = tokens1.includes(this.tokenize(text2)[0]) ? 0.2 : 0;

    return Math.min(1.0, jaccard + labelBoost);
  }

  /**
   * Tokenize text into words
   */
  tokenize(text) {
    return text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2);
  }

  /**
   * Compute rule-based score
   */
  computeRuleScore(vocab, sampleValues, doc) {
    let score = 0;

    // Check if label appears in document values
    const labelInDoc = Object.keys(doc).some(key =>
      key.toLowerCase().includes(vocab.label.toLowerCase())
    );
    if (labelInDoc) score += 0.4;

    // Check datatype compatibility
    const valueForLabel = sampleValues[vocab.label] ||
                         Object.values(sampleValues).find(v =>
                           this.isTypeCompatible(v, vocab.datatype)
                         );

    if (valueForLabel !== undefined) {
      if (this.isTypeCompatible(valueForLabel, vocab.datatype)) {
        score += 0.3;
      }
    }

    // Check unit compatibility
    const unitKeys = Object.keys(sampleValues).filter(k =>
      k.toLowerCase().includes('unit') || vocab.units.some(u =>
        k.toLowerCase().includes(u.toLowerCase())
      )
    );

    for (const key of unitKeys) {
      const unit = sampleValues[key];
      if (vocab.units.includes(unit)) {
        score += 0.2;
        break;
      }
    }

    // Token overlap in description
    const docTokens = this.tokenize(vocab.label);
    const hasOverlap = docTokens.some(token =>
      Object.keys(sampleValues).some(key =>
        key.toLowerCase().includes(token)
      )
    );
    if (hasOverlap) score += 0.1;

    return Math.min(1.0, score);
  }

  /**
   * Check type compatibility
   */
  isTypeCompatible(value, datatype) {
    switch (datatype) {
      case 'integer':
        return Number.isInteger(value);
      case 'decimal':
      case 'float':
        return typeof value === 'number';
      case 'string':
        return typeof value === 'string';
      case 'boolean':
        return typeof value === 'boolean';
      default:
        return true; // unknown types pass
    }
  }

  /**
   * Mock LLM scoring with reason generation
   * In production, this would call an actual LLM API
   */
  computeLLMScore(vocab, docDescription, sampleValues) {
    const reasons = [];
    let score = 0.5; // base score

    // Lexical analysis
    const docTokens = this.tokenize(docDescription);
    const vocabTokens = this.tokenize(vocab.description);
    const labelTokens = this.tokenize(vocab.label);

    const commonTokens = docTokens.filter(t => vocabTokens.includes(t));
    if (commonTokens.length > 0) {
      reasons.push({
        type: "lexical",
        text: `Shared tokens: ${commonTokens.slice(0, 3).join(', ')}`
      });
      score += 0.15;
    }

    // Label in description
    if (docTokens.some(t => labelTokens.includes(t))) {
      reasons.push({
        type: "lexical",
        text: `Label '${vocab.label}' found in description`
      });
      score += 0.2;
    }

    // Instance evidence
    const matchingValue = sampleValues[vocab.label];
    if (matchingValue !== undefined) {
      const exampleMatch = vocab.examples && vocab.examples.some(ex =>
        ex === matchingValue || (typeof ex === 'number' &&
          Math.abs(ex - matchingValue) / ex < 0.5)
      );

      if (exampleMatch) {
        reasons.push({
          type: "instance",
          text: `Document value ${matchingValue} matches vocabulary examples`
        });
        score += 0.2;
      } else {
        reasons.push({
          type: "instance",
          text: `Document has value ${matchingValue} for '${vocab.label}'`
        });
        score += 0.1;
      }
    }

    // Datatype check
    if (matchingValue !== undefined && this.isTypeCompatible(matchingValue, vocab.datatype)) {
      reasons.push({
        type: "datatype",
        text: `Value type matches expected ${vocab.datatype}`
      });
      score += 0.1;
    }

    // Unit compatibility
    for (const [key, value] of Object.entries(sampleValues)) {
      if (typeof value === 'string' && vocab.units.includes(value)) {
        reasons.push({
          type: "unitCompatibility",
          text: `Unit '${value}' matches vocabulary units`
        });
        score += 0.15;
        break;
      }
    }

    // Semantic analysis (simple heuristic)
    if (vocab.category) {
      const categoryWords = {
        electrical: ['voltage', 'capacity', 'power', 'energy', 'current'],
        physical: ['size', 'weight', 'dimension', 'form'],
        material: ['chemistry', 'material', 'composition'],
        functional: ['rechargeable', 'function', 'capability']
      };

      const relevantWords = categoryWords[vocab.category] || [];
      if (relevantWords.some(w => docDescription.toLowerCase().includes(w))) {
        reasons.push({
          type: "semantic",
          text: `Document mentions ${vocab.category}-related concepts`
        });
        score += 0.1;
      }
    }

    score = Math.min(1.0, score);

    const explanation = reasons.length > 0
      ? `Match based on ${reasons.map(r => r.type).join(', ')}`
      : 'Weak or no match found';

    return { score, reasons, explanation };
  }
}

// Export for use in browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MatchingEngine;
}
