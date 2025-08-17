import { onRequest } from 'firebase-functions/v2/https';

// Respond to OpenAI requests while handling CORS for campfire.studiotak.co
export const openaiProxy = onRequest(
  { secrets: ['OPENAI_API_KEY'] },
  async (req, res) => {
    const allowedOrigin = 'https://campfire.studiotak.co';
    res.set('Access-Control-Allow-Origin', allowedOrigin);
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'Missing OpenAI API key' });
      return;
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
        res.status(response.status).json(result);
        return;
      }
      res.status(200).json(result);
    } catch (err) {
      console.error('OpenAI proxy error', err);
      res.status(500).json({ error: 'OpenAI request failed' });
    }
  }
);
