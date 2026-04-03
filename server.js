const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// ── ZARA API ──
async function scrapeZara(url) {
  try {
    const match = url.match(/p(\d+)/);
    if (!match) return null;
    const productId = match[1];
    const colorMatch = url.match(/v1=(\d+)/);
    const colorId = colorMatch ? colorMatch[1] : null;

    const apiUrl = `https://www.zara.com/us/en/product/${productId}/extra-detail`;
    const res = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.zara.com/',
      }
    });

    if (!res.ok) return null;
    const data = await res.json();

    const name = data?.name || data?.displayName || null;
    const price = data?.price ? `$${(data.price / 100).toFixed(0)}` : null;

    let image = null;
    const colors = data?.detail?.colors || data?.colors || [];
    const selectedColor = colorId ? colors.find(c => c.id == colorId) : colors[0];
    if (selectedColor?.xmedia?.[0]) {
      const media = selectedColor.xmedia[0];
      image = `https://static.zara.net/assets${media.path}/${media.name}-p.jpg?ts=${media.timestamp}&w=750`;
    }

    const color = selectedColor?.name || null;
    return { name, price, image, color };
  } catch (err) {
    console.error('Zara API error:', err.message);
    return null;
  }
}

// ── ARITZIA API ──
async function scrapeAritzia(url) {
  try {
    const match = url.match(/\/(\d+)\.html/);
    if (!match) return null;
    const productId = match[1];
    const colorMatch = url.match(/color=(\d+)/);
    const colorId = colorMatch ? colorMatch[1] : null;

    const apiUrl = `https://www.aritzia.com/api/product/getproduct?productId=${productId}`;
    const res = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.aritzia.com/',
        'x-requested-with': 'XMLHttpRequest',
      }
    });

    if (!res.ok) return null;
    const data = await res.json();

    const name = data?.product?.name || data?.name || null;
    const priceRaw = data?.product?.price || data?.price || null;
    const price = priceRaw ? `$${priceRaw}` : null;

    let image = null;
    const images = data?.product?.images || data?.images || [];
    if (images.length > 0) image = images[0]?.url || images[0]?.src || null;

    const colors = data?.product?.variants || data?.variants || [];
    const selectedColor = colorId ? colors.find(c => c.colorId == colorId) : colors[0];
    const color = selectedColor?.colorName || null;

    return { name, price, image, color };
  } catch (err) {
    console.error('Aritzia API error:', err.message);
    return null;
  }
}

// ── GENERIC FALLBACK via og tags ──
async function scrapeGeneric(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });
    const html = await res.text();

    const getOg = (tag) => {
      const m = html.match(new RegExp(`<meta[^>]+property=["']og:${tag}["'][^>]+content=["']([^"']+)["']`, 'i'))
        || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${tag}["']`, 'i'));
      return m ? m[1] : null;
    };

    const getPriceMeta = () => {
      const patterns = [
        /<meta[^>]+property=["']product:price:amount["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+name=["']price["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+itemprop=["']price["'][^>]+content=["']([^"']+)["']/i,
      ];
      for (const p of patterns) {
        const m = html.match(p);
        if (m) return m[1];
      }
      return null;
    };

    const name = getOg('title');
    const image = getOg('image');
    const priceRaw = getPriceMeta();
    const price = priceRaw ? `$${parseFloat(priceRaw).toFixed(0)}` : null;

    return { name, price, image, color: null };
  } catch (err) {
    console.error('Generic scrape error:', err.message);
    return null;
  }
}

// ── MAIN HANDLER ──
app.get('/scrape', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url parameter required' });

  try {
    let data = null;
    const domain = new URL(url).hostname;

    if (domain.includes('zara.com')) {
      data = await scrapeZara(url);
    } else if (domain.includes('aritzia.com')) {
      data = await scrapeAritzia(url);
    }

    if (!data || (!data.name && !data.price && !data.image)) {
      data = await scrapeGeneric(url);
    }

    res.json({ success: true, data: data || {} });
  } catch (err) {
    console.error('Scrape error:', err.message);
    res.json({ success: false, data: {}, error: err.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Scraper running on port ${PORT}`));
