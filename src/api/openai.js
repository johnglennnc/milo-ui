// /api/openai.js

import { OpenAI } from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // NOTICE: no NEXT_PUBLIC here. It's secret server-side only
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages, model } = req.body;

  try {
    const completion = await openai.chat.completions.create({
      model: model || 'gpt-4',
      messages,
      temperature: 0.2,
    });

    res.status(200).json({ result: completion.choices[0].message.content });
  } catch (error) {
    console.error('OpenAI Proxy Error:', error);
    res.status(500).json({ error: 'OpenAI request failed.' });
  }
}
