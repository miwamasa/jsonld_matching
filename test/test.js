/**
 * Simple test script to verify the matching system works
 * Run with: node test/test.js
 */

const fs = require('fs');
const path = require('path');

// Load modules
const MatchingEngine = require('../src/matching_engine.js');
const Normalizer = require('../src/normalizer.js');
const DerivationEngine = require('../src/derivation.js');

// Load vocabulary catalog
const catalogPath = path.join(__dirname, '../data/vocabulary_catalog.json');
const vocabularyCatalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

// Load sample document
const docPath = path.join(__dirname, '../data/sample_document_1.json');
const sampleDocument = JSON.parse(fs.readFileSync(docPath, 'utf8'));

console.log('=== JSON-LD Matching System Test ===\n');

// Initialize engines
const matchingEngine = new MatchingEngine(vocabularyCatalog);
const normalizer = new Normalizer(vocabularyCatalog);
const derivationEngine = new DerivationEngine();

console.log('1. Testing Matching Engine...');
const matchResult = matchingEngine.matchDocument(sampleDocument);
console.log(`   Found ${matchResult.matches.length} candidates`);
console.log(`   Top 3 matches:`);
matchResult.matches.slice(0, 3).forEach((match, i) => {
  console.log(`     ${i+1}. ${match.label} - Score: ${match.score.toFixed(3)} (E:${match.scores.E.toFixed(2)} R:${match.scores.R.toFixed(2)} L:${match.scores.L.toFixed(2)})`);
});

console.log('\n2. Testing Normalizer...');
const normalized = normalizer.normalize(sampleDocument, matchResult.matches, 0.75);
console.log(`   Applied ${normalized["batt:normalization"].appliedMatches} matches`);
console.log(`   Properties: ${Object.keys(normalized).filter(k => k.startsWith('batt:')).join(', ')}`);

console.log('\n3. Testing Derivation Engine...');
const mappingEvidence = normalized["batt:normalization"]?.mappingEvidence || [];
const withDerivations = derivationEngine.applyDerivations(normalized, sampleDocument, mappingEvidence);

if (withDerivations["batt:derivation"]) {
  const derivation = withDerivations["batt:derivation"];
  console.log(`   Derived properties: ${derivation.properties.length}`);
  derivation.properties.forEach(prop => {
    console.log(`     - ${prop.property}: ${prop.formula}`);
    console.log(`       Value: ${withDerivations[`batt:${prop.property}`]['@value']} ${prop.unit}`);
    console.log(`       Confidence: ${(prop.confidence * 100).toFixed(0)}%`);
  });
}

console.log('\n4. Verification...');
// Check if energyWh was calculated correctly
if (withDerivations["batt:energyWh"]) {
  const energyWh = withDerivations["batt:energyWh"]["@value"];
  const expectedWh = (2000 / 1000) * 1.2; // 2.4 Wh
  const isCorrect = Math.abs(energyWh - expectedWh) < 0.01;
  console.log(`   Energy calculation: ${energyWh} Wh (expected ${expectedWh} Wh) - ${isCorrect ? '✓ PASS' : '✗ FAIL'}`);
} else {
  console.log('   Energy calculation: ✗ FAIL (property not derived)');
}

// Check if capacity was matched
const hasCapacity = withDerivations["batt:capacity"] !== undefined;
console.log(`   Capacity matched: ${hasCapacity ? '✓ PASS' : '✗ FAIL'}`);

// Check if nominalVoltage was matched
const hasVoltage = withDerivations["batt:nominalVoltage"] !== undefined;
console.log(`   Voltage matched: ${hasVoltage ? '✓ PASS' : '✗ FAIL'}`);

console.log('\n=== Test Complete ===');

// Save output for inspection
const outputPath = path.join(__dirname, 'test_output.json');
fs.writeFileSync(outputPath, JSON.stringify(withDerivations, null, 2));
console.log(`\nFull output saved to: ${outputPath}`);
