/**
 * Derivation Engine - Computes derived properties with provenance tracking
 */

class DerivationEngine {
  constructor() {
    this.derivations = {
      energyWh: this.deriveEnergyWh.bind(this)
    };
  }

  /**
   * Apply all applicable derivations to normalized document
   */
  applyDerivations(normalized, originalDocument, matchingEvidence) {
    const derivedProperties = [];

    // Try each derivation
    for (const [propName, deriveFn] of Object.entries(this.derivations)) {
      const result = deriveFn(normalized, originalDocument);
      if (result.success) {
        // Add derived property
        normalized[`batt:${propName}`] = result.value;

        // Add derivation metadata
        derivedProperties.push({
          property: propName,
          formula: result.formula,
          inputs: result.inputs,
          steps: result.steps,
          confidence: result.confidence,
          unit: result.unit
        });
      }
    }

    // Add derivation provenance
    if (derivedProperties.length > 0) {
      normalized["batt:derivation"] = {
        properties: derivedProperties,
        mappingEvidence: matchingEvidence,
        timestamp: new Date().toISOString(),
        method: "rule-based-calculation"
      };
    }

    return normalized;
  }

  /**
   * Derive energy in Wh from capacity (mAh) and voltage (V)
   * Formula: Wh = (mAh / 1000) * V
   */
  deriveEnergyWh(normalized, originalDocument) {
    // Extract capacity and voltage
    let capacityMah = null;
    let voltageV = null;

    // Try to get from normalized document
    if (normalized["batt:capacity"]) {
      capacityMah = this.extractValue(normalized["batt:capacity"]);
      const unit = normalized["batt:capacityUnit"];
      // Convert to mAh if needed
      if (unit === "Ah") {
        capacityMah = capacityMah * 1000;
      }
    }

    if (normalized["batt:nominalVoltage"]) {
      voltageV = this.extractValue(normalized["batt:nominalVoltage"]);
    }

    // Fallback to original document
    if (capacityMah === null && originalDocument.capacity) {
      capacityMah = originalDocument.capacity;
      const unit = originalDocument.capacityUnit || "mAh";
      if (unit === "Ah") {
        capacityMah = capacityMah * 1000;
      }
    }

    if (voltageV === null && originalDocument.nominalVoltage) {
      voltageV = originalDocument.nominalVoltage;
    }

    // Check if we have required values
    if (capacityMah === null || voltageV === null) {
      return { success: false, reason: "Missing required inputs (capacity, voltage)" };
    }

    // Validate types
    if (typeof capacityMah !== 'number' || typeof voltageV !== 'number') {
      return { success: false, reason: "Invalid input types" };
    }

    // Perform calculation
    const steps = [];
    steps.push(`Input: capacity = ${capacityMah} mAh, voltage = ${voltageV} V`);

    const capacityAh = capacityMah / 1000;
    steps.push(`Convert capacity: ${capacityMah} mAh ÷ 1000 = ${capacityAh} Ah`);

    const energyWh = capacityAh * voltageV;
    steps.push(`Compute energy: ${capacityAh} Ah × ${voltageV} V = ${energyWh} Wh`);

    // Round to reasonable precision
    const energyWhRounded = Math.round(energyWh * 100) / 100;

    // Determine confidence based on input quality
    let confidence = 0.95;
    if (!normalized["batt:capacity"] || !normalized["batt:nominalVoltage"]) {
      confidence = 0.85; // lower if using fallback values
    }

    return {
      success: true,
      value: {
        "@value": energyWhRounded,
        "@type": "xsd:decimal"
      },
      formula: "Wh = (mAh / 1000) * V",
      inputs: {
        capacity_mAh: capacityMah,
        nominalVoltage_V: voltageV
      },
      steps: steps,
      confidence: confidence,
      unit: "Wh"
    };
  }

  /**
   * Extract numeric value from typed literal or plain value
   */
  extractValue(obj) {
    if (typeof obj === 'number') {
      return obj;
    }
    if (obj && typeof obj === 'object' && obj["@value"] !== undefined) {
      return obj["@value"];
    }
    return null;
  }

  /**
   * Derive power rating (W) if current (A) and voltage (V) are available
   * Formula: W = A * V
   */
  derivePowerW(normalized, originalDocument) {
    let currentA = null;
    let voltageV = null;

    if (normalized["batt:current"]) {
      currentA = this.extractValue(normalized["batt:current"]);
    }
    if (normalized["batt:nominalVoltage"]) {
      voltageV = this.extractValue(normalized["batt:nominalVoltage"]);
    }

    // Fallback to original
    if (currentA === null && originalDocument.current) {
      currentA = originalDocument.current;
    }
    if (voltageV === null && originalDocument.nominalVoltage) {
      voltageV = originalDocument.nominalVoltage;
    }

    if (currentA === null || voltageV === null) {
      return { success: false, reason: "Missing required inputs (current, voltage)" };
    }

    const powerW = currentA * voltageV;

    return {
      success: true,
      value: {
        "@value": Math.round(powerW * 100) / 100,
        "@type": "xsd:decimal"
      },
      formula: "W = A * V",
      inputs: {
        current_A: currentA,
        voltage_V: voltageV
      },
      steps: [
        `Input: current = ${currentA} A, voltage = ${voltageV} V`,
        `Compute power: ${currentA} A × ${voltageV} V = ${powerW} W`
      ],
      confidence: 0.95,
      unit: "W"
    };
  }
}

// Export for use in browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DerivationEngine;
}
