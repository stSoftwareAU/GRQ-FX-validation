/**
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

export function simulateActualRate(
  currentRate,
  predictedChangePercent,
  noiseFactor,
) {
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
    highAccuracyPercentage: totalPairs > 0
      ? (highAccuracyPairs / totalPairs) * 100
      : 0,
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
  const actualData = [];
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
