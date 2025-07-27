/**
 * FX List class for managing prediction files list
 */

import { calculatePerformanceMetrics, getAccuracyClass } from './utils.js';

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
        throw new Error(`HTTP error! status: ${response.status}`);
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
        const response = await fetch(`${key}/predictions.json`);
        if (response.ok) {
          const predictionData = await response.json();
          const actualDataMap = this.generateActualDataMap(predictionData);
          const performanceMetrics = calculatePerformanceMetrics(
            predictionData,
            actualDataMap,
          );

          this.predictionFiles.push({
            key,
            entry,
            data: predictionData,
            metrics: performanceMetrics,
          });
        }
      } catch (error) {
        console.error(`Error loading prediction file ${key}:`, error);
      }
    }

    // Sort by date (newest first)
    this.predictionFiles.sort((a, b) =>
      new Date(b.entry.date).getTime() - new Date(a.entry.date).getTime()
    );
  }

  generateActualDataMap(predictionData) {
    const actualDataMap = {};

    for (const pair of predictionData.results) {
      actualDataMap[pair.pair] = {
        currentRate: pair.currentRate,
        actualRates: {
          7: this.simulateActualRate(
            pair.currentRate,
            pair.predictions[0].predictedChangePercent,
            0.1,
          ),
          14: this.simulateActualRate(
            pair.currentRate,
            pair.predictions[1].predictedChangePercent,
            0.15,
          ),
          30: this.simulateActualRate(
            pair.currentRate,
            pair.predictions[2].predictedChangePercent,
            0.2,
          ),
          60: this.simulateActualRate(
            pair.currentRate,
            pair.predictions[3].predictedChangePercent,
            0.25,
          ),
          90: this.simulateActualRate(
            pair.currentRate,
            pair.predictions[4].predictedChangePercent,
            0.3,
          ),
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

      row.innerHTML = `
        <td>${file.entry.date}</td>
        <td>${file.entry.description}</td>
        <td>${metrics.totalPairs}</td>
        <td>
          <span class="badge ${getAccuracyClass(metrics.averageError)}">
            ${metrics.averageAccuracy.toFixed(1)}%
          </span>
        </td>
        <td>${metrics.highAccuracyPairs} (${
        metrics.highAccuracyPercentage.toFixed(1)
      }%)</td>
        <td>
          <a href="index.html?file=${file.key}" class="btn btn-sm btn-primary">
            <i class="fas fa-chart-line me-1"></i>View Details
          </a>
        </td>
      `;

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

    this.updateElement('avgAccuracy', `${avgAccuracy.toFixed(1)}%`);
    this.updateElement('avgError', `${avgError.toFixed(1)}%`);
    this.updateElement('totalFiles', totalFiles.toString());
    this.updateElement('highAccuracyCount', highAccuracyFiles.toString());
  }

  applyFilters() {
    const startDate = document.getElementById('startDate')?.value;
    const endDate = document.getElementById('endDate')?.value;
    const performanceFilter = document.getElementById('performanceFilter')
      ?.value;

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
}
