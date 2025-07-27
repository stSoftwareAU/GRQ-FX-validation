/**
 * Main FX Validator class for handling FX prediction validation
 */

import {
  type ActualData,
  calculatePairAccuracy,
  formatCurrency,
  type FXPair,
  generateChartData,
  getAccuracyClass,
  getErrorClass,
  type PairAccuracy,
  type PredictionData,
  simulateActualRate,
} from './utils.ts';

export class GRQFXValidator {
  private predictionData: PredictionData | null = null;
  private actualData: Record<string, ActualData> = {};
  private selectedFile: string | null = null;
  private selectedPair: string | null = null;
  private chart: unknown = null;

  constructor() {
    this.initializeEventListeners();
    this.loadIndex();
  }

  /**
   * Initialize event listeners for user interactions
   */
  private initializeEventListeners(): void {
    const scoreFileSelect = document.getElementById(
      'predictionFileSelect',
    ) as HTMLSelectElement;
    if (scoreFileSelect) {
      scoreFileSelect.addEventListener('change', (e: Event) => {
        const target = e.target as HTMLSelectElement;
        this.selectedFile = target.value;
        this.selectedPair = null; // Reset to aggregate view
        if (this.selectedFile) {
          this.loadPredictionFile();
        }
      });
    }

    const backToAggregate = document.getElementById(
      'backToAggregate',
    ) as HTMLButtonElement;
    if (backToAggregate) {
      backToAggregate.addEventListener('click', () => {
        this.selectedPair = null;
        this.updateDisplay();
      });
    }
  }

  /**
   * Load the index of prediction files
   */
  private async loadIndex(): Promise<void> {
    try {
      const response = await fetch('index.json');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const indexData = await response.json();

      const select = document.getElementById(
        'predictionFileSelect',
      ) as HTMLSelectElement;
      if (!select) return;

      select.innerHTML =
        '<option value="">Select a prediction file...</option>';

      // Sort entries by date (newest first)
      const sortedEntries = Object.entries(indexData.entries)
        .sort(([, a], [, b]) => {
          const dateA = (a as { date: string }).date;
          const dateB = (b as { date: string }).date;
          return new Date(dateB).getTime() - new Date(dateA).getTime();
        });

      for (const [key, entry] of sortedEntries) {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = `${
          (entry as { date: string; description: string }).date
        } - ${(entry as { date: string; description: string }).description}`;
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

  /**
   * Load prediction file data
   */
  private async loadPredictionFile(): Promise<void> {
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

  /**
   * Load prediction data from JSON file
   */
  private async loadPredictionData(): Promise<void> {
    if (!this.selectedFile) return;

    const response = await fetch(`${this.selectedFile}/predictions.json`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    this.predictionData = await response.json();
  }

  /**
   * Load actual data (simulated for now)
   */
  private loadActualData(): void {
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

  /**
   * Update the display with current data
   */
  private updateDisplay(): void {
    if (!this.predictionData || !this.actualData) {
      this.showNoData();
      return;
    }

    this.hideMessages();
    this.updateFXSummary();
    this.updateChart();
    this.updateFXTable();
  }

  /**
   * Update FX summary statistics
   */
  private updateFXSummary(): void {
    if (!this.predictionData) return;

    const totalPairs = this.predictionData.results.length;
    let accuratePredictions = 0;
    let totalError = 0;
    let bestPerformer: string | null = null;
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

  /**
   * Calculate accuracy for a single pair
   */
  private calculatePairAccuracy(pair: FXPair): PairAccuracy {
    const actualRates = this.actualData[pair.pair]?.actualRates;
    if (!actualRates) {
      return { averageError: 0, errors: [] };
    }

    return calculatePairAccuracy(pair, actualRates);
  }

  /**
   * Update chart with current data
   */
  private updateChart(): void {
    if (!this.predictionData) return;

    if (this.chart) {
      (this.chart as { destroy: () => void }).destroy();
    }

    const canvas = document.getElementById(
      'performanceChart',
    ) as HTMLCanvasElement;
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

  /**
   * Update FX table with current data
   */
  private updateFXTable(): void {
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

  /**
   * Show pair details (for single pair view)
   */
  public showPairDetails(pairName: string): void {
    this.selectedPair = pairName;
    this.updateDisplay();
  }

  /**
   * Update DOM element with new content
   */
  private updateElement(id: string, content: string): void {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = content;
    }
  }

  /**
   * Show loading state
   */
  private showLoading(): void {
    this.showElement('loading');
    this.hideElement('summary');
    this.hideElement('error');
    this.hideElement('noData');
  }

  /**
   * Show error message
   */
  private showError(message: string): void {
    const errorElement = document.getElementById('error');
    if (errorElement) {
      errorElement.textContent = message;
      errorElement.style.display = 'block';
    }
    this.hideElement('loading');
    this.hideElement('summary');
    this.hideElement('noData');
  }

  /**
   * Show no data message
   */
  private showNoData(): void {
    this.showElement('noData');
    this.hideElement('loading');
    this.hideElement('summary');
    this.hideElement('error');
  }

  /**
   * Hide all message elements
   */
  private hideMessages(): void {
    this.hideElement('loading');
    this.hideElement('error');
    this.hideElement('noData');
    this.showElement('summary');
  }

  /**
   * Show element by ID
   */
  private showElement(id: string): void {
    const element = document.getElementById(id);
    if (element) {
      element.style.display = 'block';
    }
  }

  /**
   * Hide element by ID
   */
  private hideElement(id: string): void {
    const element = document.getElementById(id);
    if (element) {
      element.style.display = 'none';
    }
  }
}
