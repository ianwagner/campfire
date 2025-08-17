import functions from 'firebase-functions';

export const openaiProxy = functions
  .runWith({ secrets: ['OPENAI_API_KEY'] })
  .https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', 'https://campfire.studiotak.co');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      return res.status(204).send('');
    }

    if (req.method !== 'POST') {
      return res.status(405).send('Method Not Allowed');
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error('Missing OpenAI API key');
      return res.status(500).json({ error: 'Missing OpenAI API key' });
    }

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(req.body),
      });
      const result = await response.json();
      if (!response.ok) {
        console.error('OpenAI API error', result);
        return res.status(response.status).json(result);
      }
      return res.status(200).json(result);
    } catch (err) {
      console.error('OpenAI proxy error', err);
      return res.status(500).json({ error: 'OpenAI request failed' });
    }
  });
