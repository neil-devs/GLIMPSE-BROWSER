const fs = require('fs');
const path = require('path');
const { generateSyntheticSessions, sessionsToVectors } = require('../apps/cloud-api/src/ml/simulate');
const { GBDT } = require('../apps/cloud-api/src/ml/gbdt');
const { exportModel } = require('../apps/cloud-api/src/ml/export-model');

console.log('Generating synthetic training data for default model...');
const sessions = generateSyntheticSessions(150, true, 42);

// Compute domainStats
const domainCounts = {};
for (const s of sessions) {
  for (const l of s.links) {
    if (!domainCounts[l.domain]) domainCounts[l.domain] = { impressions: 0, clicks: 0 };
    domainCounts[l.domain].impressions++;
    if (l.clicked) domainCounts[l.domain].clicks++;
  }
}

const domainStats = {};
const PRIOR_CTR = 0.2;
const PRIOR_WEIGHT = 10;
for (const [dom, stats] of Object.entries(domainCounts)) {
  const smoothed = (stats.clicks + PRIOR_CTR * PRIOR_WEIGHT) / (stats.impressions + PRIOR_WEIGHT);
  domainStats[dom] = {
    impressions: stats.impressions,
    clicks: stats.clicks,
    smoothedCtr: Number(smoothed.toFixed(4)),
  };
}

const data = sessionsToVectors(sessions, domainStats);
console.log('Training GBDT model on', data.X.length, 'samples...');
const gbdt = new GBDT({
  nEstimators: 15,
  learningRate: 0.1,
  maxDepth: 4,
  minChildWeight: 0.1,
  lambda: 1.0,
  seed: 42,
});
gbdt.fit(data.X, data.y);

console.log('Exporting model to JSON...');
const exported = exportModel({
  model: gbdt,
  metrics: { note: 'Bundled default heuristic GBDT model' },
  domainStats,
  versionString: 'v2.0.0-bundled',
});

const os = require('os');
const tmpPath = path.join(os.tmpdir(), 'default-model.json');
fs.writeFileSync(tmpPath, JSON.stringify(exported.modelJson, null, 2), 'utf8');
console.log('Saved default model to tmp:', tmpPath);
console.log('Checksum:', exported.checksumSha256);
process.exit(0);
