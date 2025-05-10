// /api/openaiProxy.js

export default async function handler(req, res) {
  const { model, messages } = req.body;

  try {
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.2,
      }),
    });

    const data = await openaiResponse.json();

    if (openaiResponse.ok) {
      res.status(200).json({ result: data.choices[0].message.content });
    } else {
      console.error("🔥 OpenAI API error:", data);
      res.status(openaiResponse.status).json({ error: data });
    }
  } catch (error) {
    console.error("🔥 Server error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}
