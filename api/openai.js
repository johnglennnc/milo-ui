export default async function handler(req, res) {
  const { labText } = req.body;

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "Missing OpenAI API Key" });
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, // ❗ not NEXT_PUBLIC_
    },
    body: JSON.stringify({
      model: "ft:gpt-3.5-turbo-0125:the-bad-company-holdings-llc::BKB3w2h2",
      messages: [
        { role: "system", content: "Analyze the lab results using strict protocol style." },
        { role: "user", content: labText },
      ],
      temperature: 0.2,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("OpenAI Error Response:", data);
    return res.status(500).json({ error: data });
  }

  return res.status(200).json({ result: data.choices[0].message.content });
}
