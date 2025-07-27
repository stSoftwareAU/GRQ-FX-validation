# GRQ FX Validation

This repository contains the validation dashboard for GRQ FX predictions. It provides a web-based interface to compare predicted FX rates against actual rates over time.

## Features

- **FX Prediction Validation**: Compare predicted FX rates with actual rates
- **Multi-timeframe Analysis**: View predictions for 7, 14, 30, 60, and 90-day horizons
- **Performance Metrics**: Track accuracy, error rates, and performance trends
- **Interactive Charts**: Visualize prediction performance over time
- **Mobile Responsive**: Works on desktop and mobile devices

## GitHub Pages

The validation dashboard is automatically deployed to GitHub Pages when changes are made to the `docs/` directory. The site is available at:

https://[your-username].github.io/GRQ-FX-validation/

### Automatic Deployment

The project uses GitHub Actions to automatically deploy to GitHub Pages:

1. **CI/CD Pipeline**: Located in `.github/workflows/ci.yml`
2. **Trigger**: Automatically runs when changes are pushed to the `main` branch
3. **Deployment**: Only deploys when files in the `docs/` directory are modified

### Pages Structure

- `index.html` - Main validation dashboard
- `list.html` - List of all prediction files with performance summaries
- `app.js` - Main application logic for FX validation
- `list.js` - Logic for the prediction files list
- `styles.css` - Main stylesheet
- `list.css` - Styles for the list page

## Data Format

### Prediction Files

Prediction files are stored in the `docs/` directory with the following structure:

```
docs/
├── index.json                    # Index of all prediction files
├── YYYY-MM-DD/                   # Date-based directories
│   └── predictions.json          # FX predictions for that date
└── ...
```

### Prediction JSON Format

```json
{
  "date": "2025-07-27",
  "timestamp": "2025-07-27T02:07:53.964Z",
  "totalPredictions": 47,
  "results": [
    {
      "pair": "USDTHB",
      "currentRate": 32.23,
      "predictions": [
        {
          "days": 7,
          "predictedRate": 28.92737796103327,
          "predictedChangePercent": -10.247043248422989
        },
        {
          "days": 14,
          "predictedRate": 29.617864017675572,
          "predictedChangePercent": -8.104672610376754
        }
        // ... more timeframes
      ],
      "predictionDate": "2025-07-27T00:00:00.000Z"
    }
  ]
}
```

## Setup

1. **Enable GitHub Pages**: Go to repository Settings > Pages and enable GitHub Pages from the `docs/` directory
2. **Configure Actions**: Ensure GitHub Actions are enabled for the repository
3. **Add Prediction Data**: Place prediction files in the appropriate date directories under `docs/`
4. **Update Index**: Add entries to `docs/index.json` for new prediction files

## Development

### Local Development

To run the dashboard locally:

1. Clone the repository
2. Serve the `docs/` directory with a local web server:
   ```bash
   cd docs
   python -m http.server 8000
   ```
3. Open http://localhost:8000 in your browser

### Adding New Prediction Files

1. Create a new directory under `docs/` with the date format `YYYY-MM-DD`
2. Add a `predictions.json` file with the prediction data
3. Update `docs/index.json` to include the new file:

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

## Performance Metrics

The dashboard calculates several performance metrics:

- **Average Accuracy**: Mean prediction accuracy across all FX pairs
- **Error Rate**: Average percentage error between predicted and actual rates
- **High Accuracy Pairs**: Number of pairs with >90% accuracy
- **Time Horizon Performance**: Accuracy breakdown by prediction timeframe

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test locally
5. Submit a pull request

## License

This project is licensed under the same terms as the main GRQ project.
