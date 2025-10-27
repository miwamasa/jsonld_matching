/**
 * Main Application - Integrates matching, normalization, and derivation
 */

let vocabularyCatalog = null;
let matchingEngine = null;
let normalizer = null;
let derivationEngine = null;
let currentThreshold = 0.75;

// Sample documents
const samples = {
  1: {
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
  },
  2: {
    "@context": [
      {
        "description": "Lithium-ion rechargeable cell with 18650 form factor. Has high capacity around 3000-3500 mAh and nominal voltage of 3.7V. Suitable for high-drain applications."
      }
    ],
    "@id": "urn:doc:local:bat-002",
    "@type": "BatteryDocument",
    "label": "18650 Li-ion Cell",
    "capacity": 3500,
    "capacityUnit": "mAh",
    "nominalVoltage": 3.7,
    "chemistry": "Li-ion",
    "size": "18650",
    "rechargeable": true
  },
  3: {
    "@context": [
      {
        "description": "Non-rechargeable alkaline battery (AAA size) with voltage 1.5V. Manufacturer is Duracell. Suitable for low-drain devices."
      }
    ],
    "@id": "urn:doc:local:bat-003",
    "@type": "BatteryDocument",
    "label": "Duracell AAA Alkaline",
    "nominalVoltage": 1.5,
    "chemistry": "Alkaline",
    "size": "AAA",
    "manufacturer": "Duracell",
    "rechargeable": false
  }
};

/**
 * Initialize application on page load
 */
async function init() {
  try {
    // Load vocabulary catalog
    const response = await fetch('data/vocabulary_catalog.json');
    vocabularyCatalog = await response.json();

    // Initialize engines
    matchingEngine = new MatchingEngine(vocabularyCatalog);
    normalizer = new Normalizer(vocabularyCatalog);
    derivationEngine = new DerivationEngine();

    console.log('Application initialized successfully');
  } catch (error) {
    console.error('Failed to initialize application:', error);
    showError('アプリケーションの初期化に失敗しました: ' + error.message);
  }
}

/**
 * Load sample document
 */
function loadSample(num) {
  const sample = samples[num];
  if (sample) {
    document.getElementById('documentInput').value = JSON.stringify(sample, null, 2);
  }
}

/**
 * Update threshold value display
 */
function updateThreshold() {
  const slider = document.getElementById('thresholdSlider');
  const value = slider.value / 100;
  currentThreshold = value;
  document.getElementById('thresholdValue').textContent = value.toFixed(2);
}

/**
 * Run matching process
 */
function runMatching() {
  try {
    // Parse input document
    const input = document.getElementById('documentInput').value;
    if (!input.trim()) {
      showError('ドキュメントを入力してください');
      return;
    }

    const inputDoc = JSON.parse(input);

    // Run matching
    const matchResult = matchingEngine.matchDocument(inputDoc);

    if (matchResult.error) {
      showError(matchResult.error);
      return;
    }

    // Display matching results
    displayMatchingResults(matchResult);

    // Run normalization
    const normalized = normalizer.normalize(
      inputDoc,
      matchResult.matches,
      currentThreshold
    );

    // Apply derivations
    const mappingEvidence = normalized["batt:normalization"]?.mappingEvidence || [];
    const withDerivations = derivationEngine.applyDerivations(
      normalized,
      inputDoc,
      mappingEvidence
    );

    // Display normalized output
    displayNormalizedOutput(withDerivations);

  } catch (error) {
    showError('エラーが発生しました: ' + error.message);
    console.error(error);
  }
}

/**
 * Display matching results in UI
 */
function displayMatchingResults(result) {
  const container = document.getElementById('matchingResults');

  // Clear previous results
  container.innerHTML = '';

  // Add stats
  const stats = document.createElement('div');
  stats.className = 'stats';
  stats.innerHTML = `
    <div class="stat-card">
      <div class="stat-value">${result.matches.length}</div>
      <div class="stat-label">候補</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${result.matches.filter(m => m.score >= currentThreshold).length}</div>
      <div class="stat-label">採用</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${result.matches.length > 0 ? result.matches[0].score.toFixed(2) : 'N/A'}</div>
      <div class="stat-label">最高スコア</div>
    </div>
  `;
  container.appendChild(stats);

  // Add success message
  if (result.matches.length > 0) {
    const successMsg = document.createElement('div');
    successMsg.className = 'success';
    successMsg.textContent = `${result.matches.length} 件の候補が見つかりました（閾値 ${currentThreshold} で ${result.matches.filter(m => m.score >= currentThreshold).length} 件を採用）`;
    container.appendChild(successMsg);
  } else {
    const errorMsg = document.createElement('div');
    errorMsg.className = 'error';
    errorMsg.textContent = 'マッチする語彙が見つかりませんでした';
    container.appendChild(errorMsg);
    return;
  }

  // Display each match
  result.matches.forEach(match => {
    const card = createMatchCard(match);
    container.appendChild(card);
  });
}

/**
 * Create match card element
 */
function createMatchCard(match) {
  const card = document.createElement('div');
  card.className = 'match-card';

  // Determine score class
  let scoreClass = 'score-low';
  if (match.score >= 0.75) scoreClass = 'score-high';
  else if (match.score >= 0.5) scoreClass = 'score-medium';

  // Header
  const header = document.createElement('div');
  header.className = 'match-header';
  header.innerHTML = `
    <div class="match-label">${match.label}</div>
    <div class="match-score ${scoreClass}">${match.score.toFixed(2)}</div>
  `;
  card.appendChild(header);

  // Details
  const details = document.createElement('div');
  details.className = 'match-details';
  details.innerHTML = `
    <strong>ID:</strong> ${match.vocabId}<br>
    <strong>スコア内訳:</strong> E=${match.scores.E.toFixed(2)}, R=${match.scores.R.toFixed(2)}, L=${match.scores.L.toFixed(2)}<br>
    <strong>説明:</strong> ${match.explanation}
  `;
  card.appendChild(details);

  // Reasons
  if (match.reasons && match.reasons.length > 0) {
    const reasonsDiv = document.createElement('div');
    reasonsDiv.className = 'reasons';
    const reasonsTitle = document.createElement('div');
    reasonsTitle.innerHTML = '<strong>理由:</strong>';
    reasonsDiv.appendChild(reasonsTitle);

    match.reasons.forEach(reason => {
      const tag = document.createElement('span');
      tag.className = `reason-tag ${reason.type}`;
      tag.textContent = `${reason.type}: ${reason.text}`;
      reasonsDiv.appendChild(tag);
    });

    card.appendChild(reasonsDiv);
  }

  // Highlight if accepted
  if (match.score >= currentThreshold) {
    card.style.borderLeft = '4px solid #38ef7d';
  }

  return card;
}

/**
 * Display normalized output
 */
function displayNormalizedOutput(normalized) {
  const container = document.getElementById('normalizedOutput');
  container.innerHTML = '';

  // Add success message
  const successMsg = document.createElement('div');
  successMsg.className = 'success';
  successMsg.textContent = '正規化と派生計算が完了しました';
  container.appendChild(successMsg);

  // Show derivation info if present
  if (normalized["batt:derivation"]) {
    const derivInfo = normalized["batt:derivation"];
    if (derivInfo.properties && derivInfo.properties.length > 0) {
      const infoBox = document.createElement('div');
      infoBox.className = 'info-box';
      let infoHtml = '<strong>派生プロパティ:</strong><br>';

      derivInfo.properties.forEach(prop => {
        infoHtml += `<br><strong>${prop.property}</strong>: ${prop.formula}<br>`;
        infoHtml += `入力: ${JSON.stringify(prop.inputs)}<br>`;
        infoHtml += `信頼度: ${(prop.confidence * 100).toFixed(0)}%<br>`;
        if (prop.steps) {
          infoHtml += '計算ステップ:<br>';
          prop.steps.forEach(step => {
            infoHtml += `  • ${step}<br>`;
          });
        }
      });

      infoBox.innerHTML = infoHtml;
      container.appendChild(infoBox);
    }
  }

  // Show JSON output
  const codeBlock = document.createElement('pre');
  codeBlock.className = 'code-block';
  codeBlock.textContent = JSON.stringify(normalized, null, 2);
  container.appendChild(codeBlock);
}

/**
 * Show error message
 */
function showError(message) {
  const matchingResults = document.getElementById('matchingResults');
  matchingResults.innerHTML = `<div class="error">${message}</div>`;
}

/**
 * Clear all inputs and outputs
 */
function clearAll() {
  document.getElementById('documentInput').value = '';
  document.getElementById('matchingResults').innerHTML = '<div class="info-box">左側でドキュメントを入力またはサンプルを選択し、「マッチング実行」ボタンをクリックしてください。</div>';
  document.getElementById('normalizedOutput').innerHTML = '<div class="info-box">マッチング実行後、正規化されたJSON-LDが表示されます。</div>';
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', init);
