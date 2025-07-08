// /api/milo.js  – PAGES API ROUTE STYLE (Node runtime)

/* Tell Vercel to run this as a Node.js Serverless Function */
export const config = {
  runtime: 'nodejs',
  maxDuration: 60,   // up to 60 s total, first byte by 25 s
};

export default async function handler(req, res) {
  /* Accept only POST */
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    /* ✅ Body is already parsed by Next.js → use req.body */
    const { model, messages, temperature } = req.body;

    if (!process.env.OPENAI_API_KEY) {
      console.error('❌ Missing OpenAI API Key');
      return res.status(500).json({ error: 'Missing OpenAI API Key' });
    }

    if (!model || !messages) {
      return res.status(400).json({ error: 'Missing model or messages.' });
    }

    /* Call OpenAI */
    const oaRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: temperature ?? 0.2,
      }),
    });

    if (!oaRes.ok) {
      const errText = await oaRes.text();
      console.error('❌ OpenAI API error:', errText);
      return res.status(oaRes.status).json({ error: errText });
    }

    const data  = await oaRes.json();
    const reply = data.choices?.[0]?.message?.content || 'No response generated.';

    /* ✅ Send reply immediately */
    return res.status(200).json({ message: reply });

  } catch (err) {
    console.error('❌ Server error in /api/milo:', err.message || err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}
