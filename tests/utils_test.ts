import {
  assertAlmostEquals,
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  type ActualData,
  calculatePairAccuracy,
  formatCurrency,
  formatPercentage,
  type FXPair,
  generateChartData,
  getAccuracyClass,
  getBootstrapBreakpoint,
  getErrorClass,
  isMobileDevice,
  type PredictionData,
  simulateActualRate,
} from '../src/utils.ts';

Deno.test('formatCurrency - formats numbers correctly', () => {
  assertEquals(formatCurrency(1234.5678), '1,234.5678');
  assertEquals(formatCurrency(1234.5678, 2), '1,234.57');
  assertEquals(formatCurrency(0), '0.0000');
  assertEquals(formatCurrency(null), 'N/A');
  assertEquals(formatCurrency(undefined), 'N/A');
  assertEquals(formatCurrency(NaN), 'N/A');
});

Deno.test('formatPercentage - formats percentages correctly', () => {
  assertEquals(formatPercentage(25), '25.00%');
  assertEquals(formatPercentage(0.5), '0.50%');
  assertEquals(formatPercentage(-10), '-10.00%');
  assertEquals(formatPercentage(null), 'N/A');
  assertEquals(formatPercentage(undefined), 'N/A');
  assertEquals(formatPercentage(NaN), 'N/A');
});

Deno.test('getBootstrapBreakpoint - returns correct breakpoints', () => {
  assertEquals(getBootstrapBreakpoint(1500), 'xxl');
  assertEquals(getBootstrapBreakpoint(1200), 'xl');
  assertEquals(getBootstrapBreakpoint(1000), 'lg');
  assertEquals(getBootstrapBreakpoint(800), 'md');
  assertEquals(getBootstrapBreakpoint(600), 'sm');
  assertEquals(getBootstrapBreakpoint(400), 'xs');
});

Deno.test('isMobileDevice - identifies mobile devices correctly', () => {
  assertEquals(isMobileDevice('xs'), true);
  assertEquals(isMobileDevice('sm'), true);
  assertEquals(isMobileDevice('md'), false);
  assertEquals(isMobileDevice('lg'), false);
  assertEquals(isMobileDevice('xl'), false);
  assertEquals(isMobileDevice('xxl'), false);
});

Deno.test('simulateActualRate - generates realistic rates', () => {
  const currentRate = 100;
  const predictedChangePercent = 5;
  const noiseFactor = 0.1;

  // Test multiple times to ensure randomness
  for (let i = 0; i < 10; i++) {
    const actualRate = simulateActualRate(
      currentRate,
      predictedChangePercent,
      noiseFactor,
    );

    // Should be close to predicted rate but with some noise
    const expectedRate = currentRate * (1 + predictedChangePercent / 100);
    const maxDeviation = expectedRate * noiseFactor * predictedChangePercent /
      100;

    assertAlmostEquals(actualRate, expectedRate, maxDeviation);
    assertExists(actualRate);
    assertEquals(typeof actualRate, 'number');
  }
});

Deno.test('calculatePairAccuracy - calculates accuracy correctly', () => {
  const pair: FXPair = {
    pair: 'USDTHB',
    currentRate: 32.23,
    predictions: [
      { days: 7, predictedRate: 30.0, predictedChangePercent: -6.9 },
      { days: 14, predictedRate: 29.5, predictedChangePercent: -8.5 },
      { days: 30, predictedRate: 29.0, predictedChangePercent: -10.0 },
    ],
    predictionDate: '2025-07-27T00:00:00.000Z',
  };

  const actualRates: Record<number, number> = {
    7: 30.5, // 1.67% error
    14: 29.8, // 1.01% error
    30: 28.5, // 1.75% error
  };

  const accuracy = calculatePairAccuracy(pair, actualRates);

  assertEquals(accuracy.errors.length, 3);
  assertAlmostEquals(accuracy.averageError, (1.67 + 1.01 + 1.75) / 3, 0.1);
  assertAlmostEquals(accuracy.errors[0], 1.67, 0.1);
  assertAlmostEquals(accuracy.errors[1], 1.01, 0.1);
  assertAlmostEquals(accuracy.errors[2], 1.75, 0.1);
});

Deno.test('calculatePairAccuracy - handles missing actual rates', () => {
  const pair: FXPair = {
    pair: 'USDTHB',
    currentRate: 32.23,
    predictions: [
      { days: 7, predictedRate: 30.0, predictedChangePercent: -6.9 },
    ],
    predictionDate: '2025-07-27T00:00:00.000Z',
  };

  const actualRates: Record<number, number> = {};

  const accuracy = calculatePairAccuracy(pair, actualRates);

  assertEquals(accuracy.averageError, 0);
  assertEquals(accuracy.errors.length, 0);
});

Deno.test('getErrorClass - returns correct CSS classes', () => {
  assertEquals(getErrorClass(1.5), 'error-small');
  assertEquals(getErrorClass(2.0), 'error-medium');
  assertEquals(getErrorClass(3.0), 'error-medium');
  assertEquals(getErrorClass(4.9), 'error-medium');
  assertEquals(getErrorClass(5.0), 'error-large');
  assertEquals(getErrorClass(10.0), 'error-large');
});

Deno.test('getAccuracyClass - returns correct CSS classes', () => {
  assertEquals(getAccuracyClass(1.5), 'accuracy-high');
  assertEquals(getAccuracyClass(2.0), 'accuracy-medium');
  assertEquals(getAccuracyClass(3.0), 'accuracy-medium');
  assertEquals(getAccuracyClass(4.9), 'accuracy-medium');
  assertEquals(getAccuracyClass(5.0), 'accuracy-low');
  assertEquals(getAccuracyClass(10.0), 'accuracy-low');
});

Deno.test('generateChartData - generates correct chart data structure', () => {
  const predictionData: PredictionData = {
    date: '2025-07-27',
    timestamp: '2025-07-27T02:07:53.964Z',
    totalPredictions: 1,
    results: [
      {
        pair: 'USDTHB',
        currentRate: 32.23,
        predictions: [
          { days: 7, predictedRate: 30.0, predictedChangePercent: -6.9 },
          { days: 14, predictedRate: 29.5, predictedChangePercent: -8.5 },
        ],
        predictionDate: '2025-07-27T00:00:00.000Z',
      },
    ],
  };

  const actualDataMap: Record<string, ActualData> = {
    USDTHB: {
      currentRate: 32.23,
      actualRates: {
        7: 30.5,
        14: 29.8,
      },
    },
  };

  const chartData = generateChartData(predictionData, actualDataMap);

  assertEquals(chartData.datasets.length, 2);
  assertEquals(chartData.datasets[0].label, 'Predicted Rates');
  assertEquals(chartData.datasets[1].label, 'Actual Rates');

  // Check predicted data points
  assertEquals(chartData.datasets[0].data.length, 2);
  assertEquals(chartData.datasets[0].data[0].y, 30.0);
  assertEquals(chartData.datasets[0].data[1].y, 29.5);

  // Check actual data points
  assertEquals(chartData.datasets[1].data.length, 2);
  assertEquals(chartData.datasets[1].data[0].y, 30.5);
  assertEquals(chartData.datasets[1].data[1].y, 29.8);
});

Deno.test('generateChartData - handles missing actual data', () => {
  const predictionData: PredictionData = {
    date: '2025-07-27',
    timestamp: '2025-07-27T02:07:53.964Z',
    totalPredictions: 1,
    results: [
      {
        pair: 'USDTHB',
        currentRate: 32.23,
        predictions: [
          { days: 7, predictedRate: 30.0, predictedChangePercent: -6.9 },
        ],
        predictionDate: '2025-07-27T00:00:00.000Z',
      },
    ],
  };

  const actualDataMap: Record<string, ActualData> = {};

  const chartData = generateChartData(predictionData, actualDataMap);

  assertEquals(chartData.datasets.length, 2);
  assertEquals(chartData.datasets[0].data.length, 1);
  assertEquals(chartData.datasets[1].data.length, 0); // No actual data
});

Deno.test('formatCurrency - handles edge cases', () => {
  assertEquals(formatCurrency(0.0001), '0.0001');
  assertEquals(formatCurrency(999999.9999), '999,999.9999');
  assertEquals(formatCurrency(-123.45), '-123.4500');
  assertEquals(formatCurrency(0.0000), '0.0000');
});

Deno.test('formatPercentage - handles edge cases', () => {
  assertEquals(formatPercentage(0), '0.00%');
  assertEquals(formatPercentage(100), '100.00%');
  assertEquals(formatPercentage(-50), '-50.00%');
  assertEquals(formatPercentage(0.001), '0.00%');
  assertEquals(formatPercentage(99.999), '100.00%');
});

Deno.test('simulateActualRate - handles zero and negative values', () => {
  const currentRate = 100;

  // Test with zero change
  const zeroRate = simulateActualRate(currentRate, 0, 0.1);
  assertAlmostEquals(zeroRate, currentRate, 0.1);

  // Test with negative change
  const negativeRate = simulateActualRate(currentRate, -10, 0.1);
  assertAlmostEquals(negativeRate, 90, 5); // Should be around 90 with some noise
});

Deno.test('calculatePairAccuracy - handles exact matches', () => {
  const pair: FXPair = {
    pair: 'USDTHB',
    currentRate: 32.23,
    predictions: [
      { days: 7, predictedRate: 30.0, predictedChangePercent: -6.9 },
    ],
    predictionDate: '2025-07-27T00:00:00.000Z',
  };

  const actualRates: Record<number, number> = {
    7: 30.0, // Exact match
  };

  const accuracy = calculatePairAccuracy(pair, actualRates);

  assertEquals(accuracy.averageError, 0);
  assertEquals(accuracy.errors[0], 0);
});

Deno.test('calculatePairAccuracy - handles large errors', () => {
  const pair: FXPair = {
    pair: 'USDTHB',
    currentRate: 100,
    predictions: [
      { days: 7, predictedRate: 50, predictedChangePercent: -50 },
    ],
    predictionDate: '2025-07-27T00:00:00.000Z',
  };

  const actualRates: Record<number, number> = {
    7: 100, // 50% error (predicted 50, actual 100)
  };

  const accuracy = calculatePairAccuracy(pair, actualRates);

  assertEquals(accuracy.averageError, 50);
  assertEquals(accuracy.errors[0], 50);
});
