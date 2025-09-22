# Icon Files

This directory contains favicon and app icons for the セカカレ application.

## Required Icon Files

- `favicon.ico` - Browser favicon (multi-size ICO format)
- `favicon-16x16.png` - 16x16 PNG favicon
- `favicon-32x32.png` - 32x32 PNG favicon
- `apple-touch-icon.png` - 180x180 Apple Touch icon for iOS devices
- `android-chrome-192x192.png` - 192x192 icon for Android Chrome
- `android-chrome-512x512.png` - 512x512 icon for Android Chrome
- `site.webmanifest` - Web app manifest file

## Setup Instructions

The actual icon images need to be manually placed in this directory. The images are available in GitHub Issue #34.

### Image Mapping
1. 192x192 image → `android-chrome-192x192.png`
2. 512x512 image → `android-chrome-512x512.png`
3. 180x180 image → `apple-touch-icon.png`
4. 16x16 image → `favicon-16x16.png`
5. 32x32 image → `favicon-32x32.png`

The `favicon.ico` file should be created from the 32x32 PNG using an ICO converter tool.