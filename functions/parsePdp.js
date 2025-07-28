import { onCall as onCallFn, HttpsError } from 'firebase-functions/v2/https';
import OpenAI from 'openai';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const cheerio = require('cheerio');
import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

function slugify(str = '') {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function absoluteUrl(base, url) {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('//')) return 'https:' + url;
  try {
    const b = new URL(base);
    return new URL(url, b).toString();
  } catch {
    return url;
  }
}

export const parsePdp = onCallFn({ secrets: ['OPENAI_API_KEY'], timeoutSeconds: 60, memory: '512MiB' }, async (request) => {
  try {
    const url = request.data?.url || request.data;
    if (!url || typeof url !== 'string') {
      throw new HttpsError('invalid-argument', 'url is required');
    }

    const res = await fetch(url);
    if (!res.ok) {
      throw new HttpsError('failed-precondition', `Failed to fetch URL: ${res.status}`);
    }
    const html = await res.text();
    const $ = cheerio.load(html);

    const title = $('meta[property="og:title"]').attr('content') || $('title').text() || '';
    const metaDesc = $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content') || '';

    const images = [];
    const seen = new Set();
    const addImage = (src, alt = '') => {
      if (!src) return;
      const abs = absoluteUrl(url, src);
      if (abs && !seen.has(abs)) {
        seen.add(abs);
        images.push({ src: abs, alt: alt.toLowerCase() });
      }
    };

    // Open Graph, Twitter, and link rel images
    addImage($("meta[property='og:image']").attr('content'));
    addImage($("meta[name='twitter:image']").attr('content'));
    addImage($("link[rel='image_src']").attr('href'));

    // JSON-LD images
    const extractImages = (obj) => {
      if (!obj) return;
      if (Array.isArray(obj)) return obj.forEach(extractImages);
      if (typeof obj === 'object') {
        if (obj.image) {
          if (Array.isArray(obj.image)) obj.image.forEach((v) => extractImages(v));
          else if (typeof obj.image === 'object') extractImages(obj.image.url || obj.image);
          else addImage(obj.image);
        }
        Object.values(obj).forEach((v) => {
          if (typeof v === 'object') extractImages(v);
        });
      }
    };
    $('script[type="application/ld+json"]').each((i, el) => {
      try {
        const data = JSON.parse($(el).contents().text());
        extractImages(data);
      } catch {}
    });

    // <img> tags with srcset or lazy attributes
    $('img').each((i, el) => {
      if (images.length >= 30) return false;
      const $el = $(el);
      const width = parseInt($el.attr('width'), 10);
      const height = parseInt($el.attr('height'), 10);
      if ((width && width < 50) || (height && height < 50)) return;

      const srcset = $el.attr('srcset');
      if (srcset) {
        srcset.split(',').forEach((item) => addImage(item.trim().split(' ')[0], $el.attr('alt') || ''));
      }
      addImage($el.attr('data-src') || $el.attr('data-lazy'), $el.attr('alt') || '');
      addImage($el.attr('src'), $el.attr('alt') || '');
    });

    const bodyText = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 8000);
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const prompt = `Extract product information from the following text. Return JSON with keys name, description (array of sentences), and benefits (array). Text: ${bodyText}`;
    const gpt = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
    });
    const text = gpt.choices?.[0]?.message?.content || '';
    const match = text.match(/\{[\s\S]*?\}/);
    let parsed = {};
    if (match) {
      try { parsed = JSON.parse(match[0]); } catch { parsed = {}; }
    }

    const name = parsed.name || title;
    const slug = slugify(name);

    const prioritized = images.filter((img) => {
      const src = img.src.toLowerCase();
      const alt = img.alt || '';
      return slug && (src.includes(slug) || alt.includes(name.toLowerCase()));
    });
    const others = images.filter((img) => !prioritized.includes(img));
    const ordered = [...prioritized, ...others];
    const imageUrls = ordered.map((i) => i.src).slice(0, 8);

    const result = {
      name: parsed.name || title,
      description: Array.isArray(parsed.description)
        ? parsed.description
        : (parsed.description ? [parsed.description] : metaDesc ? [metaDesc] : []),
      benefits: Array.isArray(parsed.benefits)
        ? parsed.benefits
        : (parsed.benefits ? parsed.benefits.split(/[;\n]+/).map((b) => b.trim()).filter(Boolean) : []),
      imageUrls,
    };

    return result;
  } catch (err) {
    console.error('parsePdp failed', err);
    if (err instanceof HttpsError) throw err;
    throw new HttpsError('internal', err.message || 'parsePdp failed');
  }
});

