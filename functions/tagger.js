const functions = require('firebase-functions');
const { google } = require('googleapis');
const vision = require('@google-cloud/vision');
const { Configuration, OpenAIApi } = require('openai');
const path = require('path');
const os = require('os');
const fs = require('fs').promises;

async function listImages(folderId, drive) {
  const res = await drive.files.list({
    q: `'${folderId}' in parents and mimeType contains 'image/' and trashed=false`,
    fields: 'files(id,name,webContentLink,mimeType)',
  });
  return res.data.files || [];
}

module.exports.onCall = functions.https.onCall(async (data, context) => {
  const { driveFolderUrl, campaign } = data || {};
  console.log('Tagger called with data:', { driveFolderUrl, campaign });
  if (!driveFolderUrl || driveFolderUrl.trim() === '') {
    throw new functions.https.HttpsError('invalid-argument', 'Missing driveFolderUrl');
  }
  const match = /\/folders\/([^/?]+)/.exec(driveFolderUrl);
  if (!match) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid driveFolderUrl');
  }
  const folderId = match[1];

const auth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/drive.readonly'] });
const authClient = await auth.getClient();
const drive = google.drive({ version: 'v3', auth: authClient });
  const visionClient = new vision.ImageAnnotatorClient();
  const openai = new OpenAIApi(new Configuration({ apiKey: process.env.OPENAI_API_KEY }));

  const files = await listImages(folderId, drive);
  const results = [];
  for (const file of files) {
    try {
      const dest = path.join(os.tmpdir(), file.id);
      const dl = await drive.files.get({ fileId: file.id, alt: 'media' }, { responseType: 'arraybuffer' });
      await fs.writeFile(dest, dl.data);
      const [visionRes] = await visionClient.labelDetection(dest);
      await fs.unlink(dest).catch(() => {});
      const labels = (visionRes.labelAnnotations || []).map(l => l.description).join(', ');
      let description = labels;
      let type = '';
      let product = '';
      try {
        const prompt = `These labels describe an asset: ${labels}. Provide a short description, asset type, and product in JSON {description, type, product}.`;
        const gpt = await openai.createChatCompletion({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
        });
        const text = gpt.data.choices?.[0]?.message?.content || '';
        const parsed = JSON.parse(text);
        description = parsed.description || description;
        type = parsed.type || '';
        product = parsed.product || '';
      } catch (err) {
        console.error('OpenAI failed', err);
      }
      results.push({
        name: file.name,
        url: file.webContentLink,
        type,
        description,
        product,
        campaign,
      });
    } catch (err) {
      console.error('Failed to process file', file.name, err);
    }
  }
  return results;
});
