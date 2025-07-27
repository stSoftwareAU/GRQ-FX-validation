/**
 * Paginated List Component for handling large datasets
 */

import { IndexManager, type IndexQuery, type IndexResult } from './index-manager.ts';

export interface PaginationConfig {
  pageSize: number;
  maxPages: number;
  showPageNumbers: boolean;
  showPageSizeSelector: boolean;
  pageSizeOptions: number[];
}

export interface PaginationState {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export class PaginatedList {
  private indexManager: IndexManager;
  private config: PaginationConfig;
  private state: PaginationState;
  private currentQuery: IndexQuery;
  private container: HTMLElement | null = null;
  private loadingElement: HTMLElement | null = null;
  private tableElement: HTMLElement | null = null;
  private paginationElement: HTMLElement | null = null;
  private onItemClick?: (key: string, entry: any) => void;

  constructor(
    indexManager: IndexManager,
    config: Partial<PaginationConfig> = {},
    onItemClick?: (key: string, entry: any) => void
  ) {
    this.indexManager = indexManager;
    this.onItemClick = onItemClick;
    
    this.config = {
      pageSize: 25,
      maxPages: 10,
      showPageNumbers: true,
      showPageSizeSelector: true,
      pageSizeOptions: [10, 25, 50, 100],
      ...config
    };

    this.state = {
      currentPage: 1,
      pageSize: this.config.pageSize,
      totalItems: 0,
      totalPages: 0,
      hasNext: false,
      hasPrevious: false
    };

    this.currentQuery = {
      limit: this.config.pageSize,
      offset: 0,
      sortBy: 'date',
      sortOrder: 'desc'
    };
  }

  /**
   * Initialize the paginated list
   */
  async initialize(containerId: string): Promise<void> {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      throw new Error(`Container with id '${containerId}' not found`);
    }

    this.createElements();
    await this.loadData();
  }

  /**
   * Create DOM elements
   */
  private createElements(): void {
    if (!this.container) return;

    // Create loading element
    this.loadingElement = document.createElement('div');
    this.loadingElement.id = 'loading';
    this.loadingElement.className = 'text-center py-4';
    this.loadingElement.innerHTML = `
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
      <p class="mt-2">Loading prediction files...</p>
    `;
    this.loadingElement.style.display = 'none';

    // Create table element
    this.tableElement = document.createElement('div');
    this.tableElement.className = 'table-responsive';
    this.tableElement.innerHTML = `
      <table class="table table-hover prediction-files-table mb-0" id="predictionFilesTable">
        <thead class="table-dark">
          <tr>
            <th>Date</th>
            <th>Description</th>
            <th>Total Pairs</th>
            <th>Average Accuracy</th>
            <th>Last Updated</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="predictionFilesTableBody"></tbody>
      </table>
    `;

    // Create pagination element
    this.paginationElement = document.createElement('div');
    this.paginationElement.className = 'd-flex justify-content-between align-items-center mt-3';
    this.paginationElement.innerHTML = `
      <div class="pagination-info">
        Showing <span id="showingStart">0</span> to <span id="showingEnd">0</span> of <span id="totalItems">0</span> entries
      </div>
      <div class="pagination-controls">
        <button id="prevPage" class="btn btn-outline-primary btn-sm" disabled>
          <i class="fas fa-chevron-left"></i> Previous
        </button>
        <span id="pageNumbers" class="mx-2"></span>
        <button id="nextPage" class="btn btn-outline-primary btn-sm" disabled>
          Next <i class="fas fa-chevron-right"></i>
        </button>
      </div>
      ${this.config.showPageSizeSelector ? `
        <div class="page-size-selector">
          <label for="pageSizeSelect" class="form-label me-2">Show:</label>
          <select id="pageSizeSelect" class="form-select form-select-sm" style="width: auto;">
            ${this.config.pageSizeOptions.map(size => 
              `<option value="${size}" ${size === this.config.pageSize ? 'selected' : ''}>${size}</option>`
            ).join('')}
          </select>
        </div>
      ` : ''}
    `;

    // Add elements to container
    this.container.innerHTML = '';
    this.container.appendChild(this.loadingElement);
    this.container.appendChild(this.tableElement);
    this.container.appendChild(this.paginationElement);

    // Add event listeners
    this.addEventListeners();
  }

  /**
   * Add event listeners
   */
  private addEventListeners(): void {
    const prevButton = document.getElementById('prevPage');
    const nextButton = document.getElementById('nextPage');
    const pageSizeSelect = document.getElementById('pageSizeSelect') as HTMLSelectElement;

    if (prevButton) {
      prevButton.addEventListener('click', () => this.previousPage());
    }

    if (nextButton) {
      nextButton.addEventListener('click', () => this.nextPage());
    }

    if (pageSizeSelect) {
      pageSizeSelect.addEventListener('change', (e) => {
        const target = e.target as HTMLSelectElement;
        this.setPageSize(parseInt(target.value));
      });
    }
  }

  /**
   * Load data for current page
   */
  async loadData(): Promise<void> {
    if (!this.container) return;

    this.showLoading();

    try {
      const result = await this.indexManager.queryEntries(this.currentQuery);
      
      this.state.totalItems = result.total;
      this.state.totalPages = Math.ceil(result.total / this.state.pageSize);
      this.state.hasNext = result.hasMore;
      this.state.hasPrevious = this.state.currentPage > 1;

      this.renderTable(result.entries);
      this.renderPagination();
      this.hideLoading();

    } catch (error) {
      console.error('Error loading data:', error);
      this.showError('Failed to load prediction files');
    }
  }

  /**
   * Render table with entries
   */
  private renderTable(entries: any[]): void {
    const tbody = document.getElementById('predictionFilesTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (entries.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center py-4">
            <i class="fas fa-inbox fa-2x text-muted mb-2"></i>
            <p class="text-muted">No prediction files found</p>
          </td>
        </tr>
      `;
      return;
    }

    for (const entry of entries) {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${entry.date}</td>
        <td>${entry.description}</td>
        <td>${entry.totalPairs || 'N/A'}</td>
        <td>
          ${entry.averageAccuracy ? 
            `<span class="badge ${this.getAccuracyClass(entry.averageAccuracy)}">
              ${entry.averageAccuracy.toFixed(1)}%
            </span>` : 
            'N/A'
          }
        </td>
        <td>${entry.lastUpdated ? new Date(entry.lastUpdated).toLocaleDateString() : 'N/A'}</td>
        <td>
          <button class="btn btn-sm btn-primary view-details" data-key="${entry.date}">
            <i class="fas fa-chart-line me-1"></i>View Details
          </button>
        </td>
      `;

      // Add click handler
      const viewButton = row.querySelector('.view-details');
      if (viewButton && this.onItemClick) {
        viewButton.addEventListener('click', () => {
          this.onItemClick!(entry.date, entry);
        });
      }

      tbody.appendChild(row);
    }
  }

  /**
   * Render pagination controls
   */
  private renderPagination(): void {
    // Update info
    const showingStart = document.getElementById('showingStart');
    const showingEnd = document.getElementById('showingEnd');
    const totalItems = document.getElementById('totalItems');

    if (showingStart) showingStart.textContent = ((this.state.currentPage - 1) * this.state.pageSize + 1).toString();
    if (showingEnd) showingEnd.textContent = Math.min(this.state.currentPage * this.state.pageSize, this.state.totalItems).toString();
    if (totalItems) totalItems.textContent = this.state.totalItems.toString();

    // Update buttons
    const prevButton = document.getElementById('prevPage') as HTMLButtonElement;
    const nextButton = document.getElementById('nextPage') as HTMLButtonElement;

    if (prevButton) {
      prevButton.disabled = !this.state.hasPrevious;
    }

    if (nextButton) {
      nextButton.disabled = !this.state.hasNext;
    }

    // Update page numbers
    if (this.config.showPageNumbers) {
      this.renderPageNumbers();
    }
  }

  /**
   * Render page numbers
   */
  private renderPageNumbers(): void {
    const pageNumbers = document.getElementById('pageNumbers');
    if (!pageNumbers) return;

    const pages = this.getVisiblePages();
    pageNumbers.innerHTML = pages.map(page => {
      if (page === '...') {
        return '<span class="mx-1">...</span>';
      }
      
      const isCurrent = page === this.state.currentPage;
      return `
        <button class="btn btn-sm ${isCurrent ? 'btn-primary' : 'btn-outline-primary'} mx-1" 
                onclick="window.paginatedList.goToPage(${page})" 
                ${isCurrent ? 'disabled' : ''}>
          ${page}
        </button>
      `;
    }).join('');
  }

  /**
   * Get visible page numbers
   */
  private getVisiblePages(): (number | string)[] {
    const pages: (number | string)[] = [];
    const maxVisible = this.config.maxPages;
    const totalPages = this.state.totalPages;
    const currentPage = this.state.currentPage;

    if (totalPages <= maxVisible) {
      // Show all pages
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Show subset of pages
      const halfVisible = Math.floor(maxVisible / 2);
      let start = Math.max(1, currentPage - halfVisible);
      let end = Math.min(totalPages, start + maxVisible - 1);

      if (end - start + 1 < maxVisible) {
        start = Math.max(1, end - maxVisible + 1);
      }

      if (start > 1) {
        pages.push(1);
        if (start > 2) pages.push('...');
      }

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (end < totalPages) {
        if (end < totalPages - 1) pages.push('...');
        pages.push(totalPages);
      }
    }

    return pages;
  }

  /**
   * Navigation methods
   */
  async goToPage(page: number): Promise<void> {
    if (page < 1 || page > this.state.totalPages) return;
    
    this.state.currentPage = page;
    this.currentQuery.offset = (page - 1) * this.state.pageSize;
    await this.loadData();
  }

  async nextPage(): Promise<void> {
    if (this.state.hasNext) {
      await this.goToPage(this.state.currentPage + 1);
    }
  }

  async previousPage(): Promise<void> {
    if (this.state.hasPrevious) {
      await this.goToPage(this.state.currentPage - 1);
    }
  }

  async setPageSize(size: number): Promise<void> {
    this.state.pageSize = size;
    this.state.currentPage = 1;
    this.currentQuery.limit = size;
    this.currentQuery.offset = 0;
    await this.loadData();
  }

  /**
   * Apply filters
   */
  async applyFilters(filters: Partial<IndexQuery>): Promise<void> {
    this.currentQuery = { ...this.currentQuery, ...filters };
    this.state.currentPage = 1;
    this.currentQuery.offset = 0;
    await this.loadData();
  }

  /**
   * Utility methods
   */
  private showLoading(): void {
    if (this.loadingElement) {
      this.loadingElement.style.display = 'block';
    }
    if (this.tableElement) {
      this.tableElement.style.display = 'none';
    }
  }

  private hideLoading(): void {
    if (this.loadingElement) {
      this.loadingElement.style.display = 'none';
    }
    if (this.tableElement) {
      this.tableElement.style.display = 'block';
    }
  }

  private showError(message: string): void {
    if (this.container) {
      this.container.innerHTML = `
        <div class="alert alert-danger" role="alert">
          <i class="fas fa-exclamation-triangle me-2"></i>
          ${message}
        </div>
      `;
    }
  }

  private getAccuracyClass(accuracy: number): string {
    if (accuracy >= 90) return 'accuracy-high';
    if (accuracy >= 70) return 'accuracy-medium';
    return 'accuracy-low';
  }

  /**
   * Public methods for external access
   */
  getCurrentState(): PaginationState {
    return { ...this.state };
  }

  getCurrentQuery(): IndexQuery {
    return { ...this.currentQuery };
  }

  async refresh(): Promise<void> {
    this.indexManager.clearCache();
    await this.loadData();
  }
} 