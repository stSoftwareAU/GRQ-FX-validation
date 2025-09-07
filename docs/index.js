// Version constant - this will be updated by the git hook
const VERSION = "1.0.97";

// Set page title with version
document.title = `GRQ FX Validation Dashboard v${VERSION}`;

// Set version display
document.addEventListener("DOMContentLoaded", () => {
  console.log('DOM loaded, setting version:', VERSION);
  const versionElement = document.getElementById("version");
  console.log('Version element found:', versionElement);
  if (versionElement) {
    versionElement.textContent = VERSION;
    console.log('Version set to:', versionElement.textContent);
  } else {
    console.error('Version element not found!');
  }
  
  // Initialize offline indicator
  initializeOfflineIndicator();
  
  // Initialize validation status
  initializeValidationStatus();
  
  // Initialize dark mode toggle with a small delay to ensure DOM is fully ready
  setTimeout(() => {
    initializeDarkModeToggle();
  }, 100);
  
  // Also try to initialize it when the window loads (backup)
  window.addEventListener('load', () => {
    setTimeout(() => {
      const toggleButton = document.getElementById('dark-mode-toggle');
      if (!toggleButton) {
        console.log('Button still not found after window load, trying again...');
        initializeDarkModeToggle();
      }
    }, 200);
  });
});

// Offline indicator functionality
function initializeOfflineIndicator() {
  // Create offline indicator element
  const offlineIndicator = document.createElement('div');
  offlineIndicator.id = 'offline-indicator';
  offlineIndicator.className = 'alert alert-warning position-fixed';
  offlineIndicator.style.cssText = 'top: 10px; left: 10px; z-index: 9999; display: none; max-width: 300px;';
  offlineIndicator.innerHTML = `
    <small>
      <i class="fas fa-wifi me-1"></i>
      <strong>Offline Mode:</strong> Using cached data. Some features may be limited.
    </small>
  `;
  document.body.appendChild(offlineIndicator);
  
  // Monitor online/offline status
  function updateOnlineStatus() {
    const indicator = document.getElementById('offline-indicator');
    if (!navigator.onLine) {
      indicator.style.display = 'block';
      indicator.className = 'alert alert-warning position-fixed';
    } else {
      indicator.style.display = 'none';
    }
  }
  
  // Listen for online/offline events
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  
  // Check initial status
  updateOnlineStatus();
  
  // Monitor fetch requests for cache indicators and validation errors
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const url = args[0];
    const isDataFile = typeof url === 'string' && (url.includes('.csv') || url.includes('predictions.json'));
    
    return originalFetch.apply(this, args)
      .then(response => {
        // Check if response was served from cache
        if (response.headers.get('X-Served-From-Cache') === 'true') {
          if (isDataFile) {
            showCacheIndicator();
            console.warn('VALIDATION WARNING: Using cached data for', url);
          }
        }
        
        // Check for validation warnings
        if (response.headers.get('X-Validation-Warning') === 'CACHED-DATA') {
          showCacheIndicator();
          console.error('VALIDATION ERROR: Cached data being used for validation!');
        }
        
        return response;
      })
      .catch(error => {
        // If fetch fails for data files, show validation error
        if (isDataFile && !navigator.onLine) {
          showValidationError('No network connection available. Cannot load prediction data for validation.');
          console.error('VALIDATION ERROR: Cannot load data for validation:', error);
        }
        throw error;
      });
  };
}

function showCacheIndicator() {
  const indicator = document.getElementById('offline-indicator');
  if (indicator) {
    indicator.style.display = 'block';
    indicator.className = 'alert alert-danger position-fixed';
    indicator.style.cssText = 'top: 10px; left: 10px; z-index: 9999; display: block; max-width: 450px; border: 4px solid #dc3545; box-shadow: 0 0 20px rgba(220, 53, 69, 0.5); animation: pulse-warning 2s infinite;';
    indicator.innerHTML = `
      <div class="d-flex align-items-center">
        <i class="fas fa-exclamation-triangle me-3" style="font-size: 1.5rem; color: #dc3545; animation: shake 0.5s infinite;"></i>
        <div>
          <strong style="color: #dc3545; font-size: 1.1rem;">🚨 VALIDATION WARNING 🚨</strong><br>
          <strong style="color: #dc3545;">Using CACHED data - predictions may be OUTDATED!</strong><br>
          <small class="text-muted">⚠️ Connect to internet for accurate validation ⚠️</small>
        </div>
      </div>
    `;
    
    // Add pulsing animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes pulse-warning {
        0% { box-shadow: 0 0 20px rgba(220, 53, 69, 0.5); }
        50% { box-shadow: 0 0 30px rgba(220, 53, 69, 0.8); }
        100% { box-shadow: 0 0 20px rgba(220, 53, 69, 0.5); }
      }
      @keyframes shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-2px); }
        75% { transform: translateX(2px); }
      }
    `;
    document.head.appendChild(style);
    
    // Never auto-hide for validation warnings
    // User must manually dismiss or fix network connection
  }
}

function showValidationError(message) {
  // Create a more prominent error indicator
  const errorIndicator = document.createElement('div');
  errorIndicator.id = 'validation-error';
  errorIndicator.className = 'alert alert-danger position-fixed';
  errorIndicator.style.cssText = 'top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 10000; max-width: 500px; text-align: center;';
  errorIndicator.innerHTML = `
    <div class="d-flex flex-column align-items-center">
      <i class="fas fa-exclamation-circle mb-3" style="font-size: 3rem; color: #dc3545;"></i>
      <h4 class="text-danger mb-3">Validation Unavailable</h4>
      <p class="mb-3">${message}</p>
      <button class="btn btn-primary" onclick="this.parentElement.parentElement.remove()">
        <i class="fas fa-refresh me-1"></i> Retry
      </button>
    </div>
  `;
  
  // Remove any existing error indicator
  const existing = document.getElementById('validation-error');
  if (existing) existing.remove();
  
  document.body.appendChild(errorIndicator);
}

// Validation status functionality - only show when there's a problem
function initializeValidationStatus() {
  const statusElement = document.getElementById('validation-status');
  const statusText = document.getElementById('validation-status-text');
  
  if (!statusElement || !statusText) return;
  
  // Hide by default - only show when there's a problem
  statusElement.style.display = 'none';
  
  // Monitor network status changes
  window.addEventListener('online', () => {
    // Hide status when back online - everything is fine
    statusElement.style.display = 'none';
  });
  
  window.addEventListener('offline', () => {
    // Show big warning when offline
    statusElement.style.display = 'block';
    statusElement.querySelector('.alert').className = 'alert alert-danger mb-0';
    statusText.innerHTML = '<i class="fas fa-exclamation-triangle me-1"></i>OFFLINE - Validation may be inaccurate!';
  });
}

// Dark mode toggle functionality - Three states: Light, Auto, Dark
function initializeDarkModeToggle() {
  console.log('Initializing dark mode toggle...');
  console.log('All buttons in DOM:', document.querySelectorAll('button'));
  console.log('All elements with id containing "dark":', document.querySelectorAll('[id*="dark"]'));
  
  let toggleButton = document.getElementById('dark-mode-toggle');
  let toggleIcon = document.getElementById('dark-mode-icon');
  
  console.log('Dark mode toggle elements:', { toggleButton, toggleIcon });
  
  // If elements not found, create them dynamically
  if (!toggleButton || !toggleIcon) {
    console.log('Creating dark mode toggle button dynamically...');
    
    // Remove any existing toggle button first to prevent duplicates
    const existingToggle = document.getElementById('dark-mode-toggle');
    if (existingToggle) {
      existingToggle.remove();
      console.log('Removed existing toggle button');
    }
    
    // Debug: Show all elements with classes
    console.log('All elements with d-flex class:', document.querySelectorAll('.d-flex'));
    console.log('All elements with justify-content-between class:', document.querySelectorAll('.justify-content-between'));
    console.log('All elements with align-items-center class:', document.querySelectorAll('.align-items-center'));
    console.log('All elements with mb-2 class:', document.querySelectorAll('.mb-2'));
    console.log('All card-header elements:', document.querySelectorAll('.card-header'));
    
    // Try to find the header container - look for the one with the h1 title
    let headerContainer = null;
    
    // First, find all card headers
    const cardHeaders = document.querySelectorAll('.card-header');
    console.log('Found card headers:', cardHeaders);
    
    // Look for the one that contains the h1 with "GRQ FX Validation Dashboard"
    for (let header of cardHeaders) {
      const h1 = header.querySelector('h1');
      if (h1 && h1.textContent.includes('GRQ FX Validation Dashboard')) {
        console.log('Found header with GRQ FX title:', header);
        // Now look for the flex container within this header
        headerContainer = header.querySelector('.d-flex.justify-content-between.align-items-center.mb-2');
        if (headerContainer) {
          console.log('Found flex container in header:', headerContainer);
          break;
        }
      }
    }
    
    if (!headerContainer) {
      console.error('No suitable header container found!');
      console.log('Available elements with card-header class:', document.querySelectorAll('.card-header'));
      
      // Try to find any card header and use it
      const anyCardHeader = document.querySelector('.card-header');
      if (anyCardHeader) {
        console.log('Using any available card header:', anyCardHeader);
        headerContainer = anyCardHeader;
      } else {
        console.error('No card header found at all!');
        return;
      }
    }
    
    // Create the button with slider switch design - always in header
    toggleButton = document.createElement('button');
    toggleButton.id = 'dark-mode-toggle';
    toggleButton.className = 'theme-toggle-switch';
    toggleButton.title = 'Theme Toggle (Auto/Light/Dark)';
    
    // Header button styles - slider switch design
    toggleButton.style.cssText = `
      width: 50px;
      height: 25px;
      border-radius: 12px;
      border: 2px solid rgba(255,255,255,0.8);
      background-color: rgba(255,255,255,0.1);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: bold;
      transition: all 0.3s ease;
      position: relative;
      overflow: hidden;
      margin-left: 10px;
    `;
    
    // Create the icon/text indicator
    toggleIcon = document.createElement('span');
    toggleIcon.id = 'dark-mode-icon';
    toggleIcon.textContent = 'A'; // Default to Auto
    toggleIcon.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      transition: all 0.3s ease;
    `;
    
    // Add icon to button
    toggleButton.appendChild(toggleIcon);
    
    // Add button to header container in the correct position
    // Try to find the flex container within the header first
    const flexContainer = headerContainer.querySelector('.d-flex.justify-content-between.align-items-center.mb-2');
    if (flexContainer) {
      console.log('Flex container found:', flexContainer);
      console.log('Flex container children:', flexContainer.children);
      console.log('Flex container children length:', flexContainer.children.length);
      
      // The flex container should have: [empty div, h1, (our button should go here)]
      // Insert the button as the third child (after the h1)
      const children = flexContainer.children;
      if (children.length >= 2) {
        // Insert after the h1 (second child)
        flexContainer.insertBefore(toggleButton, children[2] || null);
        console.log('Added button to flex container as third child');
      } else {
        // Fallback - append to end
        flexContainer.appendChild(toggleButton);
        console.log('Added button to flex container at end');
      }
    } else {
      // Fallback - add to the header directly with absolute positioning
      headerContainer.style.position = 'relative';
      toggleButton.style.position = 'absolute';
      toggleButton.style.top = '10px';
      toggleButton.style.right = '10px';
      headerContainer.appendChild(toggleButton);
      console.log('Added button to header with absolute positioning');
    }
    
    console.log('Dark mode toggle button created and added to DOM');
  }
  
  // Three states: 'light', 'auto', 'dark'
  let userPreference = localStorage.getItem('dark-mode-preference') || 'auto';
  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  
  // Apply initial state
  updateDarkMode(userPreference);
  
  // Toggle button click handler - cycles through: auto -> light -> dark -> auto
  toggleButton.addEventListener('click', () => {
    console.log('Toggle button clicked, current preference:', userPreference);
    
    let newPreference;
    switch (userPreference) {
      case 'auto':
        newPreference = 'light';
        break;
      case 'light':
        newPreference = 'dark';
        break;
      case 'dark':
        newPreference = 'auto';
        break;
      default:
        newPreference = 'auto';
    }
    
    console.log('Switching to preference:', newPreference);
    userPreference = newPreference; // Update the variable
    updateDarkMode(newPreference);
    localStorage.setItem('dark-mode-preference', newPreference);
  });
  
  function updateDarkMode(preference) {
    // Remove all mode classes
    document.body.classList.remove('dark-mode-forced', 'light-mode-forced');
    
    switch (preference) {
      case 'light':
        document.body.classList.add('light-mode-forced');
        toggleIcon.textContent = 'L';
        toggleButton.title = 'Light Mode (Click for Dark Mode)';
        toggleButton.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
        toggleButton.style.color = '#000';
        break;
      case 'dark':
        document.body.classList.add('dark-mode-forced');
        toggleIcon.textContent = 'D';
        toggleButton.title = 'Dark Mode (Click for Auto Mode)';
        toggleButton.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        toggleButton.style.color = '#fff';
        break;
      case 'auto':
      default:
        // No forced class - follows system preference
        toggleIcon.textContent = 'A';
        toggleButton.title = 'Auto Mode - Following System (Click for Light Mode)';
        toggleButton.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
        toggleButton.style.color = 'white';
        break;
    }
  }
  
  // Listen for system theme changes when in auto mode
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (userPreference === 'auto') {
      updateDarkMode('auto');
    }
  });
  
  // Add keyboard shortcut for testing (Ctrl/Cmd + D)
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
      e.preventDefault();
      console.log('Keyboard shortcut triggered, current preference:', userPreference);
      
      let newPreference;
      switch (userPreference) {
        case 'auto':
          newPreference = 'light';
          break;
        case 'light':
          newPreference = 'dark';
          break;
        case 'dark':
          newPreference = 'auto';
          break;
        default:
          newPreference = 'auto';
      }
      
      console.log('Keyboard shortcut switching to preference:', newPreference);
      userPreference = newPreference; // Update the variable
      updateDarkMode(newPreference);
      localStorage.setItem('dark-mode-preference', newPreference);
    }
  });
}

// Yahoo Finance API utilities
class YahooFinanceAPI {
  constructor() {
    this.proxies = [
      "https://api.allorigins.win/raw?url=",
      "https://corsproxy.io/?",
      "https://thingproxy.freeboard.io/fetch/",
    ];
  }

  // Convert FX pair to Yahoo Finance symbol format - completely dynamic
  convertFXPairToSymbol(fxPair) {
    // Handle various FX pair formats dynamically
    let symbol = fxPair;

    // If it already has =X suffix, use as is
    if (fxPair.includes("=X")) {
      return fxPair;
    }

    // If it has a / separator, convert to Yahoo format
    if (fxPair.includes("/")) {
      symbol = fxPair.replace("/", "") + "=X";
    } else {
      // Assume it's a 6-character pair (e.g., AUDUSD) and add =X
      symbol = fxPair + "=X";
    }

    return symbol;
  }

  // Get FX pair description dynamically from Yahoo Finance - completely dynamic
  async getFXPairDescription(fxPair) {
    try {
      const symbol = this.convertFXPairToSymbol(fxPair);
      const yahooUrl =
        `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;

      for (let i = 0; i < this.proxies.length; i++) {
        try {
          const proxyUrl = this.proxies[i] + encodeURIComponent(yahooUrl);
          const response = await Promise.race([
            fetch(proxyUrl, { method: "GET" }),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Request timeout")), 5000)
            ),
          ]);

          if (response.ok) {
            const data = await response.json();
            if (data.chart && data.chart.result && data.chart.result[0]) {
              const result = data.chart.result[0];

              // Try to get description from Yahoo Finance meta data
              if (result.meta) {
                // Use Yahoo Finance's own description if available
                if (result.meta.shortName) {
                  return result.meta.shortName;
                }

                // Use long name if available
                if (result.meta.longName) {
                  return result.meta.longName;
                }

                // Use symbol name as fallback
                if (result.meta.symbol) {
                  return result.meta.symbol.replace("=X", "") +
                    " Exchange Rate";
                }
              }
            }
          }
        } catch (error) {
          console.warn(`Failed to get description with proxy ${i + 1}:`, error);
          if (i === this.proxies.length - 1) {
            break;
          }
        }
      }
    } catch (error) {
      console.warn("Failed to get FX pair description:", error);
    }

    // Fallback to simple format if Yahoo Finance data is not available
    return `${fxPair} Exchange Rate`;
  }

  // Get Yahoo Finance URL for FX pair
  getYahooFinanceURL(fxPair) {
    const symbol = this.convertFXPairToSymbol(fxPair);
    return `https://finance.yahoo.com/quote/${symbol}`;
  }

  // Validate if FX pair exists on Yahoo Finance
  async validateFXPair(fxPair) {
    try {
      const symbol = this.convertFXPairToSymbol(fxPair);
      const yahooUrl =
        `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;

      for (let i = 0; i < this.proxies.length; i++) {
        try {
          const proxyUrl = this.proxies[i] + encodeURIComponent(yahooUrl);
          const response = await Promise.race([
            fetch(proxyUrl, { method: "GET" }),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Request timeout")), 5000)
            ),
          ]);

          if (response.ok) {
            const data = await response.json();
            if (data.chart && data.chart.result && data.chart.result[0]) {
              const result = data.chart.result[0];
              // Check if we have valid data
              if (
                result.meta && result.meta.symbol && result.timestamp &&
                result.timestamp.length > 0
              ) {
                return true;
              }
            }
          }
        } catch (error) {
          console.warn(
            `Failed to validate ${fxPair} with proxy ${i + 1}:`,
            error,
          );
          if (i === this.proxies.length - 1) {
            break;
          }
        }
      }
    } catch (error) {
      console.warn("Failed to validate FX pair:", error);
    }

    return false;
  }

  // Fetch FX data from Yahoo Finance with multiple proxy fallbacks
  async fetchFXData(fxPair, startDate, endDate, interval = "1d") {
    const symbol = this.convertFXPairToSymbol(fxPair);
    const startTimestamp = Math.floor(startDate.getTime() / 1000);
    const endTimestamp = Math.floor(endDate.getTime() / 1000);

    const yahooUrl =
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${startTimestamp}&period2=${endTimestamp}&interval=${interval}`;

    console.log(
      `Fetching ${fxPair} data from Yahoo Finance (${interval} interval)...`,
    );

    for (let i = 0; i < this.proxies.length; i++) {
      try {
        console.log(
          `Attempting ${fxPair} fetch with proxy ${
            i + 1
          }/${this.proxies.length}...`,
        );
        const proxyUrl = this.proxies[i] + encodeURIComponent(yahooUrl);

        const response = await Promise.race([
          fetch(proxyUrl, { method: "GET" }),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error(`${fxPair} request timeout`)),
              8000,
            )
          ),
        ]);

        if (!response.ok) {
          throw new Error(
            `${fxPair} API request failed: ${response.status} ${response.statusText}`,
          );
        }

        const responseText = await response.text();
        if (
          responseText.includes("Too Many Requests") ||
          responseText.includes("rate limit")
        ) {
          throw new Error("Yahoo Finance rate limit exceeded");
        }

        const data = JSON.parse(responseText);
        console.log(`${fxPair} raw data (proxy ${i + 1}):`, data);
        return data;
      } catch (error) {
        console.warn(`${fxPair} fetch failed with proxy ${i + 1}:`, error);
        if (i === this.proxies.length - 1) {
          console.warn(`${fxPair} fetch failed with all proxies`);
          return null;
        }
      }
    }
    return null;
  }

  // Fetch optimized FX data for min/max calculations using weekly or monthly intervals
  async fetchOptimizedFXData(fxPair, startDate, endDate) {
    const symbol = this.convertFXPairToSymbol(fxPair);
    const startTimestamp = Math.floor(startDate.getTime() / 1000);
    const endTimestamp = Math.floor(endDate.getTime() / 1000);

    // Calculate time span in days
    const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));

    // Choose optimal interval based on time span
    let interval = "1d";
    if (daysDiff > 365 * 5) { // More than 5 years
      interval = "1mo"; // Monthly data
    } else if (daysDiff > 365) { // More than 1 year
      interval = "1wk"; // Weekly data
    }

    const yahooUrl =
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${startTimestamp}&period2=${endTimestamp}&interval=${interval}`;

    console.log(
      `Fetching ${fxPair} optimized data from Yahoo Finance (${interval} interval for ${daysDiff} days)...`,
    );

    for (let i = 0; i < this.proxies.length; i++) {
      try {
        console.log(
          `Attempting ${fxPair} optimized fetch with proxy ${
            i + 1
          }/${this.proxies.length}...`,
        );
        const proxyUrl = this.proxies[i] + encodeURIComponent(yahooUrl);

        const response = await Promise.race([
          fetch(proxyUrl, { method: "GET" }),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error(`${fxPair} request timeout`)),
              8000,
            )
          ),
        ]);

        if (!response.ok) {
          throw new Error(
            `${fxPair} API request failed: ${response.status} ${response.statusText}`,
          );
        }

        const responseText = await response.text();
        if (
          responseText.includes("Too Many Requests") ||
          responseText.includes("rate limit")
        ) {
          throw new Error("Yahoo Finance rate limit exceeded");
        }

        const data = JSON.parse(responseText);
        console.log(`${fxPair} optimized data (proxy ${i + 1}):`, data);
        return data;
      } catch (error) {
        console.warn(
          `${fxPair} optimized fetch failed with proxy ${i + 1}:`,
          error,
        );
        if (i === this.proxies.length - 1) {
          console.warn(`${fxPair} optimized fetch failed with all proxies`);
          return null;
        }
      }
    }
    return null;
  }

  // Fetch comprehensive FX data for multiple time periods with true historical ranges
  async fetchComprehensiveFXData(fxPair) {
    const now = new Date();

    // Calculate periods for true historical ranges
    const oneYearAgo = new Date(
      now.getFullYear() - 1,
      now.getMonth(),
      now.getDate(),
    );
    const fiveYearsAgo = new Date(
      now.getFullYear() - 5,
      now.getMonth(),
      now.getDate(),
    );
    const tenYearsAgo = new Date(
      now.getFullYear() - 10,
      now.getMonth(),
      now.getDate(),
    );

    // Get maximum available historical data (up to 10 years or maximum available)
    const maxHistoricalData = await this.fetchOptimizedFXData(
      fxPair,
      tenYearsAgo,
      now,
    );

    if (!maxHistoricalData) {
      console.warn(`No historical data available for ${fxPair}`);
      return null;
    }

    // Process the full historical dataset
    const processedHistoricalData = await this.processFXData(
      maxHistoricalData,
      fxPair,
    );

    if (
      !processedHistoricalData || !processedHistoricalData.prices ||
      processedHistoricalData.prices.length === 0
    ) {
      console.warn(`No processed historical data available for ${fxPair}`);
      return null;
    }

    // Calculate ranges for different periods from the full dataset
    const results = {
      "1Y": this.calculatePeriodRange(processedHistoricalData, oneYearAgo, now),
      "5Y": this.calculatePeriodRange(
        processedHistoricalData,
        fiveYearsAgo,
        now,
      ),
      "10Y": this.calculatePeriodRange(
        processedHistoricalData,
        tenYearsAgo,
        now,
      ),
      "MAX": processedHistoricalData, // Full dataset for reference
    };

    console.log(`Calculated ranges for ${fxPair}:`, results);
    return results;
  }

  // Calculate min/max range for a specific time period from historical data
  calculatePeriodRange(historicalData, startDate, endDate) {
    if (!historicalData.prices || historicalData.prices.length === 0) {
      return null;
    }

    const startTimestamp = startDate.getTime();
    const endTimestamp = endDate.getTime();

    // Filter prices within the specified period
    const periodPrices = historicalData.prices.filter((price) => {
      return price.timestamp >= startTimestamp &&
        price.timestamp <= endTimestamp;
    });

    if (periodPrices.length === 0) {
      return null;
    }

    // Calculate min/max for this period using high/low prices
    const lows = periodPrices.map((p) => p.low).filter((low) =>
      low !== null && low !== undefined
    );
    const highs = periodPrices.map((p) => p.high).filter((high) =>
      high !== null && high !== undefined
    );

    const min = lows.length > 0 ? Math.min(...lows) : null;
    const max = highs.length > 0 ? Math.max(...highs) : null;

    // Find the actual dates for min/max
    const minPrice = periodPrices.find((p) => p.low === min);
    const maxPrice = periodPrices.find((p) => p.high === max);

    return {
      fxPair: historicalData.fxPair,
      description: `${historicalData.fxPair} Exchange Rate`,
      yahooUrl: historicalData.yahooUrl,
      min: min,
      max: max,
      minDate: minPrice ? new Date(minPrice.timestamp) : null,
      maxDate: maxPrice ? new Date(maxPrice.timestamp) : null,
      dataPoints: periodPrices.length,
      period: {
        start: startDate,
        end: endDate,
        days: Math.ceil(
          (endTimestamp - startTimestamp) / (1000 * 60 * 60 * 24),
        ),
      },
    };
  }

  // Process Yahoo Finance data for FX pairs
  async processFXData(yahooData, fxPair) {
    if (
      !yahooData.chart || !yahooData.chart.result || !yahooData.chart.result[0]
    ) {
      console.warn(`No data available for ${fxPair}`);
      return null;
    }

    const result = yahooData.chart.result[0];
    const timestamps = result.timestamp;
    const quotes = result.indicators.quote[0];
    const closes = quotes.close;
    const highs = quotes.high;
    const lows = quotes.low;
    const volumes = quotes.volume;

    const data = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] !== null && closes[i] !== undefined) {
        const date = new Date(timestamps[i] * 1000);
        data.push({
          date: date,
          close: closes[i],
          high: highs[i] || closes[i],
          low: lows[i] || closes[i],
          volume: volumes ? volumes[i] : null,
        });
      }
    }

    // Calculate min/max range
    const validData = data.filter((d) => d.high && d.low);
    const minRate = validData.length > 0
      ? Math.min(...validData.map((d) => d.low))
      : null;
    const maxRate = validData.length > 0
      ? Math.max(...validData.map((d) => d.high))
      : null;

    // Calculate additional statistics
    const validCloses = data.filter((d) =>
      d.close !== null && d.close !== undefined
    );
    const avgRate = validCloses.length > 0
      ? validCloses.reduce((sum, d) => sum + d.close, 0) / validCloses.length
      : null;
    const volatility = validCloses.length > 1
      ? this.calculateVolatility(validCloses.map((d) => d.close))
      : null;

    // Get proper currency description from Yahoo Finance
    const description = await this.getFXPairDescription(fxPair);

    return {
      fxPair: fxPair,
      description: description,
      yahooUrl: this.getYahooFinanceURL(fxPair),
      data: data,
      prices: data.map((d) => ({
        timestamp: d.date.getTime(),
        close: d.close,
        high: d.high,
        low: d.low,
      })),
      initialPrice: data.length > 0 ? data[0].close : null,
      currentPrice: data.length > 0 ? data[data.length - 1].close : null,
      minRate: minRate,
      maxRate: maxRate,
      avgRate: avgRate,
      volatility: volatility,
      dataPoints: data.length,
      dateRange: {
        start: data.length > 0 ? data[0].date : null,
        end: data.length > 0 ? data[data.length - 1].date : null,
      },
    };
  }

  // Calculate volatility (standard deviation of returns)
  calculateVolatility(prices) {
    if (prices.length < 2) return null;

    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      const return_ = (prices[i] - prices[i - 1]) / prices[i - 1];
      returns.push(return_);
    }

    const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const squaredDiffs = returns.map((r) => Math.pow(r - meanReturn, 2));
    const variance = squaredDiffs.reduce((sum, d) => sum + d, 0) /
      returns.length;
    const volatility = Math.sqrt(variance);

    return volatility * 100; // Return as percentage
  }
}

// Global Yahoo Finance API instance
const yahooAPI = new YahooFinanceAPI();

// Utility functions
function formatCurrency(value, decimals = 4) {
  if (value === null || value === undefined || isNaN(value)) {
    return "N/A";
  }
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function formatPercentage(value) {
  if (value === null || value === undefined || isNaN(value)) {
    return "N/A";
  }
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

async function loadHistoricalData(predictionDate, fxPair) {
  // Load the CSV file for this FX pair from centralized location
  const response = await fetch(`data/${fxPair}.csv`);
  if (!response.ok) {
    throw new Error(`Failed to load ${fxPair}.csv`);
  }

  const csvText = await response.text();
  const lines = csvText.split("\n").filter((line) => line.trim());

  // Skip header line
  const dataLines = lines.slice(1);

  // Parse CSV data
  const dailyData = [];
  for (const line of dataLines) {
    const [dateStr, rateStr] = line.split(",");
    if (dateStr && rateStr) {
      const date = new Date(dateStr);
      const rate = parseFloat(rateStr);
      if (!isNaN(rate)) {
        dailyData.push({ date, rate });
      }
    }
  }

  // Filter data to 12 months before prediction date
  const predictionDateObj = new Date(predictionDate);
  const twelveMonthsBefore = new Date(predictionDateObj);
  twelveMonthsBefore.setMonth(twelveMonthsBefore.getMonth() - 12);

  const filteredData = dailyData.filter((point) =>
    point.date >= twelveMonthsBefore && point.date <= predictionDateObj
  );

  // Calculate weekly averages
  const weeklyData = [];

  // Group data by weeks (Monday to Sunday)
  const weeklyGroups = {};

  for (const point of filteredData) {
    // Get the Monday of the week containing this date
    const dayOfWeek = point.date.getDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Sunday = 0, Monday = 1
    const monday = new Date(point.date);
    monday.setDate(monday.getDate() - daysToMonday);

    const weekKey = monday.toISOString().split("T")[0];

    if (!weeklyGroups[weekKey]) {
      weeklyGroups[weekKey] = [];
    }
    weeklyGroups[weekKey].push(point.rate);
  }

  // Calculate weekly averages and create chart data
  for (const [weekKey, rates] of Object.entries(weeklyGroups)) {
    if (rates.length > 0) {
      const averageRate = rates.reduce((sum, rate) => sum + rate, 0) /
        rates.length;
      const weekDate = new Date(weekKey);

      weeklyData.push({
        x: weekDate.getTime(),
        y: averageRate,
      });
    }
  }

  // Sort by date and return all filtered data (up to 52 weeks)
  weeklyData.sort((a, b) => a.x - b.x);
  return weeklyData;
}

async function loadActualData(predictionDate, fxPair) {
  // Load the CSV file for this FX pair from centralized location
  const response = await fetch(`data/${fxPair}.csv`);
  if (!response.ok) {
    throw new Error(`Failed to load ${fxPair}.csv`);
  }

  const csvText = await response.text();
  const lines = csvText.split("\n").filter((line) => line.trim());

  // Skip header line
  const dataLines = lines.slice(1);

  // Parse CSV data
  const dailyData = [];
  for (const line of dataLines) {
    const [dateStr, rateStr] = line.split(",");
    if (dateStr && rateStr) {
      const date = new Date(dateStr);
      const rate = parseFloat(rateStr);
      if (!isNaN(rate)) {
        dailyData.push({ date, rate });
      }
    }
  }

  // Filter data to extend past prediction date when available (up to 12 months after)
  const predictionDateObj = new Date(predictionDate);
  const twelveMonthsAfter = new Date(predictionDateObj);
  twelveMonthsAfter.setMonth(twelveMonthsAfter.getMonth() + 12);

  // Get all available data after prediction date, extending beyond 12 months if available
  const filteredData = dailyData.filter((point) =>
    point.date > predictionDateObj
  );

  // Return daily data directly for better visibility of the actual line extending
  const dailyChartData = filteredData.map((point) => ({
    x: point.date.getTime(),
    y: point.rate,
  }));

  // Sort by date and return all available actual data
  dailyChartData.sort((a, b) => a.x - b.x);
  return dailyChartData;
}

// Main FX Validator class
class GRQFXValidator {
  constructor() {
    this.predictionData = null;
    this.selectedFile = null;
    this.selectedPair = null;
    this.chart = null;

    this.initializeEventListeners();
    this.loadIndex();
  }

  initializeEventListeners() {
    // Prediction date selection
    const predictionFileSelect = document.getElementById(
      "predictionFileSelect",
    );
    if (predictionFileSelect) {
      predictionFileSelect.addEventListener("change", (e) => {
        this.selectedFile = e.target.value;
        if (this.selectedFile) {
          this.loadPredictionData();
        } else {
          this.hideFXPairs();
        }
      });
    }

    // Navigation button
    const backToSelection = document.getElementById("backToSelection");
    if (backToSelection) {
      backToSelection.addEventListener("click", () => {
        this.showFXPairs();
      });
    }
  }

  async loadIndex() {
    try {
      this.showLoading();
      const response = await fetch("index.json");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const indexData = await response.json();

      const select = document.getElementById("predictionFileSelect");
      if (!select) return;

      select.innerHTML =
        '<option value="">Choose a prediction date...</option>';

      // Sort entries by date (newest first)
      const sortedEntries = Object.entries(indexData.entries)
        .sort(([, a], [, b]) => {
          const dateA = a.date;
          const dateB = b.date;
          return new Date(dateB).getTime() - new Date(dateA).getTime();
        });

      for (const [key, entry] of sortedEntries) {
        const option = document.createElement("option");
        option.value = key;
        option.textContent = `${entry.date} - ${entry.description}`;
        select.appendChild(option);
      }

      // Auto-select the prediction date closest to 1 year ago
      this.autoSelectClosestDate(sortedEntries);

      this.hideLoading();
    } catch (error) {
      console.error("Error loading index:", error);
      this.showError("Failed to load prediction files index");
    }
  }

  autoSelectClosestDate(sortedEntries) {
    if (sortedEntries.length === 0) return;

    // const oneYearAgo = new Date();
    // oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const closestEntry = sortedEntries[0]; // Default to most recent
    // let closestDiff = Math.abs(
    //   new Date(sortedEntries[0][1].date).getTime() - oneYearAgo.getTime(),
    // );

    // for (const [key, entry] of sortedEntries) {
    //   const entryDate = new Date(entry.date);
    //   const diff = Math.abs(entryDate.getTime() - oneYearAgo.getTime());

    //   if (diff < closestDiff) {
    //     closestDiff = diff;
    //     closestEntry = [key, entry];
    //   }
    // }

    // Set the selected date
    const select = document.getElementById("predictionFileSelect");
    if (select) {
      select.value = closestEntry[0];
      this.selectedFile = closestEntry[0];
      this.loadPredictionData();
    }
  }

  async loadPredictionData() {
    if (!this.selectedFile) return;

    this.showLoading();

    try {
      const response = await fetch(`${this.selectedFile}/predictions.json`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      this.predictionData = await response.json();
      this.populateFXPairsList();
      this.showFXPairs();
      this.hideLoading();
    } catch (error) {
      console.error("Error loading prediction file:", error);
      this.showError("Failed to load prediction data");
    }
  }

  populateFXPairsList() {
    if (!this.predictionData) return;

    const container = document.getElementById("fxPairsList");
    if (!container) return;

    container.innerHTML = "";

    // Sort pairs alphabetically
    const sortedPairs = this.predictionData.results.sort((a, b) =>
      a.pair.localeCompare(b.pair)
    );

    for (const pair of sortedPairs) {
      const col = document.createElement("div");
      col.className = "col-md-6 col-lg-4 mb-3";

      // Calculate summary statistics with defensive programming
      const monthlyChange = pair.predictions[0]?.predictedChangePercent ?? null;
      const quarterlyChange = pair.predictions[1]?.predictedChangePercent ?? null;
      const halfYearChange = pair.predictions[2]?.predictedChangePercent ?? null;
      const threeQuarterChange = pair.predictions[3]?.predictedChangePercent ?? null;
      const yearlyChange = pair.predictions[4]?.predictedChangePercent ?? null;

      // Calculate best fit slope (linear regression)
      const slope = this.calculateBestFitSlope(pair.predictions);





      col.innerHTML = `
        <div class="fx-pair-card" onclick="fxValidator.selectFXPair('${pair.pair}')">
          <div class="d-flex justify-content-between align-items-start mb-2">
            <h5 class="mb-0">${pair.pair}</h5>
            <span class="badge bg-primary">${
        formatCurrency(pair.currentRate)
      }</span>
          </div>
          <div class="prediction-summary">
            <div class="row">
              <div class="col-6">
                <small>Month (30d):</small><br>
                <span class="prediction-change ${
        monthlyChange !== null && monthlyChange >= 0 ? "positive" : "negative"
      }">
                  ${formatPercentage(monthlyChange)}
                </span>
              </div>
              <div class="col-6">
                <small>Quarter (90d):</small><br>
                <span class="prediction-change ${
        quarterlyChange !== null && quarterlyChange >= 0 ? "positive" : "negative"
      }">
                  ${formatPercentage(quarterlyChange)}
                </span>
              </div>
            </div>
            <div class="row mt-1">
              <div class="col-6">
                <small>Half Year (180d):</small><br>
                <span class="prediction-change ${
        halfYearChange !== null && halfYearChange >= 0 ? "positive" : "negative"
      }">
                  ${formatPercentage(halfYearChange)}
                </span>
              </div>
              <div class="col-6">
                <small>3/4 Year (270d):</small><br>
                <span class="prediction-change ${
        threeQuarterChange !== null && threeQuarterChange >= 0 ? "positive" : "negative"
      }">
                  ${formatPercentage(threeQuarterChange)}
                </span>
              </div>
            </div>
            <div class="row mt-1">
              <div class="col-6">
                <small>Year (365d):</small><br>
                <span class="prediction-change ${
        yearlyChange !== null && yearlyChange >= 0 ? "positive" : "negative"
      }">
                  ${formatPercentage(yearlyChange)}
                </span>
              </div>
              <div class="col-6">
                <small>Slope (per month):</small><br>
                <span class="prediction-change ${
        slope !== null && slope >= 0 ? "positive" : "negative"
      }">
                  ${slope !== null ? `${slope >= 0 ? '+' : ''}${slope.toFixed(2)}%` : 'N/A'}
                </span>
              </div>
            </div>
          </div>
        </div>
      `;

      container.appendChild(col);
    }
  }

  async selectFXPair(pairName) {
    this.selectedPair = pairName;
    await this.showChartView();
  }

  showFXPairs() {
    document.getElementById("fxPairsContainer").style.display = "block";
    document.getElementById("chartView").style.display = "none";
  }

  hideFXPairs() {
    document.getElementById("fxPairsContainer").style.display = "none";
    document.getElementById("chartView").style.display = "none";
  }

  async showChartView() {
    document.getElementById("fxPairsContainer").style.display = "none";
    document.getElementById("chartView").style.display = "block";

    await this.updateChartView();
  }

  async updateChartView() {
    if (!this.predictionData || !this.selectedPair) return;

    const pair = this.predictionData.results.find((p) =>
      p.pair === this.selectedPair
    );
    if (!pair) return;

    // Update display info
    const dateDisplay = document.getElementById("predictionDateDisplay");
    const pairDisplay = document.getElementById("fxPairDisplay");
    const chartTitle = document.getElementById("chartTitle");

    if (dateDisplay) {
      const date = new Date(this.predictionData.date);
      dateDisplay.textContent = date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    }

    if (pairDisplay) {
      pairDisplay.textContent = `${pair.pair} (${
        formatCurrency(pair.currentRate)
      })`;
    }

    if (chartTitle) {
      chartTitle.textContent = `${pair.pair} Rate Analysis`;
    }

    await this.updateChart(pair);
  }

  async updateChart(pair) {
    if (this.chart) {
      this.chart.destroy();
    }

    const canvas = document.getElementById("fxChart");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Load actual historical data from CSV
    let weeklyData;
    try {
      weeklyData = await loadHistoricalData(
        this.predictionData.date,
        pair.pair,
      );
    } catch (error) {
      console.error(`Error loading historical data for ${pair.pair}:`, error);
      this.showError(
        `No historical data available for ${pair.pair}. CSV file may be missing.`,
      );
      return;
    }

    // Load actual data for prediction period (if available)
    let actualData = [];
    try {
      actualData = await loadActualData(this.predictionData.date, pair.pair);
    } catch (_error) {
      console.log(
        `No actual data available for ${pair.pair} prediction period yet`,
      );
    }

    // Create prediction line data (smooth curve through prediction points)
    const predictionLineData = [];
    const predictionDate = new Date(this.predictionData.date);

    // Add current rate at prediction date
    predictionLineData.push({
      x: predictionDate.getTime(),
      y: pair.currentRate,
    });

    // Add all prediction points
    pair.predictions.forEach((prediction) => {
      const date = new Date(predictionDate.getTime() + (prediction.days * 24 * 60 * 60 * 1000));
      
      
      predictionLineData.push({
        x: date.getTime(),
        y: prediction.predictedRate,
      });
    });

    const datasets = [
      {
        label: "Historical Weekly Averages",
        data: weeklyData,
        borderColor: "#6c757d",
        backgroundColor: "rgba(108, 117, 125, 0.1)",
        borderWidth: 2,
        pointRadius: 0,
        fill: false,
        tension: 0.1,
      },
    ];

    // Always show the original predictions
    datasets.push({
      label: "Original Predictions",
      data: predictionLineData,
      borderColor: "#667eea",
      backgroundColor: "rgba(102, 126, 234, 0.1)",
      borderWidth: 3,
      borderDash: [5, 5],
      pointRadius: 0,
      fill: false,
      tension: 0.4,
    });

    // Add actual data if available (for comparison)
    if (actualData.length > 0) {
      datasets.push({
        label: "Actual Daily Rates",
        data: actualData,
        borderColor: "#28a745",
        backgroundColor: "rgba(40, 167, 69, 0.1)",
        borderWidth: 2,
        pointRadius: 0,
        fill: false,
        tension: 0.1,
      });
    }

    // Add prediction date marker
    datasets.push({
      label: "Prediction Date",
      data: [{
        x: predictionDate.getTime(),
        y: pair.currentRate,
      }],
      borderColor: "#dc3545",
      backgroundColor: "#dc3545",
      borderWidth: 0,
      pointRadius: 10,
      pointStyle: "rectRot",
      fill: false,
    });

    // Add prediction points with different colors
    const predictionColors = [
      "#ff6b6b",
      "#4ecdc4",
      "#45b7d1",
      "#96ceb4",
      "#feca57",
    ];
    const predictionLabels = [
      "Monthly (30d)",
      "Quarterly (90d)",
      "Half-Year (180d)",
      "3-Quarters (270d)",
      "Full-Year (365d)",
    ];

    // Collect prediction points for best fit line calculation
    const predictionPoints = [];
    
    pair.predictions.forEach((prediction, index) => {
      const date = new Date(predictionDate.getTime() + (prediction.days * 24 * 60 * 60 * 1000));
      const point = {
        x: date.getTime(),
        y: prediction.predictedRate,
      };
      
      predictionPoints.push(point);

      datasets.push({
        label: predictionLabels[index],
        data: [point],
        type: "scatter",
        borderColor: predictionColors[index],
        backgroundColor: predictionColors[index],
        borderWidth: 3,
        pointRadius: 15,
        pointHoverRadius: 20,
        pointStyle: "star",
        fill: false,
        tension: 0,
        showLine: false,
      });
    });

    // Add best fit line anchored at current rate through prediction points
    if (predictionPoints.length > 0) {
      // Calculate slope from current rate to prediction points
      // Using least squares with fixed intercept (current rate)
      const startTime = predictionDate.getTime();
      const startRate = pair.currentRate;
      
      // Calculate slope that minimizes distance to prediction points
      // when line is anchored at (startTime, startRate)
      let numerator = 0;
      let denominator = 0;
      
      predictionPoints.forEach(point => {
        const timeDiff = point.x - startTime;
        const rateDiff = point.y - startRate;
        numerator += timeDiff * rateDiff;
        denominator += timeDiff * timeDiff;
      });
      
      const slope = denominator !== 0 ? numerator / denominator : 0;
      
      // Create best fit line from start to end of prediction range
      const endTime = predictionPoints[predictionPoints.length - 1].x;
      const endRate = startRate + slope * (endTime - startTime);
      
      const bestFitLine = [
        {
          x: startTime,
          y: startRate
        },
        {
          x: endTime,
          y: endRate
        }
      ];
      
      datasets.push({
        label: "Best Fit Trend",
        data: bestFitLine,
        type: "line",
        borderColor: "#666666",
        backgroundColor: "transparent",
        borderWidth: 2,
        borderDash: [5, 5], // Dashed line
        pointRadius: 0,
        pointHoverRadius: 0,
        fill: false,
        tension: 0,
        showLine: true,
      });
    }

    if (typeof Chart !== "undefined") {
      
      this.chart = new Chart(ctx, {
        type: "line",
        data: { datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            title: {
              display: true,
              text: (() => {
                const predictionDate = new Date(this.predictionData.date);
                const twelveMonthsLater = new Date(predictionDate);
                twelveMonthsLater.setMonth(twelveMonthsLater.getMonth() + 12);
                
                let title = `${pair.pair} Rate Analysis - 12M Historical + `;
                
                if (actualData.length > 0) {
                  const lastActualDate = new Date(Math.max(...actualData.map(d => d.x)));
                  const actualMonths = Math.ceil((lastActualDate - predictionDate) / (1000 * 60 * 60 * 24 * 30));
                  const remainingMonths = Math.max(0, 12 - actualMonths);
                  title += `${actualMonths}M Actual + ${remainingMonths}M Predicted`;
                } else {
                  title += "12M Predicted";
                }
                
                return title;
              })(),
              font: {
                size: 16,
              },
            },
            legend: {
              display: true,
              position: "top",
            },
            tooltip: {
              callbacks: {
                title: function (context) {
                  const date = new Date(context[0].parsed.x);
                  return date.toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    timeZone: "UTC"
                  });
                },
                label: function (context) {
                  return `${context.dataset.label}: ${
                    formatCurrency(context.parsed.y)
                  }`;
                },
              },
            },
          },
          scales: {
            x: {
              type: "time",
              time: {
                unit: "month",
                displayFormats: {
                  month: "MMM yyyy",
                },
                timezone: "UTC", // Force UTC timezone
              },
              title: {
                display: true,
                text: "Date",
              },
              min: (() => {
                // Show 12 months before prediction date
                const predictionDate = new Date(this.predictionData.date);
                const twelveMonthsAgo = new Date(predictionDate);
                twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
                console.log("Chart X-axis min:", {
                  predictionDate: predictionDate.toISOString(),
                  twelveMonthsAgo: twelveMonthsAgo.toISOString(),
                  timestamp: twelveMonthsAgo.getTime()
                });
                return twelveMonthsAgo.getTime();
              })(),
              max: (() => {
                // Show 12 months after prediction date, but ensure we include the Full-Year prediction
                const predictionDate = new Date(this.predictionData.date);
                const twelveMonthsLater = new Date(predictionDate);
                twelveMonthsLater.setMonth(twelveMonthsLater.getMonth() + 12);
                
                // Also check if we need to extend to include the Full-Year prediction (365 days)
                const fullYearLater = new Date(predictionDate.getTime() + (365 * 24 * 60 * 60 * 1000));
                
                // Use the later of the two dates, plus a small buffer to ensure the point is not at the edge
                const maxDate = Math.max(twelveMonthsLater.getTime(), fullYearLater.getTime()) + (7 * 24 * 60 * 60 * 1000); // Add 7 days buffer
                
                return maxDate;
              })(),
            },
            y: {
              title: {
                display: true,
                text: "FX Rate",
              },
            },
          },
          interaction: {
            intersect: false,
            mode: "nearest",
          },
        },
      });
    }

    // Load Yahoo Finance data for validation
    this.loadYahooFinanceData(pair);
  }

  async loadFullCSVData(fxPair) {
    // Load the complete CSV file from docs/data directory
    const response = await fetch(`data/${fxPair}.csv`);
    if (!response.ok) {
      throw new Error(`Failed to load ${fxPair}.csv from data directory`);
    }

    const csvText = await response.text();
    const lines = csvText.split("\n").filter((line) => line.trim());

    // Skip header line
    const dataLines = lines.slice(1);

    // Parse CSV data
    const csvData = [];
    for (const line of dataLines) {
      const [dateStr, rateStr] = line.split(",");
      if (dateStr && rateStr) {
        const date = new Date(dateStr);
        const rate = parseFloat(rateStr);
        if (!isNaN(rate)) {
          csvData.push({ date, rate });
        }
      }
    }

    // Sort by date
    csvData.sort((a, b) => a.date.getTime() - b.date.getTime());

    return csvData;
  }

  async loadYahooFinanceData(pair) {
    // Show loading state
    this.showElement("yahooDataLoading");
    this.hideElement("yahooDataContent");
    this.hideElement("yahooDataError");

    try {
      // First validate if the FX pair exists on Yahoo Finance
      const isValid = await yahooAPI.validateFXPair(pair.pair);

      if (!isValid) {
        this.showYahooFinanceError(
          `FX pair ${pair.pair} is not available on Yahoo Finance`,
        );
        return;
      }

      // Fetch comprehensive Yahoo Finance data for multiple time periods
      const comprehensiveData = await yahooAPI.fetchComprehensiveFXData(
        pair.pair,
      );

      if (comprehensiveData && Object.keys(comprehensiveData).length > 0) {
        // Use MAX data (full processed data) for display and chart
        const fullData = comprehensiveData["MAX"];
        await this.displayYahooFinanceData(fullData, pair, comprehensiveData);

        // Add Yahoo Finance data to chart if available
        this.addYahooFinanceToChart(comprehensiveData);
      } else {
        this.showYahooFinanceError("No valid data received from Yahoo Finance");
      }
    } catch (error) {
      console.error("Error loading Yahoo Finance data:", error);
      this.showYahooFinanceError(
        "Error loading Yahoo Finance data: " + error.message,
      );
    }
  }

  async displayYahooFinanceData(yahooData, pair, comprehensiveData = null) {
    // Hide loading, show content
    this.hideElement("yahooDataLoading");
    this.showElement("yahooDataContent");

    // Update FX pair description and link
    document.getElementById("yahooFXPairDescription").textContent =
      yahooData.description;
    const yahooLink = document.getElementById("yahooFinanceLink");
    yahooLink.href = yahooData.yahooUrl;

    // Update current data summary
    document.getElementById("yahooCurrentRate").textContent = formatCurrency(
      yahooData.currentPrice,
    );
    document.getElementById("yahooAvgRate").textContent = formatCurrency(
      yahooData.avgRate,
    );
    document.getElementById("yahooVolatility").textContent =
      yahooData.volatility ? `${yahooData.volatility.toFixed(2)}%` : "N/A";
    document.getElementById("yahooDataPoints").textContent =
      yahooData.dataPoints;

    // Update date range
    if (yahooData.dateRange.start && yahooData.dateRange.end) {
      const startDate = yahooData.dateRange.start.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
      const endDate = yahooData.dateRange.end.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
      document.getElementById("yahooDateRange").textContent =
        `${startDate} - ${endDate}`;
    } else {
      document.getElementById("yahooDateRange").textContent = "N/A";
    }

    // Update historical ranges
    if (comprehensiveData) {
      this.updateHistoricalRanges(comprehensiveData);
    }

    // Validate data against CSV data
    await this.validateDataAgainstYahoo(yahooData, pair, comprehensiveData);
  }

  updateHistoricalRanges(comprehensiveData) {
    const periods = ["1Y", "5Y", "10Y"];

    periods.forEach((period) => {
      const elementId = `yahoo${period}Range`;
      const element = document.getElementById(elementId);

      if (comprehensiveData[period]) {
        const data = comprehensiveData[period];
        const minRate = formatCurrency(data.min);
        const maxRate = formatCurrency(data.max);

        // Format dates for min/max
        const minDate = data.minDate
          ? data.minDate.toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
          })
          : "N/A";
        const maxDate = data.maxDate
          ? data.maxDate.toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
          })
          : "N/A";

        // Add range logic validation
        let rangeLogicHTML = "";
        
        if (period === "1Y" && comprehensiveData["5Y"]) {
          const fiveYear = comprehensiveData["5Y"];
          const oneYearInFiveYear = data.min >= fiveYear.min && data.max <= fiveYear.max;
          
          if (oneYearInFiveYear) {
            rangeLogicHTML = '<small class="text-success"><i class="fas fa-check-circle me-1"></i>Within 5Y range ✓</small>';
          } else {
            rangeLogicHTML = '<small class="text-danger"><i class="fas fa-exclamation-triangle me-1"></i>Outside 5Y range</small>';
          }
        } else if (period === "5Y" && comprehensiveData["10Y"]) {
          const tenYear = comprehensiveData["10Y"];
          const fiveYearInTenYear = data.min >= tenYear.min && data.max <= tenYear.max;
          
          if (fiveYearInTenYear) {
            rangeLogicHTML = '<small class="text-success"><i class="fas fa-check-circle me-1"></i>Within 10Y range ✓</small>';
          } else {
            rangeLogicHTML = '<small class="text-danger"><i class="fas fa-exclamation-triangle me-1"></i>Outside 10Y range</small>';
          }
        }

        element.innerHTML = `
          <div><strong>Range:</strong> ${minRate} - ${maxRate}</div>
          <div><small>Min: ${minDate} | Max: ${maxDate}</small> ${rangeLogicHTML}</div>
        `;
      } else {
        element.textContent = "N/A";
      }
    });
  }

  async validateDataAgainstYahoo(yahooData, pair, comprehensiveData = null) {
    const validationResults = document.getElementById("yahooValidationResults");
    let validationHTML = "";

    // Compare current rates
    const csvCurrentRate = pair.currentRate;
    const yahooCurrentRate = yahooData.currentPrice;
    const rateDifference = Math.abs(csvCurrentRate - yahooCurrentRate);
    const rateDifferencePercent = (rateDifference / csvCurrentRate) * 100;

    if (rateDifferencePercent < 1) {
      validationHTML += `
        <div class="alert alert-success">
          <small>
            <i class="fas fa-check-circle me-1"></i>
            Current rates match well (difference: ${
        formatCurrency(rateDifference)
      } / ${rateDifferencePercent.toFixed(2)}%)
          </small>
        </div>
      `;
    } else if (rateDifferencePercent < 5) {
      validationHTML += `
        <div class="alert alert-warning">
          <small>
            <i class="fas fa-exclamation-triangle me-1"></i>
            Current rates differ by ${formatCurrency(rateDifference)} (${
        rateDifferencePercent.toFixed(2)
      }%)
          </small>
        </div>
      `;
    } else {
      validationHTML += `
        <div class="alert alert-danger">
          <small>
            <i class="fas fa-times-circle me-1"></i>
            Large rate difference: ${formatCurrency(rateDifference)} (${
        rateDifferencePercent.toFixed(2)
      }%)
          </small>
        </div>
      `;
    }

    // Validate historical ranges if comprehensive data is available
    if (comprehensiveData) {
      validationHTML += await this.validateHistoricalRanges(comprehensiveData);
    }

    // Calculate data coverage first
    const daysCovered = yahooData.dateRange.start && yahooData.dateRange.end
      ? Math.ceil(
        (yahooData.dateRange.end - yahooData.dateRange.start) /
          (1000 * 60 * 60 * 24),
      )
      : 0;

    // Add comprehensive validation info
    if (comprehensiveData && comprehensiveData["1Y"]) {
      const oneYearData = comprehensiveData["1Y"];
      validationHTML += `
        <div class="alert alert-info">
          <small>
            <i class="fas fa-info-circle me-1"></i>
            <strong>Yahoo Finance Statistics:</strong><br>
            • 1Y Range: ${formatCurrency(oneYearData.min)} - ${
        formatCurrency(oneYearData.max)
      }<br>
            • Average Rate: ${formatCurrency(yahooData.avgRate)}<br>
            • Volatility: ${
        yahooData.volatility ? `${yahooData.volatility.toFixed(2)}%` : "N/A"
      }<br>
            • Data Coverage: ${daysCovered} days (${
        Math.round(daysCovered / 365)
      } years)
          </small>
        </div>
      `;
    } else {
      validationHTML += `
        <div class="alert alert-info">
          <small>
            <i class="fas fa-info-circle me-1"></i>
            <strong>Yahoo Finance Statistics:</strong><br>
            • Average Rate: ${formatCurrency(yahooData.avgRate)}<br>
            • Volatility: ${
        yahooData.volatility ? `${yahooData.volatility.toFixed(2)}%` : "N/A"
      }<br>
            • Data Coverage: ${daysCovered} days (${
        Math.round(daysCovered / 365)
      } years)
          </small>
        </div>
      `;
    }

    // Add data quality assessment based on time coverage

    if (daysCovered >= 365) {
      validationHTML += `
        <div class="alert alert-success">
          <small>
            <i class="fas fa-check-circle me-1"></i>
            High-quality data: ${daysCovered} days of coverage (${
        Math.round(daysCovered / 365)
      } years)
          </small>
        </div>
      `;
    } else if (daysCovered >= 180) {
      validationHTML += `
        <div class="alert alert-warning">
          <small>
            <i class="fas fa-exclamation-triangle me-1"></i>
            Moderate data quality: ${daysCovered} days of coverage (${
        Math.round(daysCovered / 30)
      } months)
          </small>
        </div>
      `;
    } else {
      validationHTML += `
        <div class="alert alert-danger">
          <small>
            <i class="fas fa-times-circle me-1"></i>
            Limited data quality: Only ${daysCovered} days of coverage
          </small>
        </div>
      `;
    }

    validationResults.innerHTML = validationHTML;
  }

  async validateHistoricalRanges(comprehensiveData) {
    let validationHTML =
      '<div class="mt-3"><h6>Historical Range Validation:</h6>';

    // Load full 10-year CSV data for comprehensive validation
    let csvData = null;
    try {
      csvData = await this.loadFullCSVData(this.selectedPair);
    } catch (error) {
      console.error("Error loading full CSV data for validation:", error);
      validationHTML += `
        <div class="alert alert-warning">
          <small>
            <i class="fas fa-exclamation-triangle me-1"></i>
            Could not load full CSV data for validation: ${error.message}
          </small>
        </div>
      `;
      validationHTML += "</div>";
      return validationHTML;
    }

    if (!csvData || csvData.length === 0) {
      validationHTML += `
        <div class="alert alert-warning">
          <small>
            <i class="fas fa-exclamation-triangle me-1"></i>
            No CSV data available for validation
          </small>
        </div>
      `;
      validationHTML += "</div>";
      return validationHTML;
    }

    // Calculate your CSV data's 10-year min/max
    const csvPrices = csvData.map((point) => point.rate).filter((price) =>
      price !== null && !isNaN(price)
    );
    if (csvPrices.length === 0) {
      validationHTML += `
        <div class="alert alert-warning">
          <small>
            <i class="fas fa-exclamation-triangle me-1"></i>
            No valid price data in CSV for validation
          </small>
        </div>
      `;
      validationHTML += "</div>";
      return validationHTML;
    }

    const csvMin = Math.min(...csvPrices);
    const csvMax = Math.max(...csvPrices);
    const csvDataPoints = csvPrices.length;

    // Format dates to UTC date strings (YYYY-MM-DD)
    const startDate = csvData[0].date.toISOString().split("T")[0];
    const endDate =
      csvData[csvData.length - 1].date.toISOString().split("T")[0];
    const csvDateRange = `${startDate} to ${endDate}`;

    validationHTML += `
      <div class="alert alert-info">
        <small>
          <strong>Your CSV Data (${csvDataPoints} points):</strong><br>
          • Range: ${formatCurrency(csvMin)} - ${formatCurrency(csvMax)}<br>
          • Period: ${csvDateRange}
        </small>
      </div>
    `;

    // Compare with Yahoo Finance 10-year range
    if (comprehensiveData && comprehensiveData["10Y"]) {
      const yahoo10Y = comprehensiveData["10Y"];
      const yahooMin = yahoo10Y.min;
      const yahooMax = yahoo10Y.max;

      // Calculate tolerance (0.5% of the range)
      const range = yahooMax - yahooMin;
      const tolerance = range * 0.005; // 0.5% tolerance

      // Check if your data is within Yahoo's range with tolerance
      const csvMinInRange = csvMin >= (yahooMin - tolerance) &&
        csvMin <= (yahooMax + tolerance);
      const csvMaxInRange = csvMax >= (yahooMin - tolerance) &&
        csvMax <= (yahooMax + tolerance);

      let alertClass = "alert-success";
      let icon = "fas fa-check-circle";
      let message = "✅ Data consistency check passed";
      let details =
        "Your CSV data range is consistent with Yahoo Finance 10-year range";

      if (!csvMinInRange || !csvMaxInRange) {
        alertClass = "alert-danger";
        icon = "fas fa-exclamation-triangle";
        message = "🚨 DATA FEED BUG DETECTED!";
        details =
          "Your CSV data range is inconsistent with Yahoo Finance 10-year range. This may indicate a data feed issue.";
      }

      validationHTML += `
        <div class="alert ${alertClass}">
          <small>
            <i class="${icon} me-1"></i>
            <strong>10-Year Range Validation:</strong> ${message}<br>
            <small>${details}</small><br>
            <small>Yahoo Finance: ${formatCurrency(yahooMin)} - ${
        formatCurrency(yahooMax)
      }</small><br>
            <small>Your CSV: ${formatCurrency(csvMin)} - ${
        formatCurrency(csvMax)
      }</small>
          </small>
        </div>
      `;

      // Add detailed comparison
      const csvMinDiff = Math.abs(csvMin - yahooMin);
      const csvMaxDiff = Math.abs(csvMax - yahooMax);
      const csvMinDiffPercent = (csvMinDiff / yahooMin) * 100;
      const csvMaxDiffPercent = (csvMaxDiff / yahooMax) * 100;

      validationHTML += `
        <div class="alert alert-secondary">
          <small>
            <strong>Detailed Comparison:</strong><br>
            • Min difference: ${formatCurrency(csvMinDiff)} (${
        csvMinDiffPercent.toFixed(2)
      }%)<br>
            • Max difference: ${formatCurrency(csvMaxDiff)} (${
        csvMaxDiffPercent.toFixed(2)
      }%)<br>
            • Tolerance: ${formatCurrency(tolerance)} (0.5% of Yahoo range)
          </small>
        </div>
      `;
    } else {
      validationHTML += `
        <div class="alert alert-warning">
          <small>
            <i class="fas fa-exclamation-triangle me-1"></i>
            Yahoo Finance 10-year data not available for comparison
          </small>
        </div>
      `;
    }

    // Also validate against 5-year and 1-year if available
    const periods = ["5Y", "1Y"];
    periods.forEach((period) => {
      if (comprehensiveData && comprehensiveData[period]) {
        const yahooData = comprehensiveData[period];
        const yahooMin = yahooData.min;
        const yahooMax = yahooData.max;

        // Check if your data overlaps with Yahoo's range
        const hasOverlap = !(csvMax < yahooMin || csvMin > yahooMax);

        if (hasOverlap) {
          validationHTML += `
            <div class="alert alert-success">
              <small>
                <i class="fas fa-check-circle me-1"></i>
                <strong>${period} Range:</strong> Data ranges overlap with Yahoo Finance<br>
                <small>Yahoo: ${formatCurrency(yahooMin)} - ${
            formatCurrency(yahooMax)
          }</small>
              </small>
            </div>
          `;
        } else {
          validationHTML += `
            <div class="alert alert-warning">
              <small>
                <i class="fas fa-exclamation-triangle me-1"></i>
                <strong>${period} Range:</strong> No overlap with Yahoo Finance range<br>
                <small>Yahoo: ${formatCurrency(yahooMin)} - ${
            formatCurrency(yahooMax)
          }</small>
              </small>
            </div>
          `;
        }
      }
    });

    validationHTML += "</div>";

    // Update the consistency status indicator
    this.updateConsistencyStatus(
      comprehensiveData && comprehensiveData["10Y"],
      csvMin,
      csvMax,
      comprehensiveData ? comprehensiveData["10Y"] : null,
    );

    return validationHTML;
  }

  updateConsistencyStatus(hasYahooData, csvMin, csvMax, yahoo10Y) {
    const statusElement = document.getElementById("dataConsistencyStatus");
    const iconElement = document.getElementById("consistencyIcon");
    const textElement = document.getElementById("consistencyText");

    if (!statusElement || !iconElement || !textElement) return;

    if (!hasYahooData) {
      statusElement.style.display = "none";
      return;
    }

    // Calculate tolerance (0.5% of the range)
    const range = yahoo10Y.max - yahoo10Y.min;
    const tolerance = range * 0.005; // 0.5% tolerance

    // Check if your data is within Yahoo's range with tolerance
    const csvMinInRange = csvMin >= (yahoo10Y.min - tolerance) &&
      csvMin <= (yahoo10Y.max + tolerance);
    const csvMaxInRange = csvMax >= (yahoo10Y.min - tolerance) &&
      csvMax <= (yahoo10Y.max + tolerance);

    if (csvMinInRange && csvMaxInRange) {
      // Data is consistent
      iconElement.textContent = "✅";
      textElement.textContent = "Data consistency check passed";
      statusElement.style.display = "block";
    } else {
      // Data is inconsistent - potential data feed bug
      iconElement.textContent = "🚨";
      textElement.textContent = "DATA FEED BUG DETECTED!";
      statusElement.style.display = "block";
    }
  }

  addYahooFinanceToChart(comprehensiveData = null) {
    if (!this.chart) return;

    // Only add historical range lines, not daily data
    if (comprehensiveData) {
      this.addHistoricalRangeLines(comprehensiveData);
    }

    this.chart.update();
  }



  addHistoricalRangeLines(comprehensiveData) {
    if (!this.chart) return;

    const periods = [
      { name: "1Y", color: "#dc3545", dash: [3, 3] },
      { name: "5Y", color: "#fd7e14", dash: [5, 5] },
      { name: "10Y", color: "#6f42c1", dash: [7, 7] },
    ];

    // Calculate the full prediction period range (12 months before to 12 months after prediction date)
    const predictionDate = new Date(this.predictionData.date);
    const twelveMonthsBefore = new Date(predictionDate);
    twelveMonthsBefore.setMonth(twelveMonthsBefore.getMonth() - 12);
    const twelveMonthsAfter = new Date(predictionDate);
    twelveMonthsAfter.setMonth(twelveMonthsAfter.getMonth() + 12);
    
    // Use the minimum of today's date or 12 months after prediction date
    const today = new Date();
    const maxDate = new Date(Math.min(today.getTime(), twelveMonthsAfter.getTime()));

    const minX = twelveMonthsBefore.getTime();
    const maxX = maxDate.getTime();

    periods.forEach((period) => {
      if (comprehensiveData[period.name]) {
        const data = comprehensiveData[period.name];

        // Create horizontal lines for min and max extending to full data range
        const minLineData = [
          { x: minX, y: data.min },
          { x: maxX, y: data.min },
        ];

        const maxLineData = [
          { x: minX, y: data.max },
          { x: maxX, y: data.max },
        ];

        // Add min line
        this.chart.data.datasets.push({
          label: `Yahoo ${period.name} Min`,
          data: minLineData,
          borderColor: period.color,
          backgroundColor: "transparent",
          borderWidth: 2,
          borderDash: period.dash,
          pointRadius: 0,
          fill: false,
        });

        // Add max line
        this.chart.data.datasets.push({
          label: `Yahoo ${period.name} Max`,
          data: maxLineData,
          borderColor: period.color,
          backgroundColor: "transparent",
          borderWidth: 2,
          borderDash: period.dash,
          pointRadius: 0,
          fill: false,
        });
      }
    });

    // Add average rate line if we have 1Y data
    if (comprehensiveData["1Y"]) {
      const oneYearData = comprehensiveData["1Y"];
      const avgRate = oneYearData.avgRate || comprehensiveData["MAX"]?.avgRate;

      if (avgRate) {
        // Create horizontal line for average rate extending to full data range
        const avgLineData = [
          { x: minX, y: avgRate },
          { x: maxX, y: avgRate },
        ];

        this.chart.data.datasets.push({
          label: "Yahoo Average Rate",
          data: avgLineData,
          borderColor: "#20c997",
          backgroundColor: "transparent",
          borderWidth: 2,
          borderDash: [2, 2],
          pointRadius: 0,
          fill: false,
        });
      }
    }
  }

  showYahooFinanceError(message) {
    this.hideElement("yahooDataLoading");
    this.hideElement("yahooDataContent");
    this.showElement("yahooDataError");

    const errorElement = document.getElementById("yahooDataError");
    if (errorElement) {
      errorElement.innerHTML = `
        <small>
          <i class="fas fa-exclamation-triangle me-1"></i>
          ${message}
        </small>
      `;
    }
  }

  showLoading() {
    this.showElement("loading");
    this.hideElement("error");
  }

  hideLoading() {
    this.hideElement("loading");
  }

  showError(message) {
    const errorElement = document.getElementById("error");
    if (errorElement) {
      errorElement.textContent = message;
      errorElement.style.display = "block";
    }
    this.hideElement("loading");
  }

  showElement(id) {
    const element = document.getElementById(id);
    if (element) {
      element.style.display = "block";
    }
  }

  hideElement(id) {
    const element = document.getElementById(id);
    if (element) {
      element.style.display = "none";
    }
  }

  // Calculate average monthly change rate
  calculateBestFitSlope(predictions) {
    if (!predictions || predictions.length < 2) return null;

    // Filter out null values
    const validPredictions = predictions.filter(p => 
      p.predictedChangePercent !== null && 
      p.predictedChangePercent !== undefined && 
      !isNaN(p.predictedChangePercent)
    );

    if (validPredictions.length < 2) return null;

    // Calculate the average monthly change rate
    // This gives a more intuitive measure of the overall trend
    const totalChange = validPredictions[validPredictions.length - 1].predictedChangePercent - validPredictions[0].predictedChangePercent;
    const totalMonths = (validPredictions[validPredictions.length - 1].days - validPredictions[0].days) / 30;
    
    if (totalMonths === 0) return null;
    
    const averageMonthlyChange = totalChange / totalMonths;
    
    return averageMonthlyChange;
  }
}

// Initialize the FX validator when the page loads
// fxValidator is used in HTML onclick handlers
// deno-lint-ignore no-unused-vars
let fxValidator;
document.addEventListener("DOMContentLoaded", () => {
  fxValidator = new GRQFXValidator();
});
