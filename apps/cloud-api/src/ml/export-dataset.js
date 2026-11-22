/**
 * @fileoverview CLI script to export anonymized training/test CSVs and quality report.
 * Executed via: npm run ml:export-dataset
 *
 * @module cloud-api/ml/export-dataset
 */

'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { loadDataset } = require('./dataset');
const { FEATURE_NAMES } = require('@glimpse/shared/features');
const logger = require('../utils/logger');

async function main() {
  const args = process.argv.slice(2);
  const includeSynthetic = args.includes('--include-synthetic');

  console.log('====================================================');
  console.log('  Glimpse ML: Export Anonymised Dataset & Quality Report');
  console.log(`  Include Synthetic: ${includeSynthetic}`);
  console.log('====================================================');

  try {
    const { train, test, qualityReport } = await loadDataset({ includeSynthetic });

    const outDir = path.resolve(__dirname, '../../data');
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const header = [...FEATURE_NAMES, 'target', 'group'].join(',');

    function writeCsv(filePath, X, y, groups) {
      const lines = [header];
      for (let i = 0; i < X.length; i++) {
        lines.push([...X[i], y[i], groups[i]].join(','));
      }
      fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
    }

    const trainCsvPath = path.join(outDir, 'train.csv');
    const testCsvPath = path.join(outDir, 'test.csv');
    const reportPath = path.join(outDir, 'data-quality-report.json');

    writeCsv(trainCsvPath, train.X, train.y, train.groups);
    writeCsv(testCsvPath, test.X, test.y, test.groups);
    fs.writeFileSync(reportPath, JSON.stringify(qualityReport, null, 2), 'utf8');

    console.log('\n--- Data Quality Report ---');
    console.log(`Total Searches Fetched:   ${qualityReport.totalSearches}`);
    console.log(`Clicked Searches:         ${qualityReport.clickedSearches}`);
    console.log(`Train Searches / Rows:    ${qualityReport.trainSearches} / ${qualityReport.trainRows}`);
    console.log(`Test Searches / Rows:     ${qualityReport.testSearches} / ${qualityReport.testRows}`);
    console.log(`Overall Click Rate:       ${(qualityReport.clickRate * 100).toFixed(2)}%`);
    console.log(`Outlier Installs Dropped: ${qualityReport.outlierInstallsDropped}`);
    console.log(`Domains Tracked (Prior):  ${qualityReport.domainCountTracked} (Prior CTR: ${(qualityReport.globalPriorCtr * 100).toFixed(2)}%)`);
    console.log('\nEngine Distribution:');
    for (const [eng, count] of Object.entries(qualityReport.engineDistribution)) {
      console.log(`  - ${eng}: ${count}`);
    }

    console.log(`\nOutput files written to ${outDir}:`);
    console.log(`  ✓ ${path.basename(trainCsvPath)} (${train.X.length} rows)`);
    console.log(`  ✓ ${path.basename(testCsvPath)} (${test.X.length} rows)`);
    console.log(`  ✓ ${path.basename(reportPath)}`);
    console.log('====================================================\n');
  } catch (err) {
    logger.error('Export dataset failed', { error: err.message, stack: err.stack });
    console.error('Export failed:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
