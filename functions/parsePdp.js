import { onCall as onCallFn, HttpsError } from 'firebase-functions/v2/https';
import OpenAI from 'openai';
import cheerio from 'cheerio';
import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
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
    $('img').each((i, el) => {
      if (images.length >= 8) return;
      const src = $(el).attr('src');
      if (src) images.push(absoluteUrl(url, src));
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

    const result = {
      name: parsed.name || title,
      description: Array.isArray(parsed.description)
        ? parsed.description
        : (parsed.description ? [parsed.description] : metaDesc ? [metaDesc] : []),
      benefits: Array.isArray(parsed.benefits)
        ? parsed.benefits
        : (parsed.benefits ? parsed.benefits.split(/[;\n]+/).map((b) => b.trim()).filter(Boolean) : []),
      imageUrls: images,
    };

    return result;
  } catch (err) {
    console.error('parsePdp failed', err);
    if (err instanceof HttpsError) throw err;
    throw new HttpsError('internal', err.message || 'parsePdp failed');
  }
});

