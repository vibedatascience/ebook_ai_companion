#!/bin/bash
set -e

echo "📦 Installing npm packages..."
npm install

echo "🌐 Installing Chrome for Puppeteer..."
npx puppeteer browsers install chrome

echo "🔍 Checking Chrome installation..."
ls -la /opt/render/.cache/puppeteer/ || echo "Cache directory doesn't exist yet"

echo "📋 Puppeteer cache directory:"
echo $PUPPETEER_CACHE_DIR

echo "✅ Build complete!"
