const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

const app = express();
app.use(cors());
app.use(express.json());

async function scrapeProduct(url) {
  let browser;
  try {
    browser = await puppeteer.launch({
      args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
      defaultViewport: { width: 1280, height: 900 },
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();

    // Hide automation signals
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'plugins', { get: () => [1,2,3] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      window.chrome = { runtime: {} };
    });

    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    });

    // Intercept JSON API responses that might contain product data
    let productData = {};
    page.on('response', async response => {
      try {
        const respUrl = response.url();
        const ct = response.headers()['content-type'] || '';
        if (ct.includes('json') && (
          respUrl.includes('product') ||
          respUrl.includes('pdp') ||
          respUrl.includes('item') ||
          respUrl.includes('catalog')
        )) {
          const json = await response.json();
          // Try to extract common product fields from API response
          const flat = JSON.stringify(json);
          if (flat.includes('price') || flat.includes('name')) {
            productData = { ...productData, _raw: json };
          }
        }
      } catch {}
    });

    // Try with shorter timeout and domcontentloaded
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    } catch {
      // If navigation times out, try to extract what we have
    }
    await new Promise(r => setTimeout(r, 3000));

    const data = await page.evaluate(() => {
      // ── NAME ──
      const nameSelectors = [
        'h1',
        '[class*="product-name"]',
        '[class*="product-title"]',
        '[data-testid*="product-name"]',
        '[data-testid*="title"]',
        '.pdp-title',
        '.product__title',
        '[itemprop="name"]',
      ];
      let name = null;
      for (const sel of nameSelectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent.trim().length > 2 && !el.textContent.includes('www.')) {
          name = el.textContent.trim();
          break;
        }
      }

      // ── PRICE ──
      const priceSelectors = [
        '[itemprop="price"]',
        '[class*="product-price"]:not([class*="was"]):not([class*="original"])',
        '[class*="price"]:not([class*="was"]):not([class*="original"]):not([class*="compare"])',
        '[data-testid*="price"]',
        '.price',
        '.product__price',
      ];
      let price = null;
      for (const sel of priceSelectors) {
        const el = document.querySelector(sel);
        if (el) {
          const text = el.getAttribute('content') || el.textContent.trim();
          const match = text.match(/[\$£€]\s?[\d,]+\.?\d{0,2}/);
          if (match) { price = match[0]; break; }
        }
      }

      // ── IMAGE ── try og:image first (most reliable)
      let image = null;
      const ogImg = document.querySelector('meta[property="og:image"]');
      if (ogImg) image = ogImg.getAttribute('content');

      if (!image) {
        const imgSelectors = [
          '[class*="product-image"] img',
          '[class*="product-media"] img',
          '[class*="pdp"] img',
          '[class*="gallery"] img',
          'main img',
          '[data-testid*="image"] img',
        ];
        for (const sel of imgSelectors) {
          const el = document.querySelector(sel);
          if (el && el.src && !el.src.includes('logo') && !el.src.includes('icon')) {
            image = el.src;
            break;
          }
        }
      }

      // ── COLOR ──
      const colorSelectors = [
        '[class*="color-name"]',
        '[class*="colour-name"]',
        '[class*="swatch-label"]',
        '[data-testid*="color"]',
        '[class*="selected-color"]',
      ];
      let color = null;
      for (const sel of colorSelectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent.trim() && !/^\d+$/.test(el.textContent.trim())) {
          color = el.textContent.trim();
          break;
        }
      }

      // ── OG fallbacks ──
      if (!name) {
        const ogTitle = document.querySelector('meta[property="og:title"]');
        if (ogTitle) name = ogTitle.getAttribute('content');
      }

      return { name, price, image, color };
    });

    return data;
  } finally {
    if (browser) await browser.close();
  }
}

    const data = await page.evaluate(() => {
      // ── NAME ──
      const nameSelectors = [
        'h1',
        '[class*="product-name"]',
        '[class*="product-title"]',
        '[data-testid*="product-name"]',
        '[data-testid*="title"]',
        '.pdp-title',
        '.product__title',
      ];
      let name = null;
      for (const sel of nameSelectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent.trim().length > 2) {
          name = el.textContent.trim();
          break;
        }
      }

      // ── PRICE ──
      const priceSelectors = [
        '[class*="product-price"]:not([class*="was"]):not([class*="original"])',
        '[class*="price"]:not([class*="was"]):not([class*="original"]):not([class*="compare"])',
        '[data-testid*="price"]',
        '.price',
        '.product__price',
        '[itemprop="price"]',
      ];
      let price = null;
      for (const sel of priceSelectors) {
        const el = document.querySelector(sel);
        if (el) {
          const text = el.textContent.trim();
          const match = text.match(/[\$£€]\s?[\d,]+\.?\d{0,2}/);
          if (match) { price = match[0]; break; }
        }
      }

      // ── IMAGE ──
      const imgSelectors = [
        '[class*="product-image"] img',
        '[class*="product-media"] img',
        '[class*="pdp"] img',
        '[class*="gallery"] img',
        'main img',
        '[data-testid*="image"] img',
      ];
      let image = null;
      for (const sel of imgSelectors) {
        const el = document.querySelector(sel);
        if (el && el.src && !el.src.includes('logo') && !el.src.includes('icon') && el.naturalWidth > 200) {
          image = el.src;
          break;
        }
      }
      // fallback: largest image on page
      if (!image) {
        const imgs = Array.from(document.querySelectorAll('img'));
        const best = imgs
          .filter(i => i.naturalWidth > 300 && !i.src.includes('logo') && !i.src.includes('icon'))
          .sort((a, b) => b.naturalWidth - a.naturalWidth)[0];
        if (best) image = best.src;
      }

      // ── COLOR ──
      const colorSelectors = [
        '[class*="color-name"]',
        '[class*="colour-name"]',
        '[class*="swatch-label"]',
        '[data-testid*="color"]',
        '[class*="selected-color"]',
      ];
      let color = null;
      for (const sel of colorSelectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent.trim() && !/^\d+$/.test(el.textContent.trim())) {
          color = el.textContent.trim();
          break;
        }
      }

      return { name, price, image, color };
    });

    return data;
  } finally {
    if (browser) await browser.close();
  }
}

app.get('/scrape', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url parameter required' });
  try {
    const data = await scrapeProduct(url);
    res.json({ success: true, data });
  } catch (err) {
    console.error('Scrape error:', err.message);
    res.json({ success: false, data: {}, error: err.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Scraper running on port ${PORT}`));
