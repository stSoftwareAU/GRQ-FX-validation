import {
  assertEquals,
  assertExists,
  assertGreaterOrEqual,
} from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  IndexManager,
  type IndexEntry,
  type IndexData,
  type IndexQuery,
} from '../src/index-manager.ts';

// Mock fetch for testing
const originalFetch = globalThis.fetch;
let mockIndexData: IndexData;

function setupMockFetch() {
  globalThis.fetch = async (url: string) => {
    if (url === 'index.json') {
      return new Response(JSON.stringify(mockIndexData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error(`Unexpected fetch to: ${url}`);
  };
}

function restoreFetch() {
  globalThis.fetch = originalFetch;
}

Deno.test('IndexManager - loads index data correctly', async () => {
  mockIndexData = {
    metadata: {
      totalEntries: 3,
      lastUpdated: '2025-01-27T12:00:00.000Z',
      version: '1.0',
    },
    entries: {
      '2025-01-27': {
        date: '2025-01-27',
        type: 'fx_predictions',
        description: 'FX predictions for 2025-01-27',
        file: '2025-01-27/predictions.json',
        totalPairs: 47,
        averageAccuracy: 85.2,
        lastUpdated: '2025-01-27T02:07:53.964Z',
      },
      '2025-01-26': {
        date: '2025-01-26',
        type: 'fx_predictions',
        description: 'FX predictions for 2025-01-26',
        file: '2025-01-26/predictions.json',
        totalPairs: 45,
        averageAccuracy: 87.1,
        lastUpdated: '2025-01-26T02:07:53.964Z',
      },
      '2025-01-25': {
        date: '2025-01-25',
        type: 'fx_predictions',
        description: 'FX predictions for 2025-01-25',
        file: '2025-01-25/predictions.json',
        totalPairs: 43,
        averageAccuracy: 82.5,
        lastUpdated: '2025-01-25T02:07:53.964Z',
      },
    },
  };

  setupMockFetch();

  try {
    const manager = new IndexManager();
    const result = await manager.loadIndex();

    assertEquals(result.metadata?.totalEntries, 3);
    assertEquals(Object.keys(result.entries).length, 3);
    assertExists(result.entries['2025-01-27']);
    assertEquals(result.entries['2025-01-27'].totalPairs, 47);
  } finally {
    restoreFetch();
  }
});

Deno.test('IndexManager - queries entries with pagination', async () => {
  mockIndexData = {
    metadata: {
      totalEntries: 5,
      lastUpdated: '2025-01-27T12:00:00.000Z',
      version: '1.0',
    },
    entries: {
      '2025-01-27': {
        date: '2025-01-27',
        type: 'fx_predictions',
        description: 'FX predictions for 2025-01-27',
        file: '2025-01-27/predictions.json',
        totalPairs: 47,
        averageAccuracy: 85.2,
        lastUpdated: '2025-01-27T02:07:53.964Z',
      },
      '2025-01-26': {
        date: '2025-01-26',
        type: 'fx_predictions',
        description: 'FX predictions for 2025-01-26',
        file: '2025-01-26/predictions.json',
        totalPairs: 45,
        averageAccuracy: 87.1,
        lastUpdated: '2025-01-26T02:07:53.964Z',
      },
      '2025-01-25': {
        date: '2025-01-25',
        type: 'fx_predictions',
        description: 'FX predictions for 2025-01-25',
        file: '2025-01-25/predictions.json',
        totalPairs: 43,
        averageAccuracy: 82.5,
        lastUpdated: '2025-01-25T02:07:53.964Z',
      },
      '2025-01-24': {
        date: '2025-01-24',
        type: 'fx_predictions',
        description: 'FX predictions for 2025-01-24',
        file: '2025-01-24/predictions.json',
        totalPairs: 41,
        averageAccuracy: 88.3,
        lastUpdated: '2025-01-24T02:07:53.964Z',
      },
      '2025-01-23': {
        date: '2025-01-23',
        type: 'fx_predictions',
        description: 'FX predictions for 2025-01-23',
        file: '2025-01-23/predictions.json',
        totalPairs: 39,
        averageAccuracy: 84.7,
        lastUpdated: '2025-01-23T02:07:53.964Z',
      },
    },
  };

  setupMockFetch();

  try {
    const manager = new IndexManager();

    // Test first page
    const result1 = await manager.queryEntries({ limit: 2, offset: 0 });
    assertEquals(result1.entries.length, 2);
    assertEquals(result1.total, 5);
    assertEquals(result1.hasMore, true);
    assertEquals(result1.entries[0].date, '2025-01-27'); // Should be sorted by date desc

    // Test second page
    const result2 = await manager.queryEntries({ limit: 2, offset: 2 });
    assertEquals(result2.entries.length, 2);
    assertEquals(result2.hasMore, true);

    // Test last page
    const result3 = await manager.queryEntries({ limit: 2, offset: 4 });
    assertEquals(result3.entries.length, 1);
    assertEquals(result3.hasMore, false);
  } finally {
    restoreFetch();
  }
});

Deno.test('IndexManager - applies date filters correctly', async () => {
  mockIndexData = {
    metadata: {
      totalEntries: 3,
      lastUpdated: '2025-01-27T12:00:00.000Z',
      version: '1.0',
    },
    entries: {
      '2025-01-27': {
        date: '2025-01-27',
        type: 'fx_predictions',
        description: 'FX predictions for 2025-01-27',
        file: '2025-01-27/predictions.json',
        totalPairs: 47,
        averageAccuracy: 85.2,
        lastUpdated: '2025-01-27T02:07:53.964Z',
      },
      '2025-01-26': {
        date: '2025-01-26',
        type: 'fx_predictions',
        description: 'FX predictions for 2025-01-26',
        file: '2025-01-26/predictions.json',
        totalPairs: 45,
        averageAccuracy: 87.1,
        lastUpdated: '2025-01-26T02:07:53.964Z',
      },
      '2025-01-25': {
        date: '2025-01-25',
        type: 'fx_predictions',
        description: 'FX predictions for 2025-01-25',
        file: '2025-01-25/predictions.json',
        totalPairs: 43,
        averageAccuracy: 82.5,
        lastUpdated: '2025-01-25T02:07:53.964Z',
      },
    },
  };

  setupMockFetch();

  try {
    const manager = new IndexManager();

    // Test date range filter
    const result = await manager.queryEntries({
      startDate: '2025-01-26',
      endDate: '2025-01-27',
    });

    assertEquals(result.entries.length, 2);
    assertEquals(result.total, 2);
    assertEquals(result.entries[0].date, '2025-01-27');
    assertEquals(result.entries[1].date, '2025-01-26');
  } finally {
    restoreFetch();
  }
});

Deno.test('IndexManager - applies accuracy filters correctly', async () => {
  mockIndexData = {
    metadata: {
      totalEntries: 3,
      lastUpdated: '2025-01-27T12:00:00.000Z',
      version: '1.0',
    },
    entries: {
      '2025-01-27': {
        date: '2025-01-27',
        type: 'fx_predictions',
        description: 'FX predictions for 2025-01-27',
        file: '2025-01-27/predictions.json',
        totalPairs: 47,
        averageAccuracy: 85.2,
        lastUpdated: '2025-01-27T02:07:53.964Z',
      },
      '2025-01-26': {
        date: '2025-01-26',
        type: 'fx_predictions',
        description: 'FX predictions for 2025-01-26',
        file: '2025-01-26/predictions.json',
        totalPairs: 45,
        averageAccuracy: 87.1,
        lastUpdated: '2025-01-26T02:07:53.964Z',
      },
      '2025-01-25': {
        date: '2025-01-25',
        type: 'fx_predictions',
        description: 'FX predictions for 2025-01-25',
        file: '2025-01-25/predictions.json',
        totalPairs: 43,
        averageAccuracy: 82.5,
        lastUpdated: '2025-01-25T02:07:53.964Z',
      },
    },
  };

  setupMockFetch();

  try {
    const manager = new IndexManager();

    // Test minimum accuracy filter
    const result = await manager.queryEntries({
      minAccuracy: 85,
    });

    assertEquals(result.entries.length, 2);
    assertEquals(result.total, 2);
    assertEquals(result.entries[0].averageAccuracy, 87.1);
    assertEquals(result.entries[1].averageAccuracy, 85.2);
  } finally {
    restoreFetch();
  }
});

Deno.test('IndexManager - sorts entries correctly', async () => {
  mockIndexData = {
    metadata: {
      totalEntries: 3,
      lastUpdated: '2025-01-27T12:00:00.000Z',
      version: '1.0',
    },
    entries: {
      '2025-01-27': {
        date: '2025-01-27',
        type: 'fx_predictions',
        description: 'FX predictions for 2025-01-27',
        file: '2025-01-27/predictions.json',
        totalPairs: 47,
        averageAccuracy: 85.2,
        lastUpdated: '2025-01-27T02:07:53.964Z',
      },
      '2025-01-26': {
        date: '2025-01-26',
        type: 'fx_predictions',
        description: 'FX predictions for 2025-01-26',
        file: '2025-01-26/predictions.json',
        totalPairs: 45,
        averageAccuracy: 87.1,
        lastUpdated: '2025-01-26T02:07:53.964Z',
      },
      '2025-01-25': {
        date: '2025-01-25',
        type: 'fx_predictions',
        description: 'FX predictions for 2025-01-25',
        file: '2025-01-25/predictions.json',
        totalPairs: 43,
        averageAccuracy: 82.5,
        lastUpdated: '2025-01-25T02:07:53.964Z',
      },
    },
  };

  setupMockFetch();

  try {
    const manager = new IndexManager();

    // Test sorting by accuracy descending
    const result = await manager.queryEntries({
      sortBy: 'accuracy',
      sortOrder: 'desc',
    });

    assertEquals(result.entries[0].averageAccuracy, 87.1);
    assertEquals(result.entries[1].averageAccuracy, 85.2);
    assertEquals(result.entries[2].averageAccuracy, 82.5);

    // Test sorting by pairs ascending
    const result2 = await manager.queryEntries({
      sortBy: 'pairs',
      sortOrder: 'asc',
    });

    assertEquals(result2.entries[0].totalPairs, 43);
    assertEquals(result2.entries[1].totalPairs, 45);
    assertEquals(result2.entries[2].totalPairs, 47);
  } finally {
    restoreFetch();
  }
});

Deno.test('IndexManager - gets recent entries correctly', async () => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const twoDaysAgo = new Date(today);
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

  mockIndexData = {
    metadata: {
      totalEntries: 3,
      lastUpdated: today.toISOString(),
      version: '1.0',
    },
    entries: {
      [today.toISOString().split('T')[0]]: {
        date: today.toISOString().split('T')[0],
        type: 'fx_predictions',
        description: 'FX predictions for today',
        file: `${today.toISOString().split('T')[0]}/predictions.json`,
        totalPairs: 47,
        averageAccuracy: 85.2,
        lastUpdated: today.toISOString(),
      },
      [yesterday.toISOString().split('T')[0]]: {
        date: yesterday.toISOString().split('T')[0],
        type: 'fx_predictions',
        description: 'FX predictions for yesterday',
        file: `${yesterday.toISOString().split('T')[0]}/predictions.json`,
        totalPairs: 45,
        averageAccuracy: 87.1,
        lastUpdated: yesterday.toISOString(),
      },
      [twoDaysAgo.toISOString().split('T')[0]]: {
        date: twoDaysAgo.toISOString().split('T')[0],
        type: 'fx_predictions',
        description: 'FX predictions for two days ago',
        file: `${twoDaysAgo.toISOString().split('T')[0]}/predictions.json`,
        totalPairs: 43,
        averageAccuracy: 82.5,
        lastUpdated: twoDaysAgo.toISOString(),
      },
    },
  };

  setupMockFetch();

  try {
    const manager = new IndexManager();

    // Test getting recent entries (last 1 day)
    const result = await manager.getRecentEntries(1);
    assertEquals(result.length, 1);
    assertEquals(result[0].date, today.toISOString().split('T')[0]);

    // Test getting recent entries (last 2 days)
    const result2 = await manager.getRecentEntries(2);
    assertEquals(result2.length, 2);
  } finally {
    restoreFetch();
  }
});

Deno.test('IndexManager - gets statistics correctly', async () => {
  mockIndexData = {
    metadata: {
      totalEntries: 3,
      lastUpdated: '2025-01-27T12:00:00.000Z',
      version: '1.0',
    },
    entries: {
      '2025-01-27': {
        date: '2025-01-27',
        type: 'fx_predictions',
        description: 'FX predictions for 2025-01-27',
        file: '2025-01-27/predictions.json',
        totalPairs: 47,
        averageAccuracy: 85.2,
        lastUpdated: '2025-01-27T02:07:53.964Z',
      },
      '2025-01-26': {
        date: '2025-01-26',
        type: 'fx_predictions',
        description: 'FX predictions for 2025-01-26',
        file: '2025-01-26/predictions.json',
        totalPairs: 45,
        averageAccuracy: 87.1,
        lastUpdated: '2025-01-26T02:07:53.964Z',
      },
      '2025-01-25': {
        date: '2025-01-25',
        type: 'fx_predictions',
        description: 'FX predictions for 2025-01-25',
        file: '2025-01-25/predictions.json',
        totalPairs: 43,
        averageAccuracy: 82.5,
        lastUpdated: '2025-01-25T02:07:53.964Z',
      },
    },
  };

  setupMockFetch();

  try {
    const manager = new IndexManager();
    const stats = await manager.getStatistics();

    assertEquals(stats.totalEntries, 3);
    assertEquals(stats.dateRange.start, '2025-01-25');
    assertEquals(stats.dateRange.end, '2025-01-27');
    assertEquals(stats.averageAccuracy, (85.2 + 87.1 + 82.5) / 3);
    assertEquals(stats.highAccuracyCount, 0); // None >= 90%
    assertGreaterOrEqual(stats.recentEntries, 0);
  } finally {
    restoreFetch();
  }
});

Deno.test('IndexManager - handles empty index correctly', async () => {
  mockIndexData = {
    metadata: {
      totalEntries: 0,
      lastUpdated: '2025-01-27T12:00:00.000Z',
      version: '1.0',
    },
    entries: {},
  };

  setupMockFetch();

  try {
    const manager = new IndexManager();

    const result = await manager.queryEntries();
    assertEquals(result.entries.length, 0);
    assertEquals(result.total, 0);
    assertEquals(result.hasMore, false);

    const stats = await manager.getStatistics();
    assertEquals(stats.totalEntries, 0);
    assertEquals(stats.averageAccuracy, 0);
  } finally {
    restoreFetch();
  }
});

Deno.test('IndexManager - caches data correctly', async () => {
  mockIndexData = {
    metadata: {
      totalEntries: 1,
      lastUpdated: '2025-01-27T12:00:00.000Z',
      version: '1.0',
    },
    entries: {
      '2025-01-27': {
        date: '2025-01-27',
        type: 'fx_predictions',
        description: 'FX predictions for 2025-01-27',
        file: '2025-01-27/predictions.json',
        totalPairs: 47,
        averageAccuracy: 85.2,
        lastUpdated: '2025-01-27T02:07:53.964Z',
      },
    },
  };

  setupMockFetch();

  try {
    const manager = new IndexManager();

    // First load
    const result1 = await manager.loadIndex();
    assertEquals(result1.metadata?.totalEntries, 1);

    // Second load should use cache
    const result2 = await manager.loadIndex();
    assertEquals(result2.metadata?.totalEntries, 1);

    // Clear cache
    manager.clearCache();
    const result3 = await manager.loadIndex();
    assertEquals(result3.metadata?.totalEntries, 1);
  } finally {
    restoreFetch();
  }
}); 