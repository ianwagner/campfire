import functions from 'firebase-functions';

export const openaiProxy = functions
  .runWith({ secrets: ['OPENAI_API_KEY'] })
  .https.onCall(async (data) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Missing OpenAI API key'
      );
    }
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok) {
        console.error('OpenAI API error', result);
        throw new functions.https.HttpsError('internal', 'OpenAI API error', result);
      }
      return result;
    } catch (err) {
      console.error('OpenAI proxy error', err);
      throw new functions.https.HttpsError('internal', 'OpenAI request failed');
    }
  });
