/**
 * Main FX Validator class for handling FX prediction validation
 */

import {
  calculatePairAccuracy,
  formatCurrency,
  generateChartData,
  getAccuracyClass,
  getErrorClass,
  simulateActualRate,
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
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const indexData = await response.json();

      const select = document.getElementById('predictionFileSelect');
      if (!select) return;

      select.innerHTML =
        '<option value="">Select a prediction file...</option>';

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
        option.textContent = `${entry.date} - ${entry.description}`;
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

    const response = await fetch(`${this.selectedFile}/predictions.json`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
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
          7: simulateActualRate(
            pair.currentRate,
            pair.predictions[0].predictedChangePercent,
            0.1,
          ),
          14: simulateActualRate(
            pair.currentRate,
            pair.predictions[1].predictedChangePercent,
            0.15,
          ),
          30: simulateActualRate(
            pair.currentRate,
            pair.predictions[2].predictedChangePercent,
            0.2,
          ),
          60: simulateActualRate(
            pair.currentRate,
            pair.predictions[3].predictedChangePercent,
            0.25,
          ),
          90: simulateActualRate(
            pair.currentRate,
            pair.predictions[4].predictedChangePercent,
            0.3,
          ),
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

    this.updateElement(
      'accuratePredictions',
      `${accuratePredictions} (${accuracyPercentage.toFixed(1)}%)`,
    );
    this.updateElement('accurateDetails', 'Error < 5%');

    this.updateElement('averageError', `${averageError.toFixed(2)}%`);
    this.updateElement('errorDetails', 'Mean absolute error');

    this.updateElement('bestPerformer', bestPerformer || 'N/A');
    this.updateElement('bestDetails', `${bestAccuracy.toFixed(2)}% error`);

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
              text: `FX Prediction Performance - ${this.selectedFile}`,
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

      row.innerHTML = `
        <td class="clickable-fx-pair" onclick="fxValidator.showPairDetails('${pair.pair}')">${pair.pair}</td>
        <td>${formatCurrency(pair.currentRate)}</td>
        <td>${formatCurrency(pair.predictions[0].predictedRate)}</td>
        <td>${formatCurrency(actualRates[7])}</td>
        <td class="${getErrorClass(accuracy.errors[0])}">${
        accuracy.errors[0].toFixed(2)
      }%</td>
        <td>${formatCurrency(pair.predictions[1].predictedRate)}</td>
        <td>${formatCurrency(actualRates[14])}</td>
        <td class="${getErrorClass(accuracy.errors[1])}">${
        accuracy.errors[1].toFixed(2)
      }%</td>
        <td>${formatCurrency(pair.predictions[2].predictedRate)}</td>
        <td>${formatCurrency(actualRates[30])}</td>
        <td class="${getErrorClass(accuracy.errors[2])}">${
        accuracy.errors[2].toFixed(2)
      }%</td>
        <td>${formatCurrency(pair.predictions[3].predictedRate)}</td>
        <td>${formatCurrency(actualRates[60])}</td>
        <td class="${getErrorClass(accuracy.errors[3])}">${
        accuracy.errors[3].toFixed(2)
      }%</td>
        <td>${formatCurrency(pair.predictions[4].predictedRate)}</td>
        <td>${formatCurrency(actualRates[90])}</td>
        <td class="${getErrorClass(accuracy.errors[4])}">${
        accuracy.errors[4].toFixed(2)
      }%</td>
        <td><span class="badge ${getAccuracyClass(accuracy.averageError)}">${
        accuracy.averageError.toFixed(2)
      }%</span></td>
      `;

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
}
