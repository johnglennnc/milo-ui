// /api/openai.js

// ✅ Explicitly tell Vercel this is a Node.js function
export const config = {
  runtime: 'nodejs',
  maxDuration: 60,          // up to 60 s total, must send first byte by 25 s
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { labText } = req.body;

    if (!process.env.OPENAI_API_KEY) {
      console.error('❌ Missing OpenAI API Key');
      return res.status(500).json({ error: 'Missing OpenAI API Key' });
    }

    if (!labText) {
      return res.status(400).json({ error: 'Missing labText in request.' });
    }

    // 👉 Call OpenAI
    const oaRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'ft:gpt-3.5-turbo-0125:the-bad-company-holdings-llc::BKB3w2h2',
        messages: [
          { role: 'system', content: 'Analyze the lab results using strict protocol style.' },
          { role: 'user',    content: labText },
        ],
        temperature: 0.2,
      }),
    });

    if (!oaRes.ok) {
      const errText = await oaRes.text();
      console.error('❌ OpenAI API error:', errText);
      return res.status(oaRes.status).json({ error: errText });
    }

    const data = await oaRes.json();
    const reply = data.choices?.[0]?.message?.content || 'No response generated.';

    // ✅ Send the reply immediately
    return res.status(200).json({ result: reply });

  } catch (err) {
    console.error('❌ Server error in /api/openai:', err.message || err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}
