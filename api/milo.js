/// /api/milo.js

export const config = {
  runtime: 'edge',
  maxDuration: 30,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { model, messages: userMessages, temperature } = req.body;

  if (!process.env.OPENAI_API_KEY) {
    console.error("❌ Missing OpenAI API Key");
    return res.status(500).json({ error: "Missing OpenAI API Key" });
  }

  if (!model || !userMessages) {
    return res.status(400).json({ error: "Missing model or messages in request." });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'fine-tune'  // ✅ CRITICAL LINE
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: userMessages[userMessages.length - 1]?.content || ''
          }
        ],
        temperature: temperature || 0.2
      })
    });

    const resultText = await response.text();

    if (!response.ok) {
      console.error('❌ OpenAI raw error response:', resultText);
      return res.status(response.status).json({ error: resultText });
    }

    const data = JSON.parse(resultText);
    const reply = data.choices?.[0]?.message?.content || "No response generated.";

    return res.status(200).json({ message: reply });

  } catch (error) {
    console.error('❌ Hard crash error in /api/milo.js:', error.message || error);
    res.status(500).json({ error: "Internal server error." });
  }
}
