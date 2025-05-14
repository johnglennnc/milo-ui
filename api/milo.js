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
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: `
You are MILO, a clinical assistant specializing in hormone lab interpretation...
(etc. your normal system prompt)
`
          },
          ...userMessages
        ],
        temperature: temperature || 0.2
      })
    });

    const resultText = await response.text();  // <-- Always read as text first

    if (!response.ok) {
      console.error('❌ OpenAI error response:', resultText);
      return res.status(response.status).json({ error: resultText });
    }

    const data = JSON.parse(resultText);  // <-- Only parse after confirming 2xx OK
    const reply = data.choices?.[0]?.message?.content || "No response generated.";

    return res.status(200).json({ message: reply });

  } catch (error) {
    console.error('❌ Hard crash in /api/milo.js:', error.message || error);
    res.status(500).json({ error: "Internal server error." });
  }
}
