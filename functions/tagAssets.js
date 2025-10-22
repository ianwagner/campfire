import { onCall as onCallFn, HttpsError } from 'firebase-functions/v2/https';
import vision from '@google-cloud/vision';
import OpenAI from 'openai';
import sharp from 'sharp';
import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

async function downloadBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

export const generateTagsForAssets = onCallFn({ secrets: ['OPENAI_API_KEY'], memory: '512MiB', timeoutSeconds: 300 }, async (request) => {
  const assets = request.data?.assets || request.data;
  if (!Array.isArray(assets)) {
    throw new HttpsError('invalid-argument', 'assets array is required');
  }

  const visionClient = new vision.ImageAnnotatorClient();
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const results = [];

    for (const asset of assets) {
      const { url, name } = asset || {};
      const result = { url, name };
    try {
      let buffer = await downloadBuffer(url);
      if (buffer.length > 2 * 1024 * 1024) {
        try {
          buffer = await sharp(buffer)
            .resize({ width: 1024, withoutEnlargement: true })
            .jpeg({ quality: 70 })
            .toBuffer();
        } catch (err) {
          console.error('Image compression failed, using original buffer', err?.message || err?.toString());
        }
      }
        const [visionRes] = await visionClient.labelDetection({ image: { content: buffer } });
        const labels = (visionRes.labelAnnotations || []).map((l) => l.description).join(', ');
        let description = labels;
        let type = '';
        try {
          const prompt = `These labels describe an asset: ${labels}. Select the best asset type from ["Lifestyle", "Video", "POW", "Background"] (where POW means product on white) and provide a short, straightforward description such as "a tennis court" or "people on the beach". Respond in JSON {"type":"<type>","description":"<description>"}.`;
          const gpt = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.2,
          });
          const text = gpt.choices?.[0]?.message?.content || '';
          const match = text.match(/\{[\s\S]*?\}/);
          if (!match) throw new Error('OpenAI did not return valid JSON');
          const parsed = JSON.parse(match[0]);
          description = parsed.description || description;
          type = parsed.type || '';
        } catch (err) {
          console.error('OpenAI failed:', err?.message || err?.toString());
        }
        const allowedTypes = ['Lifestyle', 'Video', 'POW', 'Background'];
        if (!allowedTypes.includes(type)) {
          const t = (type || '').toLowerCase();
          if (t.includes('video')) type = 'Video';
          else if (t.includes('white') || t.includes('product')) type = 'POW';
          else if (t.includes('background')) type = 'Background';
          else type = 'Lifestyle';
        }
        result.type = type;
        result.description = description;
      } catch (err) {
        console.error('Failed processing', name || url, err);
        result.error = err.message || 'error';
      }
      results.push(result);
    }

  return { results };
});
