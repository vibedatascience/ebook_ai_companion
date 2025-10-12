#!/bin/bash
set -e

echo "📦 Installing npm packages..."
npm install

echo "🌐 Installing Chrome for Puppeteer..."
npx puppeteer browsers install chrome

echo ""
echo "🔍 Checking Chrome installation..."
if [ -d "/opt/render/.cache/puppeteer" ]; then
  echo "✅ Cache directory exists:"
  ls -la /opt/render/.cache/puppeteer/

  echo ""
  echo "🔎 Looking for Chrome executable..."
  find /opt/render/.cache/puppeteer -name "chrome" -type f 2>/dev/null || echo "⚠️ Chrome executable not found"

  echo ""
  echo "📁 All files in cache directory:"
  find /opt/render/.cache/puppeteer -type f 2>/dev/null | head -20
else
  echo "❌ Cache directory doesn't exist at /opt/render/.cache/puppeteer"
fi

echo ""
echo "📋 Environment variables:"
echo "PUPPETEER_CACHE_DIR=$PUPPETEER_CACHE_DIR"
echo "PUPPETEER_SKIP_DOWNLOAD=$PUPPETEER_SKIP_DOWNLOAD"
echo "NODE_VERSION=$NODE_VERSION"

echo ""
echo "🔍 Trying to locate Chrome with node..."
node -e "
const puppeteer = require('puppeteer');
try {
  console.log('Chrome path from Puppeteer:', puppeteer.executablePath());
} catch (err) {
  console.error('Error getting Chrome path:', err.message);
}
"

echo ""
echo "✅ Build complete!"
