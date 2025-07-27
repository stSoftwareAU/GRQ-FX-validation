// Version constant - this will be updated by the git hook
const VERSION = "1.0.4";

// Set page title with version
document.title = `GRQ FX Validation Dashboard v${VERSION}`;

// Set version display
document.addEventListener('DOMContentLoaded', () => {
  const versionElement = document.getElementById('version');
  if (versionElement) {
    versionElement.textContent = VERSION;
  }
});

// Yahoo Finance API utilities
class YahooFinanceAPI {
  constructor() {
    this.proxies = [
      'https://api.allorigins.win/raw?url=',
      'https://corsproxy.io/?',
      'https://thingproxy.freeboard.io/fetch/'
    ];
    
    // FX pair descriptions
    this.fxPairDescriptions = {
      'AUDUSD': 'Australian Dollar → US Dollar',
      'USDAUD': 'US Dollar → Australian Dollar',
      'EURUSD': 'Euro → US Dollar',
      'USDEUR': 'US Dollar → Euro',
      'GBPUSD': 'British Pound → US Dollar',
      'USDGBP': 'US Dollar → British Pound',
      'USDJPY': 'US Dollar → Japanese Yen',
      'JPYUSD': 'Japanese Yen → US Dollar',
      'USDCAD': 'US Dollar → Canadian Dollar',
      'CADUSD': 'Canadian Dollar → US Dollar',
      'USDCHF': 'US Dollar → Swiss Franc',
      'CHFUSD': 'Swiss Franc → US Dollar',
      'USDCNY': 'US Dollar → Chinese Yuan',
      'CNYUSD': 'Chinese Yuan → US Dollar',
      'USDMXN': 'US Dollar → Mexican Peso',
      'MXNUSD': 'Mexican Peso → US Dollar',
      'USDBRL': 'US Dollar → Brazilian Real',
      'BRLUSD': 'Brazilian Real → US Dollar',
      'USDINR': 'US Dollar → Indian Rupee',
      'INRUSD': 'Indian Rupee → US Dollar',
      'USDKRW': 'US Dollar → South Korean Won',
      'KRWUSD': 'South Korean Won → US Dollar',
      'USDSGD': 'US Dollar → Singapore Dollar',
      'SGDUSD': 'Singapore Dollar → US Dollar',
      'USDHKD': 'US Dollar → Hong Kong Dollar',
      'HKDUSD': 'Hong Kong Dollar → US Dollar',
      'USDNZD': 'US Dollar → New Zealand Dollar',
      'NZDUSD': 'New Zealand Dollar → US Dollar',
      'USDSEK': 'US Dollar → Swedish Krona',
      'SEKUSD': 'Swedish Krona → US Dollar',
      'USDNOK': 'US Dollar → Norwegian Krone',
      'NOKUSD': 'Norwegian Krone → US Dollar',
      'USDDKK': 'US Dollar → Danish Krone',
      'DKKUSD': 'Danish Krone → US Dollar',
      'USDPLN': 'US Dollar → Polish Zloty',
      'PLNUSD': 'Polish Zloty → US Dollar',
      'USDCZK': 'US Dollar → Czech Koruna',
      'CZKUSD': 'Czech Koruna → US Dollar',
      'USDHUF': 'US Dollar → Hungarian Forint',
      'HUFUSD': 'Hungarian Forint → US Dollar',
      'USDRUB': 'US Dollar → Russian Ruble',
      'RUBUSD': 'Russian Ruble → US Dollar',
      'USDTRY': 'US Dollar → Turkish Lira',
      'TRYUSD': 'Turkish Lira → US Dollar',
      'USDZAR': 'US Dollar → South African Rand',
      'ZARUSD': 'South African Rand → US Dollar',
      'USDSAR': 'US Dollar → Saudi Riyal',
      'SARUSD': 'Saudi Riyal → US Dollar',
      'USDAED': 'US Dollar → UAE Dirham',
      'AEDUSD': 'UAE Dirham → US Dollar',
      'USDEGP': 'US Dollar → Egyptian Pound',
      'EGPUSD': 'Egyptian Pound → US Dollar',
      'USDTHB': 'US Dollar → Thai Baht',
      'THBUSD': 'Thai Baht → US Dollar',
      'USDPHP': 'US Dollar → Philippine Peso',
      'PHPUSD': 'Philippine Peso → US Dollar',
      'USDIDR': 'US Dollar → Indonesian Rupiah',
      'IDRUSD': 'Indonesian Rupiah → US Dollar',
      'USDMYR': 'US Dollar → Malaysian Ringgit',
      'MYRUSD': 'Malaysian Ringgit → US Dollar',
      'USDTWD': 'US Dollar → Taiwan Dollar',
      'TWDUSD': 'Taiwan Dollar → US Dollar',
      'USDVND': 'US Dollar → Vietnamese Dong',
      'VNDUSD': 'Vietnamese Dong → US Dollar',
      'USDCLP': 'US Dollar → Chilean Peso',
      'CLPUSD': 'Chilean Peso → US Dollar',
      'USDCOP': 'US Dollar → Colombian Peso',
      'COPUSD': 'Colombian Peso → US Dollar',
      'USDPEN': 'US Dollar → Peruvian Sol',
      'PENUSD': 'Peruvian Sol → US Dollar',
      'USDARS': 'US Dollar → Argentine Peso',
      'ARSUSD': 'Argentine Peso → US Dollar',
      'USDUYU': 'US Dollar → Uruguayan Peso',
      'UYUUSD': 'Uruguayan Peso → US Dollar',
      'USDPYG': 'US Dollar → Paraguayan Guarani',
      'PYGUSD': 'Paraguayan Guarani → US Dollar',
      'USDBOB': 'US Dollar → Bolivian Boliviano',
      'BOBUSD': 'Bolivian Boliviano → US Dollar',
      'USDKYD': 'US Dollar → Cayman Islands Dollar',
      'KYDUSD': 'Cayman Islands Dollar → US Dollar',
      'USDKZT': 'US Dollar → Kazakhstani Tenge',
      'KZTUSD': 'Kazakhstani Tenge → US Dollar',
      'USDCAD': 'US Dollar → Canadian Dollar',
      'CADUSD': 'Canadian Dollar → US Dollar',
      'AUDCAD': 'Australian Dollar → Canadian Dollar',
      'CADAUD': 'Canadian Dollar → Australian Dollar',
      'AUDCNY': 'Australian Dollar → Chinese Yuan',
      'CNYAUD': 'Chinese Yuan → Australian Dollar',
      'AUDEUR': 'Australian Dollar → Euro',
      'EURAUD': 'Euro → Australian Dollar',
      'AUDGBP': 'Australian Dollar → British Pound',
      'GBPAUD': 'British Pound → Australian Dollar',
      'AUDJPY': 'Australian Dollar → Japanese Yen',
      'JPYAUD': 'Japanese Yen → Australian Dollar',
      'EURCNY': 'Euro → Chinese Yuan',
      'CNYEUR': 'Chinese Yuan → Euro',
      'EURJPY': 'Euro → Japanese Yen',
      'JPYEUR': 'Japanese Yen → Euro',
      'GBPCNY': 'British Pound → Chinese Yuan',
      'CNYGBP': 'Chinese Yuan → British Pound'
    };
  }

  // Convert FX pair to Yahoo Finance symbol format
  convertFXPairToSymbol(fxPair) {
    // Yahoo Finance uses format like "USDAUD=X" for FX pairs
    return `${fxPair}=X`;
  }

  // Get FX pair description
  getFXPairDescription(fxPair) {
    return this.fxPairDescriptions[fxPair] || `${fxPair} Exchange Rate`;
  }

  // Get Yahoo Finance URL for FX pair
  getYahooFinanceURL(fxPair) {
    const symbol = this.convertFXPairToSymbol(fxPair);
    return `https://finance.yahoo.com/quote/${symbol}`;
  }

  // Fetch FX data from Yahoo Finance with multiple proxy fallbacks
  async fetchFXData(fxPair, startDate, endDate) {
    const symbol = this.convertFXPairToSymbol(fxPair);
    const startTimestamp = Math.floor(startDate.getTime() / 1000);
    const endTimestamp = Math.floor(endDate.getTime() / 1000);
    
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${startTimestamp}&period2=${endTimestamp}&interval=1d`;
    
    console.log(`Fetching ${fxPair} data from Yahoo Finance...`);
    
    for (let i = 0; i < this.proxies.length; i++) {
      try {
        console.log(`Attempting ${fxPair} fetch with proxy ${i + 1}/${this.proxies.length}...`);
        const proxyUrl = this.proxies[i] + encodeURIComponent(yahooUrl);
        
        const response = await Promise.race([
          fetch(proxyUrl, { method: 'GET' }),
          new Promise((_, reject) => setTimeout(() => reject(new Error(`${fxPair} request timeout`)), 8000))
        ]);
        
        if (!response.ok) {
          throw new Error(`${fxPair} API request failed: ${response.status} ${response.statusText}`);
        }
        
        const responseText = await response.text();
        if (responseText.includes('Too Many Requests') || responseText.includes('rate limit')) {
          throw new Error('Yahoo Finance rate limit exceeded');
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

  // Fetch comprehensive FX data for multiple time periods
  async fetchComprehensiveFXData(fxPair) {
    const now = new Date();
    const periods = [
      { name: '1Y', years: 1, startDate: new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()) },
      { name: '5Y', years: 5, startDate: new Date(now.getFullYear() - 5, now.getMonth(), now.getDate()) },
      { name: '10Y', years: 10, startDate: new Date(now.getFullYear() - 10, now.getMonth(), now.getDate()) }
    ];

    const results = {};
    
    for (const period of periods) {
      try {
        console.log(`Fetching ${fxPair} ${period.name} data...`);
        const data = await this.fetchFXData(fxPair, period.startDate, now);
        if (data) {
          const processedData = this.processFXData(data, fxPair);
          if (processedData) {
            results[period.name] = processedData;
          }
        }
        // Add delay between requests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.warn(`Failed to fetch ${period.name} data for ${fxPair}:`, error);
      }
    }

    return results;
  }

  // Process Yahoo Finance data for FX pairs
  processFXData(yahooData, fxPair) {
    if (!yahooData.chart || !yahooData.chart.result || !yahooData.chart.result[0]) {
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
          volume: volumes ? volumes[i] : null
        });
      }
    }

    // Calculate min/max range
    const validData = data.filter(d => d.high && d.low);
    const minRate = validData.length > 0 ? Math.min(...validData.map(d => d.low)) : null;
    const maxRate = validData.length > 0 ? Math.max(...validData.map(d => d.high)) : null;

    // Calculate additional statistics
    const validCloses = data.filter(d => d.close !== null && d.close !== undefined);
    const avgRate = validCloses.length > 0 ? validCloses.reduce((sum, d) => sum + d.close, 0) / validCloses.length : null;
    const volatility = validCloses.length > 1 ? this.calculateVolatility(validCloses.map(d => d.close)) : null;

    return {
      fxPair: fxPair,
      description: this.getFXPairDescription(fxPair),
      yahooUrl: this.getYahooFinanceURL(fxPair),
      data: data,
      initialPrice: data.length > 0 ? data[0].close : null,
      currentPrice: data.length > 0 ? data[data.length - 1].close : null,
      minRate: minRate,
      maxRate: maxRate,
      avgRate: avgRate,
      volatility: volatility,
      dataPoints: data.length,
      dateRange: {
        start: data.length > 0 ? data[0].date : null,
        end: data.length > 0 ? data[data.length - 1].date : null
      }
    };
  }

  // Calculate volatility (standard deviation of returns)
  calculateVolatility(prices) {
    if (prices.length < 2) return null;
    
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      const return_ = (prices[i] - prices[i-1]) / prices[i-1];
      returns.push(return_);
    }
    
    const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const squaredDiffs = returns.map(r => Math.pow(r - meanReturn, 2));
    const variance = squaredDiffs.reduce((sum, d) => sum + d, 0) / returns.length;
    const volatility = Math.sqrt(variance);
    
    return volatility * 100; // Return as percentage
  }
}

// Global Yahoo Finance API instance
const yahooAPI = new YahooFinanceAPI();

// Utility functions
function formatCurrency(value, decimals = 4) {
  if (value === null || value === undefined || isNaN(value)) {
    return 'N/A';
  }
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function formatPercentage(value) {
  if (value === null || value === undefined || isNaN(value)) {
    return 'N/A';
  }
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

async function loadHistoricalData(predictionDate, fxPair) {
  // Load the CSV file for this FX pair
  const response = await fetch(`${predictionDate}/${fxPair}.csv`);
  if (!response.ok) {
    throw new Error(`Failed to load ${fxPair}.csv`);
  }
  
  const csvText = await response.text();
  const lines = csvText.split('\n').filter(line => line.trim());
  
  // Skip header line
  const dataLines = lines.slice(1);
  
  // Parse CSV data
  const dailyData = [];
  for (const line of dataLines) {
    const [dateStr, rateStr] = line.split(',');
    if (dateStr && rateStr) {
      const date = new Date(dateStr);
      const rate = parseFloat(rateStr);
      if (!isNaN(rate)) {
        dailyData.push({ date, rate });
      }
    }
  }
  
  // Calculate weekly averages
  const weeklyData = [];
  
  // Group data by weeks (Monday to Sunday)
  const weeklyGroups = {};
  
  for (const point of dailyData) {
    // Get the Monday of the week containing this date
    const dayOfWeek = point.date.getDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Sunday = 0, Monday = 1
    const monday = new Date(point.date);
    monday.setDate(monday.getDate() - daysToMonday);
    
    const weekKey = monday.toISOString().split('T')[0];
    
    if (!weeklyGroups[weekKey]) {
      weeklyGroups[weekKey] = [];
    }
    weeklyGroups[weekKey].push(point.rate);
  }
  
  // Calculate weekly averages and create chart data
  for (const [weekKey, rates] of Object.entries(weeklyGroups)) {
    if (rates.length > 0) {
      const averageRate = rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
      const weekDate = new Date(weekKey);
      
      weeklyData.push({
        x: weekDate.getTime(),
        y: averageRate
      });
    }
  }
  
  // Sort by date and return last 52 weeks
  weeklyData.sort((a, b) => a.x - b.x);
  return weeklyData.slice(-52);
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
    const predictionFileSelect = document.getElementById('predictionFileSelect');
    if (predictionFileSelect) {
      predictionFileSelect.addEventListener('change', (e) => {
        this.selectedFile = e.target.value;
        if (this.selectedFile) {
          this.loadPredictionData();
        } else {
          this.hideFXPairs();
        }
      });
    }

    // Navigation button
    const backToSelection = document.getElementById('backToSelection');
    if (backToSelection) {
      backToSelection.addEventListener('click', () => {
        this.showFXPairs();
      });
    }
  }

  async loadIndex() {
    try {
      this.showLoading();
      const response = await fetch('index.json');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const indexData = await response.json();

      const select = document.getElementById('predictionFileSelect');
      if (!select) return;

      select.innerHTML = '<option value="">Choose a prediction date...</option>';

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

      // Auto-select the prediction date closest to 1 year ago
      this.autoSelectClosestDate(sortedEntries);
      
      this.hideLoading();
    } catch (error) {
      console.error('Error loading index:', error);
      this.showError('Failed to load prediction files index');
    }
  }

  autoSelectClosestDate(sortedEntries) {
    if (sortedEntries.length === 0) return;

    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    let closestEntry = sortedEntries[0]; // Default to most recent
    let closestDiff = Math.abs(new Date(sortedEntries[0][1].date).getTime() - oneYearAgo.getTime());

    for (const [key, entry] of sortedEntries) {
      const entryDate = new Date(entry.date);
      const diff = Math.abs(entryDate.getTime() - oneYearAgo.getTime());
      
      if (diff < closestDiff) {
        closestDiff = diff;
        closestEntry = [key, entry];
      }
    }

    // Set the selected date
    const select = document.getElementById('predictionFileSelect');
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
      console.error('Error loading prediction file:', error);
      this.showError('Failed to load prediction data');
    }
  }

  populateFXPairsList() {
    if (!this.predictionData) return;

    const container = document.getElementById('fxPairsList');
    if (!container) return;

    container.innerHTML = '';

    // Sort pairs alphabetically
    const sortedPairs = this.predictionData.results.sort((a, b) => a.pair.localeCompare(b.pair));

    for (const pair of sortedPairs) {
      const col = document.createElement('div');
      col.className = 'col-md-6 col-lg-4 mb-3';
      
      // Calculate summary statistics
      const monthlyChange = pair.predictions[0].predictedChangePercent;
      const yearlyChange = pair.predictions[4].predictedChangePercent;
      const avgChange = pair.predictions.reduce((sum, p) => sum + p.predictedChangePercent, 0) / pair.predictions.length;
      
      col.innerHTML = `
        <div class="fx-pair-card" onclick="fxValidator.selectFXPair('${pair.pair}')">
          <div class="d-flex justify-content-between align-items-start mb-2">
            <h5 class="mb-0">${pair.pair}</h5>
            <span class="badge bg-primary">${formatCurrency(pair.currentRate)}</span>
          </div>
          <div class="prediction-summary">
            <div class="row">
              <div class="col-6">
                <small>Monthly:</small><br>
                <span class="prediction-change ${monthlyChange >= 0 ? 'positive' : 'negative'}">
                  ${formatPercentage(monthlyChange)}
                </span>
              </div>
              <div class="col-6">
                <small>Yearly:</small><br>
                <span class="prediction-change ${yearlyChange >= 0 ? 'positive' : 'negative'}">
                  ${formatPercentage(yearlyChange)}
                </span>
              </div>
            </div>
            <div class="mt-2">
              <small>Avg Change:</small><br>
              <span class="prediction-change ${avgChange >= 0 ? 'positive' : 'negative'}">
                ${formatPercentage(avgChange)}
              </span>
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
    document.getElementById('fxPairsContainer').style.display = 'block';
    document.getElementById('chartView').style.display = 'none';
  }

  hideFXPairs() {
    document.getElementById('fxPairsContainer').style.display = 'none';
    document.getElementById('chartView').style.display = 'none';
  }

  async showChartView() {
    document.getElementById('fxPairsContainer').style.display = 'none';
    document.getElementById('chartView').style.display = 'block';
    
    await this.updateChartView();
  }

  async updateChartView() {
    if (!this.predictionData || !this.selectedPair) return;

    const pair = this.predictionData.results.find(p => p.pair === this.selectedPair);
    if (!pair) return;

    // Update display info
    const dateDisplay = document.getElementById('predictionDateDisplay');
    const pairDisplay = document.getElementById('fxPairDisplay');
    const chartTitle = document.getElementById('chartTitle');

    if (dateDisplay) {
      const date = new Date(this.predictionData.date);
      dateDisplay.textContent = date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    }

    if (pairDisplay) {
      pairDisplay.textContent = `${pair.pair} (${formatCurrency(pair.currentRate)})`;
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

    const canvas = document.getElementById('fxChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Load actual historical data from CSV
    let weeklyData;
    try {
      weeklyData = await loadHistoricalData(this.predictionData.date, pair.pair);
    } catch (error) {
      console.error(`Error loading historical data for ${pair.pair}:`, error);
      this.showError(`No historical data available for ${pair.pair}. CSV file may be missing.`);
      return;
    }

    // Create prediction line data (smooth curve through prediction points)
    const predictionLineData = [];
    const predictionDate = new Date(this.predictionData.date);
    
    // Add current rate at prediction date
    predictionLineData.push({
      x: predictionDate.getTime(),
      y: pair.currentRate
    });
    
    // Add all prediction points
    pair.predictions.forEach(prediction => {
      const date = new Date(predictionDate);
      date.setDate(date.getDate() + prediction.days);
      predictionLineData.push({
        x: date.getTime(),
        y: prediction.predictedRate
      });
    });

    const datasets = [
      {
        label: 'Historical Weekly Averages',
        data: weeklyData,
        borderColor: '#6c757d',
        backgroundColor: 'rgba(108, 117, 125, 0.1)',
        borderWidth: 2,
        pointRadius: 0,
        fill: false,
        tension: 0.1
      },
      {
        label: 'Predicted Path',
        data: predictionLineData,
        borderColor: '#667eea',
        backgroundColor: 'rgba(102, 126, 234, 0.1)',
        borderWidth: 3,
        borderDash: [5, 5],
        pointRadius: 0,
        fill: false,
        tension: 0.4
      }
    ];

    // Add prediction date marker
    datasets.push({
      label: 'Prediction Date',
      data: [{
        x: predictionDate.getTime(),
        y: pair.currentRate
      }],
      borderColor: '#dc3545',
      backgroundColor: '#dc3545',
      borderWidth: 0,
      pointRadius: 10,
      pointStyle: 'rectRot',
      fill: false
    });

    // Add prediction points with different colors
    const predictionColors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57'];
    const predictionLabels = ['Monthly (30d)', 'Quarterly (90d)', 'Half-Year (180d)', '3-Quarters (270d)', 'Full-Year (365d)'];

    pair.predictions.forEach((prediction, index) => {
      const date = new Date(predictionDate);
      date.setDate(date.getDate() + prediction.days);
      
      datasets.push({
        label: predictionLabels[index],
        data: [{
          x: date.getTime(),
          y: prediction.predictedRate
        }],
        borderColor: predictionColors[index],
        backgroundColor: predictionColors[index],
        borderWidth: 0,
        pointRadius: 8,
        pointStyle: 'circle',
        fill: false
      });
    });

    if (typeof Chart !== 'undefined') {
      this.chart = new Chart(ctx, {
        type: 'line',
        data: { datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            title: {
              display: true,
              text: `${pair.pair} Rate Analysis - ${this.predictionData.date}`,
              font: {
                size: 16,
              },
            },
            legend: {
              display: true,
              position: 'top',
            },
            tooltip: {
              callbacks: {
                title: function(context) {
                  const date = new Date(context[0].parsed.x);
                  return date.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                  });
                },
                label: function(context) {
                  return `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`;
                }
              }
            }
          },
          scales: {
            x: {
              type: 'time',
              time: {
                unit: 'week',
                displayFormats: {
                  week: 'MMM dd, yyyy'
                }
              },
              title: {
                display: true,
                text: 'Week Starting',
              },
            },
            y: {
              title: {
                display: true,
                text: 'FX Rate',
              },
            },
          },
          interaction: {
            intersect: false,
            mode: 'index'
          }
        },
      });
    }
    
    // Load Yahoo Finance data for validation
    this.loadYahooFinanceData(pair);
  }

  async loadYahooFinanceData(pair) {
    // Show loading state
    this.showElement('yahooDataLoading');
    this.hideElement('yahooDataContent');
    this.hideElement('yahooDataError');

    try {
      // Fetch comprehensive Yahoo Finance data for multiple time periods
      const comprehensiveData = await yahooAPI.fetchComprehensiveFXData(pair.pair);
      
      if (comprehensiveData && Object.keys(comprehensiveData).length > 0) {
        // Use 1Y data for current display and chart
        const currentData = comprehensiveData['1Y'] || Object.values(comprehensiveData)[0];
        this.displayYahooFinanceData(currentData, pair, comprehensiveData);
        
        // Add Yahoo Finance data to chart if available
        this.addYahooFinanceToChart(currentData);
      } else {
        this.showYahooFinanceError('No valid data received from Yahoo Finance');
      }
    } catch (error) {
      console.error('Error loading Yahoo Finance data:', error);
      this.showYahooFinanceError('Error loading Yahoo Finance data: ' + error.message);
    }
  }

  displayYahooFinanceData(yahooData, pair, comprehensiveData = null) {
    // Hide loading, show content
    this.hideElement('yahooDataLoading');
    this.showElement('yahooDataContent');

    // Update FX pair description and link
    document.getElementById('yahooFXPairDescription').textContent = yahooData.description;
    const yahooLink = document.getElementById('yahooFinanceLink');
    yahooLink.href = yahooData.yahooUrl;

    // Update current data summary
    document.getElementById('yahooCurrentRate').textContent = formatCurrency(yahooData.currentPrice);
    document.getElementById('yahooAvgRate').textContent = formatCurrency(yahooData.avgRate);
    document.getElementById('yahooVolatility').textContent = yahooData.volatility ? `${yahooData.volatility.toFixed(2)}%` : 'N/A';
    document.getElementById('yahooDataPoints').textContent = yahooData.dataPoints;
    
    // Update date range
    if (yahooData.dateRange.start && yahooData.dateRange.end) {
      const startDate = yahooData.dateRange.start.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
      const endDate = yahooData.dateRange.end.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
      document.getElementById('yahooDateRange').textContent = `${startDate} - ${endDate}`;
    } else {
      document.getElementById('yahooDateRange').textContent = 'N/A';
    }

    // Update historical ranges
    if (comprehensiveData) {
      this.updateHistoricalRanges(comprehensiveData);
    }

    // Validate data against CSV data
    this.validateDataAgainstYahoo(yahooData, pair);
  }

  updateHistoricalRanges(comprehensiveData) {
    const periods = ['1Y', '5Y', '10Y'];
    
    periods.forEach(period => {
      const elementId = `yahoo${period}Range`;
      const element = document.getElementById(elementId);
      
      if (comprehensiveData[period]) {
        const data = comprehensiveData[period];
        const minRate = formatCurrency(data.minRate);
        const maxRate = formatCurrency(data.maxRate);
        element.textContent = `${minRate} - ${maxRate}`;
      } else {
        element.textContent = 'N/A';
      }
    });
  }

  validateDataAgainstYahoo(yahooData, pair) {
    const validationResults = document.getElementById('yahooValidationResults');
    let validationHTML = '';

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
            Current rates match well (difference: ${formatCurrency(rateDifference)} / ${rateDifferencePercent.toFixed(2)}%)
          </small>
        </div>
      `;
    } else if (rateDifferencePercent < 5) {
      validationHTML += `
        <div class="alert alert-warning">
          <small>
            <i class="fas fa-exclamation-triangle me-1"></i>
            Current rates differ by ${formatCurrency(rateDifference)} (${rateDifferencePercent.toFixed(2)}%)
          </small>
        </div>
      `;
    } else {
      validationHTML += `
        <div class="alert alert-danger">
          <small>
            <i class="fas fa-times-circle me-1"></i>
            Large rate difference: ${formatCurrency(rateDifference)} (${rateDifferencePercent.toFixed(2)}%)
          </small>
        </div>
      `;
    }

    // Add comprehensive validation info
    validationHTML += `
      <div class="alert alert-info">
        <small>
          <i class="fas fa-info-circle me-1"></i>
          <strong>Yahoo Finance Statistics:</strong><br>
          • 1Y Range: ${formatCurrency(yahooData.minRate)} - ${formatCurrency(yahooData.maxRate)}<br>
          • Average Rate: ${formatCurrency(yahooData.avgRate)}<br>
          • Volatility: ${yahooData.volatility ? `${yahooData.volatility.toFixed(2)}%` : 'N/A'}<br>
          • Data Points: ${yahooData.dataPoints} days
        </small>
      </div>
    `;

    // Add data quality assessment
    if (yahooData.dataPoints >= 250) {
      validationHTML += `
        <div class="alert alert-success">
          <small>
            <i class="fas fa-check-circle me-1"></i>
            High-quality data: ${yahooData.dataPoints} trading days available
          </small>
        </div>
      `;
    } else if (yahooData.dataPoints >= 100) {
      validationHTML += `
        <div class="alert alert-warning">
          <small>
            <i class="fas fa-exclamation-triangle me-1"></i>
            Moderate data quality: ${yahooData.dataPoints} trading days available
          </small>
        </div>
      `;
    } else {
      validationHTML += `
        <div class="alert alert-danger">
          <small>
            <i class="fas fa-times-circle me-1"></i>
            Limited data quality: Only ${yahooData.dataPoints} trading days available
          </small>
        </div>
      `;
    }

    validationResults.innerHTML = validationHTML;
  }

  addYahooFinanceToChart(yahooData) {
    if (!this.chart || !yahooData.data || yahooData.data.length === 0) return;

    // Convert Yahoo Finance data to chart format
    const yahooChartData = yahooData.data.map(point => ({
      x: point.date.getTime(),
      y: point.close
    }));

    // Add Yahoo Finance data as a new dataset
    this.chart.data.datasets.push({
      label: 'Yahoo Finance Daily',
      data: yahooChartData,
      borderColor: '#28a745',
      backgroundColor: 'rgba(40, 167, 69, 0.1)',
      borderWidth: 1,
      pointRadius: 0,
      fill: false,
      tension: 0.1
    });

    // Add min/max range lines
    if (yahooData.minRate && yahooData.maxRate) {
      const minLineData = yahooChartData.map(point => ({
        x: point.x,
        y: yahooData.minRate
      }));

      const maxLineData = yahooChartData.map(point => ({
        x: point.x,
        y: yahooData.maxRate
      }));

      this.chart.data.datasets.push({
        label: 'Yahoo Min Rate',
        data: minLineData,
        borderColor: '#dc3545',
        backgroundColor: 'rgba(220, 53, 69, 0.1)',
        borderWidth: 1,
        borderDash: [3, 3],
        pointRadius: 0,
        fill: false
      });

      this.chart.data.datasets.push({
        label: 'Yahoo Max Rate',
        data: maxLineData,
        borderColor: '#ffc107',
        backgroundColor: 'rgba(255, 193, 7, 0.1)',
        borderWidth: 1,
        borderDash: [3, 3],
        pointRadius: 0,
        fill: false
      });
    }

    this.chart.update();
  }

  showYahooFinanceError(message) {
    this.hideElement('yahooDataLoading');
    this.hideElement('yahooDataContent');
    this.showElement('yahooDataError');
    
    const errorElement = document.getElementById('yahooDataError');
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
    this.showElement('loading');
    this.hideElement('error');
  }

  hideLoading() {
    this.hideElement('loading');
  }

  showError(message) {
    const errorElement = document.getElementById('error');
    if (errorElement) {
      errorElement.textContent = message;
      errorElement.style.display = 'block';
    }
    this.hideElement('loading');
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

// Initialize the FX validator when the page loads
let fxValidator;
document.addEventListener('DOMContentLoaded', () => {
  fxValidator = new GRQFXValidator();
}); 