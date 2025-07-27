/**
 * Simple build script to create JavaScript files for browser use
 */

async function buildModules() {
  console.log('Building JavaScript modules for browser...');

  // Create utils.js
  const utilsJs = `/**
 * Utility functions for FX validation
 */

export function formatCurrency(value, decimals = 4) {
  if (value === null || value === undefined || isNaN(value)) {
    return 'N/A';
  }
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatPercentage(value) {
  if (value === null || value === undefined || isNaN(value)) {
    return 'N/A';
  }
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
}

export function getBootstrapBreakpoint(width) {
  if (width >= 1400) return 'xxl';
  if (width >= 1200) return 'xl';
  if (width >= 992) return 'lg';
  if (width >= 768) return 'md';
  if (width >= 576) return 'sm';
  return 'xs';
}

export function isMobileDevice(breakpoint) {
  return breakpoint === 'xs' || breakpoint === 'sm';
}

export function simulateActualRate(currentRate, predictedChangePercent, noiseFactor) {
  const noise = (Math.random() - 0.5) * noiseFactor * predictedChangePercent;
  const actualChangePercent = predictedChangePercent + noise;
  return currentRate * (1 + actualChangePercent / 100);
}

export function calculatePairAccuracy(pair, actualRates) {
  let totalError = 0;
  let count = 0;
  const errors = [];

  for (const prediction of pair.predictions) {
    const actualRate = actualRates[prediction.days];
    if (actualRate === undefined) continue;
    
    const predictedRate = prediction.predictedRate;
    const error = Math.abs((actualRate - predictedRate) / actualRate) * 100;
    totalError += error;
    errors.push(error);
    count++;
  }

  return {
    averageError: count > 0 ? totalError / count : 0,
    errors,
  };
}

export function calculatePerformanceMetrics(predictionData, actualDataMap) {
  const totalPairs = predictionData.results.length;
  let totalAccuracy = 0;
  let highAccuracyPairs = 0;
  let totalError = 0;

  for (const pair of predictionData.results) {
    const actualData = actualDataMap[pair.pair];
    if (!actualData) continue;

    const pairAccuracy = calculatePairAccuracy(pair, actualData.actualRates);
    const accuracy = 100 - pairAccuracy.averageError;

    totalAccuracy += accuracy;
    totalError += pairAccuracy.averageError;

    if (accuracy > 90) {
      highAccuracyPairs++;
    }
  }

  const averageAccuracy = totalPairs > 0 ? totalAccuracy / totalPairs : 0;
  const averageError = totalPairs > 0 ? totalError / totalPairs : 0;

  return {
    totalPairs,
    averageAccuracy,
    averageError,
    highAccuracyPairs,
    highAccuracyPercentage: totalPairs > 0 ? (highAccuracyPairs / totalPairs) * 100 : 0,
  };
}

export function getErrorClass(error) {
  if (error < 2) return 'error-small';
  if (error < 5) return 'error-medium';
  return 'error-large';
}

export function getAccuracyClass(averageError) {
  if (averageError < 2) return 'accuracy-high';
  if (averageError < 5) return 'accuracy-medium';
  return 'accuracy-low';
}

export function generateChartData(predictionData, actualDataMap) {
  const datasets = [];

  // Add predicted rates dataset
  const predictedData = [];
  for (const pair of predictionData.results) {
    for (const prediction of pair.predictions) {
      predictedData.push({
        x: new Date(predictionData.date).getTime() + prediction.days * 24 * 60 * 60 * 1000,
        y: prediction.predictedRate,
        pair: pair.pair,
      });
    }
  }

  datasets.push({
    label: 'Predicted Rates',
    data: predictedData,
    borderColor: '#667eea',
    backgroundColor: 'rgba(102, 126, 234, 0.1)',
    borderWidth: 2,
    pointRadius: 4,
  });

  // Add actual rates dataset
  const actualData = [];
  for (const pair of predictionData.results) {
    const actualRates = actualDataMap[pair.pair]?.actualRates;
    if (!actualRates) continue;

    for (const [days, rate] of Object.entries(actualRates)) {
      actualData.push({
        x: new Date(predictionData.date).getTime() + parseInt(days) * 24 * 60 * 60 * 1000,
        y: rate,
        pair: pair.pair,
      });
    }
  }

  datasets.push({
    label: 'Actual Rates',
    data: actualData,
    borderColor: '#28a745',
    backgroundColor: 'rgba(40, 167, 69, 0.1)',
    borderWidth: 2,
    pointRadius: 4,
  });

  return { datasets };
}`;

  await Deno.writeTextFile('docs/utils.js', utilsJs);
  console.log('✓ Created docs/utils.js');

  // Create fx-validator.js
  const fxValidatorJs = `/**
 * Main FX Validator class for handling FX prediction validation
 */

import {
  formatCurrency,
  simulateActualRate,
  calculatePairAccuracy,
  getErrorClass,
  getAccuracyClass,
  generateChartData,
} from './utils.js';

export class GRQFXValidator {
  constructor() {
    this.predictionData = null;
    this.actualData = {};
    this.selectedFile = null;
    this.selectedPair = null;
    this.chart = null;

    this.initializeEventListeners();
    this.loadIndex();
  }

  initializeEventListeners() {
    const scoreFileSelect = document.getElementById('predictionFileSelect');
    if (scoreFileSelect) {
      scoreFileSelect.addEventListener('change', (e) => {
        const target = e.target;
        this.selectedFile = target.value;
        this.selectedPair = null; // Reset to aggregate view
        if (this.selectedFile) {
          this.loadPredictionFile();
        }
      });
    }

    const backToAggregate = document.getElementById('backToAggregate');
    if (backToAggregate) {
      backToAggregate.addEventListener('click', () => {
        this.selectedPair = null;
        this.updateDisplay();
      });
    }
  }

  async loadIndex() {
    try {
      const response = await fetch('index.json');
      if (!response.ok) {
        throw new Error(\`HTTP error! status: \${response.status}\`);
      }
      const indexData = await response.json();

      const select = document.getElementById('predictionFileSelect');
      if (!select) return;

      select.innerHTML = '<option value="">Select a prediction file...</option>';

      // Sort entries by date (newest first)
      const sortedEntries = Object.entries(indexData.entries)
        .sort(([, a], [, b]) => {
          const dateA = a.date;
          const dateB = b.date;
          return new Date(dateB).getTime() - new Date(dateA).getTime();
        });

      for (const [key, entry] of sortedEntries) {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = \`\${entry.date} - \${entry.description}\`;
        select.appendChild(option);
      }

      // Auto-select the most recent file
      if (sortedEntries.length > 0) {
        select.value = sortedEntries[0][0];
        this.selectedFile = sortedEntries[0][0];
        this.loadPredictionFile();
      }
    } catch (error) {
      console.error('Error loading index:', error);
      this.showError('Failed to load prediction files index');
    }
  }

  async loadPredictionFile() {
    if (!this.selectedFile) return;

    this.showLoading();

    try {
      await this.loadPredictionData();
      this.loadActualData();
      this.updateDisplay();
    } catch (error) {
      console.error('Error loading prediction file:', error);
      this.showError('Failed to load prediction data');
    }
  }

  async loadPredictionData() {
    if (!this.selectedFile) return;

    const response = await fetch(\`\${this.selectedFile}/predictions.json\`);
    if (!response.ok) {
      throw new Error(\`HTTP error! status: \${response.status}\`);
    }
    this.predictionData = await response.json();
  }

  loadActualData() {
    if (!this.predictionData) return;

    this.actualData = {};

    // Simulate actual rates for demonstration
    for (const pair of this.predictionData.results) {
      this.actualData[pair.pair] = {
        currentRate: pair.currentRate,
        actualRates: {
          7: simulateActualRate(pair.currentRate, pair.predictions[0].predictedChangePercent, 0.1),
          14: simulateActualRate(pair.currentRate, pair.predictions[1].predictedChangePercent, 0.15),
          30: simulateActualRate(pair.currentRate, pair.predictions[2].predictedChangePercent, 0.2),
          60: simulateActualRate(pair.currentRate, pair.predictions[3].predictedChangePercent, 0.25),
          90: simulateActualRate(pair.currentRate, pair.predictions[4].predictedChangePercent, 0.3),
        },
      };
    }
  }

  updateDisplay() {
    if (!this.predictionData || !this.actualData) {
      this.showNoData();
      return;
    }

    this.hideMessages();
    this.updateFXSummary();
    this.updateChart();
    this.updateFXTable();
  }

  updateFXSummary() {
    if (!this.predictionData) return;

    const totalPairs = this.predictionData.results.length;
    let accuratePredictions = 0;
    let totalError = 0;
    let bestPerformer = null;
    let bestAccuracy = 0;

    for (const pair of this.predictionData.results) {
      const pairAccuracy = this.calculatePairAccuracy(pair);
      totalError += pairAccuracy.averageError;

      if (pairAccuracy.averageError < 5) { // Consider accurate if error < 5%
        accuratePredictions++;
      }

      if (pairAccuracy.averageError < bestAccuracy || bestPerformer === null) {
        bestPerformer = pair.pair;
        bestAccuracy = pairAccuracy.averageError;
      }
    }

    const averageError = totalError / totalPairs;
    const accuracyPercentage = (accuratePredictions / totalPairs) * 100;

    this.updateElement('totalPairs', totalPairs.toString());
    this.updateElement('totalPairsDetails', 'FX pairs analyzed');

    this.updateElement('accuratePredictions', \`\${accuratePredictions} (\${accuracyPercentage.toFixed(1)}%)\`);
    this.updateElement('accurateDetails', 'Error < 5%');

    this.updateElement('averageError', \`\${averageError.toFixed(2)}%\`);
    this.updateElement('errorDetails', 'Mean absolute error');

    this.updateElement('bestPerformer', bestPerformer || 'N/A');
    this.updateElement('bestDetails', \`\${bestAccuracy.toFixed(2)}% error\`);

    const fxSummary = document.getElementById('fxSummary');
    if (fxSummary) {
      fxSummary.style.display = 'block';
    }
  }

  calculatePairAccuracy(pair) {
    const actualRates = this.actualData[pair.pair]?.actualRates;
    if (!actualRates) {
      return { averageError: 0, errors: [] };
    }

    return calculatePairAccuracy(pair, actualRates);
  }

  updateChart() {
    if (!this.predictionData) return;

    if (this.chart) {
      this.chart.destroy();
    }

    const canvas = document.getElementById('performanceChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const chartData = generateChartData(this.predictionData, this.actualData);

    // Note: Chart.js would be loaded globally in the browser
    if (typeof Chart !== 'undefined') {
      this.chart = new Chart(ctx, {
        type: 'line',
        data: chartData,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            title: {
              display: true,
              text: \`FX Prediction Performance - \${this.selectedFile}\`,
              font: {
                size: 16,
              },
            },
            legend: {
              display: true,
              position: 'top',
            },
          },
          scales: {
            x: {
              type: 'time',
              time: {
                unit: 'day',
              },
              title: {
                display: true,
                text: 'Days from Prediction',
              },
            },
            y: {
              title: {
                display: true,
                text: 'FX Rate',
              },
            },
          },
        },
      });
    }
  }

  updateFXTable() {
    if (!this.predictionData) return;

    const tbody = document.getElementById('fxTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    for (const pair of this.predictionData.results) {
      const row = document.createElement('tr');
      const accuracy = this.calculatePairAccuracy(pair);
      const actualRates = this.actualData[pair.pair]?.actualRates;

      if (!actualRates) continue;

      row.innerHTML = \`
        <td class="clickable-fx-pair" onclick="fxValidator.showPairDetails('\${pair.pair}')">\${pair.pair}</td>
        <td>\${formatCurrency(pair.currentRate)}</td>
        <td>\${formatCurrency(pair.predictions[0].predictedRate)}</td>
        <td>\${formatCurrency(actualRates[7])}</td>
        <td class="\${getErrorClass(accuracy.errors[0])}">\${accuracy.errors[0].toFixed(2)}%</td>
        <td>\${formatCurrency(pair.predictions[1].predictedRate)}</td>
        <td>\${formatCurrency(actualRates[14])}</td>
        <td class="\${getErrorClass(accuracy.errors[1])}">\${accuracy.errors[1].toFixed(2)}%</td>
        <td>\${formatCurrency(pair.predictions[2].predictedRate)}</td>
        <td>\${formatCurrency(actualRates[30])}</td>
        <td class="\${getErrorClass(accuracy.errors[2])}">\${accuracy.errors[2].toFixed(2)}%</td>
        <td>\${formatCurrency(pair.predictions[3].predictedRate)}</td>
        <td>\${formatCurrency(actualRates[60])}</td>
        <td class="\${getErrorClass(accuracy.errors[3])}">\${accuracy.errors[3].toFixed(2)}%</td>
        <td>\${formatCurrency(pair.predictions[4].predictedRate)}</td>
        <td>\${formatCurrency(actualRates[90])}</td>
        <td class="\${getErrorClass(accuracy.errors[4])}">\${accuracy.errors[4].toFixed(2)}%</td>
        <td><span class="badge \${getAccuracyClass(accuracy.averageError)}">\${accuracy.averageError.toFixed(2)}%</span></td>
      \`;

      tbody.appendChild(row);
    }
  }

  showPairDetails(pairName) {
    this.selectedPair = pairName;
    this.updateDisplay();
  }

  updateElement(id, content) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = content;
    }
  }

  showLoading() {
    this.showElement('loading');
    this.hideElement('summary');
    this.hideElement('error');
    this.hideElement('noData');
  }

  showError(message) {
    const errorElement = document.getElementById('error');
    if (errorElement) {
      errorElement.textContent = message;
      errorElement.style.display = 'block';
    }
    this.hideElement('loading');
    this.hideElement('summary');
    this.hideElement('noData');
  }

  showNoData() {
    this.showElement('noData');
    this.hideElement('loading');
    this.hideElement('summary');
    this.hideElement('error');
  }

  hideMessages() {
    this.hideElement('loading');
    this.hideElement('error');
    this.hideElement('noData');
    this.showElement('summary');
  }

  showElement(id) {
    const element = document.getElementById(id);
    if (element) {
      element.style.display = 'block';
    }
  }

  hideElement(id) {
    const element = document.getElementById(id);
    if (element) {
      element.style.display = 'none';
    }
  }
}`;

  await Deno.writeTextFile('docs/fx-validator.js', fxValidatorJs);
  console.log('✓ Created docs/fx-validator.js');

  // Create fx-list.js
  const fxListJs = `/**
 * FX List class for managing prediction files list
 */

import {
  calculatePerformanceMetrics,
  getAccuracyClass,
} from './utils.js';

export class GRQFXList {
  constructor() {
    this.indexData = null;
    this.predictionFiles = [];
    this.filteredFiles = [];
    this.dataTable = null;

    this.initializeEventListeners();
    this.loadIndex();
  }

  initializeEventListeners() {
    const startDate = document.getElementById('startDate');
    const endDate = document.getElementById('endDate');
    const performanceFilter = document.getElementById('performanceFilter');
    const clearFilters = document.getElementById('clearFilters');

    if (startDate) {
      startDate.addEventListener('change', () => this.applyFilters());
    }
    if (endDate) {
      endDate.addEventListener('change', () => this.applyFilters());
    }
    if (performanceFilter) {
      performanceFilter.addEventListener('change', () => this.applyFilters());
    }
    if (clearFilters) {
      clearFilters.addEventListener('click', () => this.clearFilters());
    }
  }

  async loadIndex() {
    try {
      const response = await fetch('index.json');
      if (!response.ok) {
        throw new Error(\`HTTP error! status: \${response.status}\`);
      }
      this.indexData = await response.json();

      // Load prediction data for each file
      await this.loadPredictionFiles();
      this.updateDisplay();
    } catch (error) {
      console.error('Error loading index:', error);
      this.showError('Failed to load prediction files index');
    }
  }

  async loadPredictionFiles() {
    if (!this.indexData) return;

    this.predictionFiles = [];

    for (const [key, entry] of Object.entries(this.indexData.entries)) {
      try {
        const response = await fetch(\`\${key}/predictions.json\`);
        if (response.ok) {
          const predictionData = await response.json();
          const actualDataMap = this.generateActualDataMap(predictionData);
          const performanceMetrics = calculatePerformanceMetrics(predictionData, actualDataMap);

          this.predictionFiles.push({
            key,
            entry,
            data: predictionData,
            metrics: performanceMetrics,
          });
        }
      } catch (error) {
        console.error(\`Error loading prediction file \${key}:\`, error);
      }
    }

    // Sort by date (newest first)
    this.predictionFiles.sort((a, b) => new Date(b.entry.date).getTime() - new Date(a.entry.date).getTime());
  }

  generateActualDataMap(predictionData) {
    const actualDataMap = {};

    for (const pair of predictionData.results) {
      actualDataMap[pair.pair] = {
        currentRate: pair.currentRate,
        actualRates: {
          7: this.simulateActualRate(pair.currentRate, pair.predictions[0].predictedChangePercent, 0.1),
          14: this.simulateActualRate(pair.currentRate, pair.predictions[1].predictedChangePercent, 0.15),
          30: this.simulateActualRate(pair.currentRate, pair.predictions[2].predictedChangePercent, 0.2),
          60: this.simulateActualRate(pair.currentRate, pair.predictions[3].predictedChangePercent, 0.25),
          90: this.simulateActualRate(pair.currentRate, pair.predictions[4].predictedChangePercent, 0.3),
        },
      };
    }

    return actualDataMap;
  }

  simulateActualRate(currentRate, predictedChangePercent, noiseFactor) {
    const noise = (Math.random() - 0.5) * noiseFactor * predictedChangePercent;
    const actualChangePercent = predictedChangePercent + noise;
    return currentRate * (1 + actualChangePercent / 100);
  }

  updateDisplay() {
    if (this.predictionFiles.length === 0) {
      this.showError('No prediction files found');
      return;
    }

    this.hideMessages();
    this.updateTable();
    this.updateSummaryStats();
  }

  updateTable() {
    const tbody = document.getElementById('predictionFilesTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    for (const file of this.predictionFiles) {
      const row = document.createElement('tr');
      const metrics = file.metrics;

      row.innerHTML = \`
        <td>\${file.entry.date}</td>
        <td>\${file.entry.description}</td>
        <td>\${metrics.totalPairs}</td>
        <td>
          <span class="badge \${getAccuracyClass(metrics.averageError)}">
            \${metrics.averageAccuracy.toFixed(1)}%
          </span>
        </td>
        <td>\${metrics.highAccuracyPairs} (\${metrics.highAccuracyPercentage.toFixed(1)}%)</td>
        <td>
          <a href="index.html?file=\${file.key}" class="btn btn-sm btn-primary">
            <i class="fas fa-chart-line me-1"></i>View Details
          </a>
        </td>
      \`;

      tbody.appendChild(row);
    }

    // Initialize DataTable if not already done
    if (!this.dataTable) {
      this.initializeDataTable();
    } else {
      this.dataTable.destroy();
      this.initializeDataTable();
    }
  }

  initializeDataTable() {
    // Note: This would use jQuery DataTables in the browser
    if (typeof $ !== 'undefined') {
      this.dataTable = $('#predictionFilesTable').DataTable({
        pageLength: 25,
        order: [[0, 'desc']], // Sort by date descending
        responsive: true,
        dom: 'Bfrtip',
        buttons: ['copy', 'csv', 'excel', 'print'],
        columnDefs: [
          {
            targets: [5], // Actions column
            orderable: false,
            searchable: false,
          },
        ],
      });
    }
  }

  updateSummaryStats() {
    if (this.predictionFiles.length === 0) return;

    const totalFiles = this.predictionFiles.length;
    let totalAccuracy = 0;
    let totalError = 0;
    let highAccuracyFiles = 0;

    for (const file of this.predictionFiles) {
      totalAccuracy += file.metrics.averageAccuracy;
      totalError += file.metrics.averageError;

      if (file.metrics.averageAccuracy > 90) {
        highAccuracyFiles++;
      }
    }

    const avgAccuracy = totalAccuracy / totalFiles;
    const avgError = totalError / totalFiles;

    this.updateElement('avgAccuracy', \`\${avgAccuracy.toFixed(1)}%\`);
    this.updateElement('avgError', \`\${avgError.toFixed(1)}%\`);
    this.updateElement('totalFiles', totalFiles.toString());
    this.updateElement('highAccuracyCount', highAccuracyFiles.toString());
  }

  applyFilters() {
    const startDate = document.getElementById('startDate')?.value;
    const endDate = document.getElementById('endDate')?.value;
    const performanceFilter = document.getElementById('performanceFilter')?.value;

    this.filteredFiles = this.predictionFiles.filter((file) => {
      // Date filter
      if (startDate && file.entry.date < startDate) return false;
      if (endDate && file.entry.date > endDate) return false;

      // Performance filter
      if (performanceFilter) {
        const accuracy = file.metrics.averageAccuracy;
        switch (performanceFilter) {
          case 'high':
            if (accuracy < 90) return false;
            break;
          case 'medium':
            if (accuracy < 70 || accuracy >= 90) return false;
            break;
          case 'low':
            if (accuracy >= 70) return false;
            break;
        }
      }

      return true;
    });

    this.updateTable();
    this.updateSummaryStats();
  }

  clearFilters() {
    const startDate = document.getElementById('startDate');
    const endDate = document.getElementById('endDate');
    const performanceFilter = document.getElementById('performanceFilter');

    if (startDate) startDate.value = '';
    if (endDate) endDate.value = '';
    if (performanceFilter) performanceFilter.value = '';

    this.filteredFiles = [...this.predictionFiles];
    this.updateTable();
    this.updateSummaryStats();
  }

  updateElement(id, content) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = content;
    }
  }

  showError(message) {
    const errorElement = document.getElementById('error');
    if (errorElement) {
      errorElement.textContent = message;
      errorElement.style.display = 'block';
    }
    this.hideElement('loading');
    this.hideElement('content');
  }

  hideMessages() {
    this.hideElement('loading');
    this.hideElement('error');
    this.showElement('content');
  }

  showElement(id) {
    const element = document.getElementById(id);
    if (element) {
      element.style.display = 'block';
    }
  }

  hideElement(id) {
    const element = document.getElementById(id);
    if (element) {
      element.style.display = 'none';
    }
  }
}`;

  await Deno.writeTextFile('docs/fx-list.js', fxListJs);
  console.log('✓ Created docs/fx-list.js');
}

async function updateHTMLFiles() {
  console.log('Updating HTML files to use compiled modules...');

  // Update index.html
  try {
    let indexHtml = await Deno.readTextFile('docs/index.html');
    
    // Replace the old script loading with module imports
    const scriptReplacement = `
    <script type="module">
        import { GRQFXValidator } from './fx-validator.js';
        
        // Initialize the FX validator when the page loads
        let fxValidator;
        document.addEventListener('DOMContentLoaded', () => {
            fxValidator = new GRQFXValidator();
        });
    </script>`;
    
    // Remove the old script loading and add the new one
    indexHtml = indexHtml.replace(
      /<script>\s*\/\/ Dynamically load app\.js.*?<\/script>/s,
      scriptReplacement
    );
    
    await Deno.writeTextFile('docs/index.html', indexHtml);
    console.log('✓ Updated docs/index.html');
      } catch (_error) {
      console.error('✗ Failed to update index.html:', _error);
    }

  // Update list.html
  try {
    let listHtml = await Deno.readTextFile('docs/list.html');
    
    // Replace the old script loading with module imports
    const scriptReplacement = `
    <script type="module">
        import { GRQFXList } from './fx-list.js';
        
        // Initialize the FX list when the page loads
        let fxList;
        document.addEventListener('DOMContentLoaded', () => {
            fxList = new GRQFXList();
        });
    </script>`;
    
    // Remove the old script loading and add the new one
    listHtml = listHtml.replace(
      /<script src="list\.js"><\/script>/,
      scriptReplacement
    );
    
    await Deno.writeTextFile('docs/list.html', listHtml);
    console.log('✓ Updated docs/list.html');
      } catch (_error) {
      console.error('✗ Failed to update list.html:', _error);
    }
}

async function cleanupOldFiles() {
  console.log('Cleaning up old JavaScript files...');
  
  const oldFiles = [
    'docs/app.js',
    'docs/list.js',
  ];

  for (const file of oldFiles) {
    try {
      await Deno.remove(file);
      console.log(`✓ Removed ${file}`);
    } catch (error) {
      // File might not exist, that's okay
      console.log(`- ${file} not found (already removed)`);
    }
  }
}

async function main() {
  console.log('🚀 Starting build process...\n');

  try {
    await buildModules();
    console.log();
    
    await updateHTMLFiles();
    console.log();
    
    await cleanupOldFiles();
    console.log();
    
    console.log('✅ Build completed successfully!');
    console.log('\n📁 Generated files:');
    console.log('  - docs/utils.js');
    console.log('  - docs/fx-validator.js');
    console.log('  - docs/fx-list.js');
    console.log('\n🌐 The dashboard is ready for deployment!');
    
  } catch (error) {
    console.error('❌ Build failed:', error);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  main();
}
