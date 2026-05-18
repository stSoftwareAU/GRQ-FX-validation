# PWA Icon Specifications for GIMP

## Overview

You need to create multiple icon sizes for the Progressive Web App. All icons should be based on your `logo2.webp` file and exported as PNG format.

## Required Icon Sizes

### Standard PWA Icons

- **16x16** - Small favicon
- **32x32** - Standard favicon  
- **72x72** - Android Chrome
- **96x96** - Android Chrome
- **128x128** - Android Chrome
- **144x144** - Windows tiles
- **152x152** - iOS Safari
- **167x167** - iOS Safari (iPad Pro)
- **180x180** - iOS Safari (iPhone)
- **192x192** - Android Chrome (standard)
- **384x384** - Android Chrome (large)
- **512x512** - Android Chrome (splash screen)

## GIMP Instructions

### Step 1: Open your logo2.webp in GIMP

1. Open GIMP
2. File → Open → Select `logo2.webp`

### Step 2: Create a template for consistent sizing

1. Image → Canvas Size
2. Set to 512x512 pixels (largest size)
3. Center your logo in the canvas
4. Add padding around the logo so it doesn't touch edges
5. Export this as your master template

### Step 3: Export each size

For each required size, follow these steps:

1. **Scale the image:**
   - Image → Scale Image
   - Set width and height to the target size (e.g., 192x192)
   - Interpolation: Cubic (best quality)

2. **Export as PNG:**
   - File → Export As
   - Choose filename: `icon-[SIZE]x[SIZE].png` (e.g., `icon-192x192.png`)
   - Save in: `/Users/nigelleck/Develop/GRQ-FX-validation/docs/icons/`
   - Click Export
   - In PNG export dialog:
     - Compression: 0 (best quality)
     - Save background color: Unchecked
     - Save color values from transparent pixels: Checked
     - Save resolution: Checked
     - Save creation time: Unchecked
     - Save comment: Unchecked
     - Save color profile: Checked

### Step 4: Batch processing (optional)

If you want to automate this process:

1. File → Export As → icon-512x512.png
2. Then use GIMP's batch processing:
   - Filters → Batch Process
   - Add all your icon files
   - Use "Scale" filter with different sizes
   - Set output directory to the icons folder

## Design Guidelines

### Visual Requirements

- **Background:** Transparent or solid color (avoid gradients for small sizes)
- **Logo:** Should be clearly visible at all sizes
- **Padding:** Leave 10-15% padding around the logo
- **Colors:** Use high contrast colors for small sizes
- **Text:** If your logo has text, ensure it's readable at 16x16

### Technical Requirements

- **Format:** PNG only
- **Color depth:** 32-bit RGBA (supports transparency)
- **Compression:** 0 (lossless)
- **Naming:** Exact format: `icon-[SIZE]x[SIZE].png`

## File Structure After Creation

```
docs/
├── icons/
│   ├── icon-16x16.png
│   ├── icon-32x32.png
│   ├── icon-72x72.png
│   ├── icon-96x96.png
│   ├── icon-128x128.png
│   ├── icon-144x144.png
│   ├── icon-152x152.png
│   ├── icon-167x167.png
│   ├── icon-180x180.png
│   ├── icon-192x192.png
│   ├── icon-384x384.png
│   └── icon-512x512.png
```

## Testing Your Icons

After creating all icons:

1. Open your web app in Chrome
2. Go to Developer Tools → Application → Manifest
3. Check that all icons are loading correctly
4. Test the "Add to Home Screen" functionality
5. Verify icons appear correctly on your device's home screen

## Additional Files Needed

You may also want to create:

- **Splash screens** for iOS (various device sizes)
- **Screenshots** for app store listings (desktop and mobile)
- **Browserconfig.xml** for Windows tiles (optional)

## Notes

- The 512x512 icon is used for the splash screen
- The 192x192 icon is the standard Android icon
- The 180x180 icon is the standard iOS icon
- Smaller icons (16x16, 32x32) are used for browser tabs and bookmarks
- All icons should maintain the same visual identity but may need simplification for smaller sizes
