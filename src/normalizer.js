/**
 * Normalizer - Converts matched documents to standard JSON-LD format
 * with vocabulary URIs and unit conversions
 */

class Normalizer {
  constructor(vocabularyCatalog) {
    this.vocabularies = vocabularyCatalog.vocabularies;
    this.vocabMap = new Map(
      vocabularyCatalog.vocabularies.map(v => [v.label, v])
    );
  }

  /**
   * Normalize document using matched vocabularies
   * @param {Object} doc - Original document
   * @param {Array} matches - Matched vocabularies with scores
   * @param {number} threshold - Minimum score to accept match (default 0.75)
   */
  normalize(doc, matches, threshold = 0.75) {
    const acceptedMatches = matches.filter(m => m.score >= threshold);

    // Build context
    const context = {
      "batt": "https://example.org/vocab/battery#",
      "xsd": "http://www.w3.org/2001/XMLSchema#",
      "label": "http://www.w3.org/2000/01/rdf-schema#label"
    };

    // Build normalized document
    const normalized = {
      "@context": context,
      "@id": doc["@id"] || "urn:doc:unknown",
      "@type": "batt:Battery"
    };

    // Add label if present
    if (doc.label) {
      normalized.label = doc.label;
    }

    // Map properties using accepted matches
    const mappingEvidence = [];

    for (const match of acceptedMatches) {
      const vocab = this.vocabMap.get(match.label);
      if (!vocab) continue;

      // Find corresponding value in document
      const value = doc[match.label];
      if (value === undefined) continue;

      // Convert and add property
      const propertyKey = `batt:${match.label}`;
      normalized[propertyKey] = this.convertValue(value, vocab);

      // Check for unit field
      const unitKey = `${match.label}Unit`;
      if (doc[unitKey]) {
        normalized[`batt:${match.label}Unit`] = doc[unitKey];
      }

      // Record evidence
      mappingEvidence.push({
        field: match.label,
        vocabId: match.vocabId,
        score: match.score,
        reasons: match.reasons.map(r => r.text)
      });
    }

    // Add normalization metadata
    normalized["batt:normalization"] = {
      appliedMatches: acceptedMatches.length,
      totalCandidates: matches.length,
      threshold: threshold,
      mappingEvidence: mappingEvidence,
      timestamp: new Date().toISOString()
    };

    return normalized;
  }

  /**
   * Convert value to typed literal
   */
  convertValue(value, vocab) {
    let xsdType;
    switch (vocab.datatype) {
      case 'integer':
        xsdType = 'xsd:integer';
        break;
      case 'decimal':
      case 'float':
        xsdType = 'xsd:decimal';
        break;
      case 'string':
        xsdType = 'xsd:string';
        break;
      case 'boolean':
        xsdType = 'xsd:boolean';
        break;
      default:
        return value; // return as-is
    }

    return {
      "@value": value,
      "@type": xsdType
    };
  }

  /**
   * Convert units (basic conversions)
   */
  convertUnit(value, fromUnit, toUnit) {
    const conversions = {
      // Capacity
      'mAh->Ah': (v) => v / 1000,
      'Ah->mAh': (v) => v * 1000,

      // Voltage (identity)
      'V->V': (v) => v,

      // Weight
      'g->kg': (v) => v / 1000,
      'kg->g': (v) => v * 1000,
      'g->oz': (v) => v * 0.035274,
      'oz->g': (v) => v / 0.035274,

      // Energy
      'Wh->kWh': (v) => v / 1000,
      'kWh->Wh': (v) => v * 1000
    };

    const key = `${fromUnit}->${toUnit}`;
    if (conversions[key]) {
      return {
        value: conversions[key](value),
        converted: true,
        formula: key
      };
    }

    return {
      value: value,
      converted: false,
      error: `No conversion from ${fromUnit} to ${toUnit}`
    };
  }

  /**
   * Normalize units in document to standard units
   */
  normalizeUnits(normalized, doc) {
    const standardUnits = {
      capacity: 'Ah',
      nominalVoltage: 'V',
      weight: 'kg',
      energyWh: 'Wh'
    };

    const conversions = [];

    for (const [property, standardUnit] of Object.entries(standardUnits)) {
      const valueKey = `batt:${property}`;
      const unitKey = `batt:${property}Unit`;

      if (normalized[valueKey] && normalized[unitKey]) {
        const currentUnit = normalized[unitKey];
        if (currentUnit !== standardUnit) {
          const result = this.convertUnit(
            normalized[valueKey]['@value'],
            currentUnit,
            standardUnit
          );

          if (result.converted) {
            normalized[valueKey]['@value'] = result.value;
            normalized[unitKey] = standardUnit;
            conversions.push({
              property,
              from: currentUnit,
              to: standardUnit,
              formula: result.formula
            });
          }
        }
      }
    }

    if (conversions.length > 0) {
      normalized["batt:unitConversions"] = conversions;
    }

    return normalized;
  }
}

// Export for use in browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Normalizer;
}
