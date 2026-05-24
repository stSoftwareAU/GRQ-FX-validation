# Yahoo Finance API Integration

This project now includes Yahoo Finance API integration to validate FX pair data and provide additional market insights.

## Features

### 1. **Data Validation**

- Compares your CSV data with Yahoo Finance data
- Shows rate differences and validation status
- Helps identify potential data quality issues

### 2. **Min/Max Range Display**

- Shows the minimum and maximum rates from Yahoo Finance
- Displays range as dashed lines on the chart
- Helps understand the full price range during the analysis period

### 3. **Real-time Data**

- Fetches current market data from Yahoo Finance
- Updates automatically when viewing different FX pairs
- Uses multiple CORS proxies for reliability

## How It Works

### API Integration

- Uses Yahoo Finance API with FX pair symbols (e.g., `USDAUD=X`)
- Implements multiple CORS proxy fallbacks for reliability
- Handles rate limiting and network errors gracefully

### Data Processing

- Fetches daily FX rate data for the analysis period
- Calculates min/max ranges from high/low prices
- Compares with your CSV data for validation

### Chart Integration

- Adds Yahoo Finance daily rates as a green line
- Shows min/max ranges as dashed red/yellow lines
- Updates legend to include new data sources

## Usage

### Automatic Loading

When you select an FX pair, the system automatically:

1. Loads your CSV data
2. Fetches Yahoo Finance data in the background
3. Displays validation results
4. Adds Yahoo Finance data to the chart

### Validation Results

The system shows:

- **Green**: Rates match well (< 1% difference)
- **Yellow**: Moderate difference (1-5% difference)
- **Red**: Large difference (> 5% difference)

### Data Display

- Current rate comparison
- Min/max range information
- Number of data points
- Date range covered

## Technical Details

### API Endpoints

- Base URL: `https://query1.finance.yahoo.com/v8/finance/chart/`
- Symbol Format: `{FXPAIR}=X` (e.g., `USDAUD=X`)
- Parameters: Date range and interval (1d for daily)

### CORS Proxies

The system uses a small allowlist of CORS proxies for reliability. The
allowlist was tightened in issue #24 — a previously-used third proxy was
removed after its source repository became unmaintained. The current
allowlist is also reflected in the `connect-src` directive of the
Content-Security-Policy meta tag in `docs/index.html`:

1. `api.allorigins.win`
2. `corsproxy.io`

### Error Handling

- Automatic retry with different proxies
- Graceful degradation if all proxies fail
- Clear error messages for users

## Benefits

1. **Data Quality Assurance**: Validate your CSV data against authoritative sources
2. **Market Context**: See the full price range and market volatility
3. **Real-time Updates**: Get current market rates for comparison
4. **Reliability**: Multiple proxy fallbacks ensure data availability

## Limitations

- Yahoo Finance API has rate limits
- Some FX pairs may have limited historical data
- Network connectivity required for real-time data
- Proxy services may occasionally be unavailable

## Future Enhancements

- Cache Yahoo Finance data to reduce API calls
- Add more data sources for comparison
- Implement data quality scoring
- Add historical volatility analysis
