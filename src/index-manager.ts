/**
 * Index Manager for handling large numbers of prediction file entries
 */

export interface IndexEntry {
  date: string;
  type: string;
  description: string;
  file: string;
  totalPairs?: number;
  averageAccuracy?: number;
  lastUpdated?: string;
}

export interface IndexData {
  entries: Record<string, IndexEntry>;
  metadata?: {
    totalEntries: number;
    lastUpdated: string;
    version: string;
  };
}

export interface IndexQuery {
  startDate?: string;
  endDate?: string;
  type?: string;
  minAccuracy?: number;
  maxAccuracy?: number;
  limit?: number;
  offset?: number;
  sortBy?: 'date' | 'accuracy' | 'pairs';
  sortOrder?: 'asc' | 'desc';
}

export interface IndexResult {
  entries: IndexEntry[];
  total: number;
  hasMore: boolean;
  metadata: {
    query: IndexQuery;
    processingTime: number;
  };
}

export class IndexManager {
  private cache: Map<string, IndexData> = new Map();
  private lastFetch: number = 0;
  private cacheTimeout: number = 5 * 60 * 1000; // 5 minutes

  /**
   * Load index data with caching
   */
  async loadIndex(): Promise<IndexData> {
    const now = Date.now();
    
    // Check cache first
    if (this.cache.has('main') && (now - this.lastFetch) < this.cacheTimeout) {
      return this.cache.get('main')!;
    }

    try {
      const response = await fetch('index.json');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const indexData: IndexData = await response.json();
      
      // Add metadata if not present
      if (!indexData.metadata) {
        indexData.metadata = {
          totalEntries: Object.keys(indexData.entries).length,
          lastUpdated: new Date().toISOString(),
          version: '1.0'
        };
      }
      
      // Cache the result
      this.cache.set('main', indexData);
      this.lastFetch = now;
      
      return indexData;
    } catch (error) {
      console.error('Error loading index:', error);
      throw error;
    }
  }

  /**
   * Query entries with filtering and pagination
   */
  async queryEntries(query: IndexQuery = {}): Promise<IndexResult> {
    const startTime = Date.now();
    const indexData = await this.loadIndex();
    
    let entries = Object.entries(indexData.entries).map(([key, entry]) => ({
      key,
      ...entry
    }));

    // Apply filters
    entries = this.applyFilters(entries, query);
    
    // Apply sorting
    entries = this.applySorting(entries, query.sortBy || 'date', query.sortOrder || 'desc');
    
    // Apply pagination
    const total = entries.length;
    const offset = query.offset || 0;
    const limit = query.limit || 50;
    
    entries = entries.slice(offset, offset + limit);
    
    const processingTime = Date.now() - startTime;
    
    return {
      entries: entries.map(({ key, ...entry }) => entry),
      total,
      hasMore: offset + limit < total,
      metadata: {
        query,
        processingTime
      }
    };
  }

  /**
   * Get recent entries (last N days)
   */
  async getRecentEntries(days: number = 30): Promise<IndexEntry[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffString = cutoffDate.toISOString().split('T')[0];
    
    const result = await this.queryEntries({
      startDate: cutoffString,
      sortBy: 'date',
      sortOrder: 'desc',
      limit: 100
    });
    
    return result.entries;
  }

  /**
   * Get high accuracy entries
   */
  async getHighAccuracyEntries(minAccuracy: number = 90): Promise<IndexEntry[]> {
    const result = await this.queryEntries({
      minAccuracy,
      sortBy: 'accuracy',
      sortOrder: 'desc',
      limit: 50
    });
    
    return result.entries;
  }

  /**
   * Get entries by date range
   */
  async getEntriesByDateRange(startDate: string, endDate: string): Promise<IndexEntry[]> {
    const result = await this.queryEntries({
      startDate,
      endDate,
      sortBy: 'date',
      sortOrder: 'desc'
    });
    
    return result.entries;
  }

  /**
   * Get entry by key
   */
  async getEntry(key: string): Promise<IndexEntry | null> {
    const indexData = await this.loadIndex();
    return indexData.entries[key] || null;
  }

  /**
   * Get statistics about the index
   */
  async getStatistics(): Promise<{
    totalEntries: number;
    dateRange: { start: string; end: string };
    averageAccuracy: number;
    highAccuracyCount: number;
    recentEntries: number;
  }> {
    const indexData = await this.loadIndex();
    const entries = Object.values(indexData.entries);
    
    if (entries.length === 0) {
      return {
        totalEntries: 0,
        dateRange: { start: '', end: '' },
        averageAccuracy: 0,
        highAccuracyCount: 0,
        recentEntries: 0
      };
    }
    
    const dates = entries.map(e => e.date).sort();
    const accuracies = entries
      .map(e => e.averageAccuracy)
      .filter(a => a !== undefined) as number[];
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentEntries = entries.filter(e => new Date(e.date) >= thirtyDaysAgo).length;
    
    return {
      totalEntries: entries.length,
      dateRange: { start: dates[0], end: dates[dates.length - 1] },
      averageAccuracy: accuracies.length > 0 ? accuracies.reduce((a, b) => a + b, 0) / accuracies.length : 0,
      highAccuracyCount: accuracies.filter(a => a >= 90).length,
      recentEntries
    };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    this.lastFetch = 0;
  }

  /**
   * Apply filters to entries
   */
  private applyFilters(entries: Array<{ key: string } & IndexEntry>, query: IndexQuery): Array<{ key: string } & IndexEntry> {
    return entries.filter(entry => {
      // Date range filter
      if (query.startDate && entry.date < query.startDate) return false;
      if (query.endDate && entry.date > query.endDate) return false;
      
      // Type filter
      if (query.type && entry.type !== query.type) return false;
      
      // Accuracy filters
      if (query.minAccuracy && (entry.averageAccuracy || 0) < query.minAccuracy) return false;
      if (query.maxAccuracy && (entry.averageAccuracy || 0) > query.maxAccuracy) return false;
      
      return true;
    });
  }

  /**
   * Apply sorting to entries
   */
  private applySorting(entries: Array<{ key: string } & IndexEntry>, sortBy: string, sortOrder: string): Array<{ key: string } & IndexEntry> {
    return entries.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'date':
          comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
          break;
        case 'accuracy':
          comparison = (a.averageAccuracy || 0) - (b.averageAccuracy || 0);
          break;
        case 'pairs':
          comparison = (a.totalPairs || 0) - (b.totalPairs || 0);
          break;
        default:
          comparison = 0;
      }
      
      return sortOrder === 'desc' ? -comparison : comparison;
    });
  }
} 