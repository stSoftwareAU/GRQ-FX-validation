# GRQ FX Validation Dashboard

A JAMstack-based dashboard for validating AI predictions against actual FX rates over time.

## Architecture

This project follows JAMstack principles:
- **JavaScript**: Client-side JavaScript for dynamic functionality
- **APIs**: Static JSON files served as data APIs
- **Markup**: Pre-built HTML files served statically

## Features

- **FX Prediction Validation**: Compare AI predictions with actual FX rates
- **Time Horizon Analysis**: Focus on monthly (30d), quarterly (90d), half-year (180d), and full-year (365d) predictions
- **Performance Metrics**: Calculate accuracy, error rates, and performance statistics
- **Interactive Charts**: Visualize prediction vs actual rates using Chart.js
- **Pending Actual Rates**: Handle cases where actual rates aren't available yet
- **Date-based Filtering**: Browse predictions by date range
- **Performance Filtering**: Filter by accuracy levels (high, medium, low)
- **Responsive Design**: Works on desktop and mobile devices

## Time Horizons

The dashboard focuses on four key prediction timeframes:

| Period | Days | Description |
|--------|------|-------------|
| Monthly | 30 | One-month predictions |
| Quarterly | 90 | Three-month predictions |
| Half-Year | 180 | Six-month predictions |
| Full-Year | 365 | One-year predictions |

## Data Availability

- **Historical Rates**: 12 months of historical data available from prediction date
- **Actual Rates**: Updated as they become available over time
- **Pending Status**: Shows "Pending" for future dates where actual rates aren't available yet

## File Structure

```
docs/
├── index.html          # Main dashboard page
├── list.html           # Prediction files list page
├── index.json          # Index of available prediction dates
├── styles.css          # Main stylesheet
├── list.css            # List page stylesheet
├── logo.png            # Dashboard logo
└── 2025-07-27/         # Prediction data directory
    ├── predictions.json # FX predictions for this date
    ├── AUDCAD.csv      # Actual rates for AUD/CAD
    ├── AUDCNY.csv      # Actual rates for AUD/CNY
    └── ...             # Other currency pairs
```

## Data Format

### index.json
```json
{
  "entries": {
    "2025-07-27": {
      "date": "2025-07-27",
      "type": "fx_predictions",
      "description": "FX predictions for 2025-07-27",
      "file": "2025-07-27/predictions.json"
    }
  }
}
```

### predictions.json
```json
{
  "date": "2025-07-27",
  "results": [
    {
      "pair": "AUDCAD",
      "currentRate": 0.9123,
      "predictions": [
        {
          "days": 30,
          "predictedRate": 0.9150,
          "predictedChangePercent": 0.3
        },
        {
          "days": 90,
          "predictedRate": 0.9200,
          "predictedChangePercent": 0.8
        },
        {
          "days": 180,
          "predictedRate": 0.9250,
          "predictedChangePercent": 1.4
        },
        {
          "days": 365,
          "predictedRate": 0.9300,
          "predictedChangePercent": 1.9
        }
      ]
    }
  ]
}
```

## Usage

1. **View Dashboard**: Open `docs/index.html` in a web browser
2. **Select Date**: Choose a prediction date from the dropdown
3. **View Performance**: See charts and tables showing prediction accuracy
4. **Monitor Progress**: Track which actual rates are available vs pending
5. **Browse Files**: Use `list.html` to see all available prediction files

## Performance Metrics

The dashboard calculates several key metrics:

- **Total Pairs**: Number of FX pairs analyzed
- **Available Actuals**: Count of actual rates available vs total possible
- **Average Error**: Mean prediction error across available time horizons
- **Best Performer**: FX pair with lowest average error

## Deployment

This is a static site that can be deployed to any web server or CDN:

- **GitHub Pages**: Push to a GitHub repository and enable Pages
- **Netlify**: Drag and drop the `docs` folder
- **Vercel**: Connect your repository
- **AWS S3**: Upload files to an S3 bucket with static website hosting

## Adding New Prediction Data

1. Create a new directory in `docs/` with the prediction date (e.g., `2025-08-01/`)
2. Add `predictions.json` with your prediction data for the 4 time horizons
3. Add CSV files for actual rates as they become available
4. Update `index.json` to include the new entry

## Browser Compatibility

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## Dependencies

- Bootstrap 5.3.0 (CDN)
- Chart.js (CDN)
- Font Awesome 6.4.0 (CDN)

No build process or server-side code required!
