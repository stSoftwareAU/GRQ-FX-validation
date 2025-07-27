# Version Incrementing System

This project uses an automated version incrementing system similar to the one in GRQ-validation.

## How it Works

1. **Version Variable**: The `VERSION` constant is defined in `docs/index.html` and is used to:
   - Set the page title with version number
   - Display the version at the bottom of the page
   - Force browser cache refresh for JS/CSS files

2. **Git Hook**: A pre-commit hook automatically increments the patch version when any files in the `docs/` directory are committed.

3. **Version Display**: The version is shown at the bottom of the page and updates automatically.

## Files Involved

- `scripts/pre-commit` - Git hook that increments version
- `docs/index.html` - Contains VERSION constant and display
- `setup-hooks.sh` - Script to install git hooks

## Usage

### Initial Setup
```bash
./setup-hooks.sh
```

### Manual Version Update
If you need to manually update the version, edit the VERSION constant in `docs/index.html`:
```javascript
const VERSION="1.0.1";
```

### Automatic Version Increment
The version will automatically increment when you commit changes to any files in the `docs/` directory:
```bash
git add docs/some-file.html
git commit -m "Update some file"
# Version will automatically increment from 1.0.1 to 1.0.2
```

## Version Format
- Format: `major.minor.patch` (e.g., 1.0.1)
- Only the patch version is auto-incremented
- Major and minor versions must be updated manually if needed

## Browser Cache Busting
The version number is used to force browsers to reload JS/CSS files when the version changes, ensuring users always get the latest version of the application. 