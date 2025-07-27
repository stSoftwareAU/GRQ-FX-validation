/**
 * Utility functions for FX validation
 */

export interface FXPrediction {
  days: number;
  predictedRate: number;
  predictedChangePercent: number;
}

export interface FXPair {
  pair: string;
  currentRate: number;
  predictions: FXPrediction[];
  predictionDate: string;
}

export interface PredictionData {
  date: string;
  timestamp: string;
  totalPredictions: number;
  results: FXPair[];
}

export interface ActualData {
  currentRate: number;
  actualRates: Record<number, number>;
}

export interface PairAccuracy {
  averageError: number;
  errors: number[];
}

export interface PerformanceMetrics {
  totalPairs: number;
  averageAccuracy: number;
  averageError: number;
  highAccuracyPairs: number;
  highAccuracyPercentage: number;
}

/**
 * Format currency values with specified decimal places
 */
export function formatCurrency(
  value: number | null | undefined,
  decimals = 4,
): string {
  if (value === null || value === undefined || isNaN(value)) {
    return 'N/A';
  }
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Format percentage values
 */
export function formatPercentage(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) {
    return 'N/A';
  }
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
}

/**
 * Get Bootstrap breakpoint based on window width
 */
export function getBootstrapBreakpoint(width: number): string {
  if (width >= 1400) return 'xxl';
  if (width >= 1200) return 'xl';
  if (width >= 992) return 'lg';
  if (width >= 768) return 'md';
  if (width >= 576) return 'sm';
  return 'xs';
}

/**
 * Check if device is mobile based on breakpoint
 */
export function isMobileDevice(breakpoint: string): boolean {
  return breakpoint === 'xs' || breakpoint === 'sm';
}

/**
 * Simulate actual FX rate with noise around prediction
 */
export function simulateActualRate(
  currentRate: number,
  predictedChangePercent: number,
  noiseFactor: number,
): number {
  const noise = (Math.random() - 0.5) * noiseFactor * predictedChangePercent;
  const actualChangePercent = predictedChangePercent + noise;
  return currentRate * (1 + actualChangePercent / 100);
}

/**
 * Calculate accuracy metrics for a single FX pair
 */
export function calculatePairAccuracy(
  pair: FXPair,
  actualRates: Record<number, number>,
): PairAccuracy {
  let totalError = 0;
  let count = 0;
  const errors: number[] = [];

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

/**
 * Calculate performance metrics for prediction data
 */
export function calculatePerformanceMetrics(
  predictionData: PredictionData,
  actualDataMap: Record<string, ActualData>,
): PerformanceMetrics {
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
    highAccuracyPercentage: totalPairs > 0
      ? (highAccuracyPairs / totalPairs) * 100
      : 0,
  };
}

/**
 * Get CSS class for error display
 */
export function getErrorClass(error: number): string {
  if (error < 2) return 'error-small';
  if (error < 5) return 'error-medium';
  return 'error-large';
}

/**
 * Get CSS class for accuracy display
 */
export function getAccuracyClass(averageError: number): string {
  if (averageError < 2) return 'accuracy-high';
  if (averageError < 5) return 'accuracy-medium';
  return 'accuracy-low';
}

/**
 * Generate chart data for FX predictions
 */
export function generateChartData(
  predictionData: PredictionData,
  actualDataMap: Record<string, ActualData>,
) {
  const datasets = [];

  // Add predicted rates dataset
  const predictedData: Array<{ x: number; y: number; pair: string }> = [];
  for (const pair of predictionData.results) {
    for (const prediction of pair.predictions) {
      predictedData.push({
        x: new Date(predictionData.date).getTime() +
          prediction.days * 24 * 60 * 60 * 1000,
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
  const actualData: Array<{ x: number; y: number; pair: string }> = [];
  for (const pair of predictionData.results) {
    const actualRates = actualDataMap[pair.pair]?.actualRates;
    if (!actualRates) continue;

    for (const [days, rate] of Object.entries(actualRates)) {
      actualData.push({
        x: new Date(predictionData.date).getTime() +
          parseInt(days) * 24 * 60 * 60 * 1000,
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
}
