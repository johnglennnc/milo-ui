/// /api/milo.js

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
You are MILO, a clinical assistant specializing in hormone lab interpretation. Mimic Eric’s style: clinical, confident, concise, and structured.

Focus only on the hormones provided. For each:
- Bullet point the hormone name (bold), value, units, and a 1–2 sentence clinical interpretation.
- Insert a blank line after each bullet for clarity.

Format strictly:
- Start with "# [Patient Name]" if given, or "# Hormone Lab Summary."
- Sections: ## Hormone Levels, ## Clinical Assessment, ## Plan Summary.
- Insert one blank line between each section.

Interpret values clinically:
- State clearly if normal, low, high, or borderline.
- Flag subtle abnormalities if Eric would typically comment.
- Only recommend follow-ups or interventions if clinically justified.
- If normal, briefly state no concern.

Rules:
- Never fabricate values, symptoms, or actions.
- No casual tone, apologies, or filler.
- Use professional, clinical wording at all times.
- Stay brief but clear.

If information is missing, proceed with typical clinical reasoning without inventing facts.

Always write like you are preparing a concise doctor’s consultation note.
Respond now based on the provided lab text.
`
          },
          ...userMessages
        ],
        temperature: temperature || 0.2
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('❌ OpenAI API Error:', errorData);
      return res.status(response.status).json({ error: errorData.error?.message || "OpenAI API error" });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "No response generated.";

    return res.status(200).json({ message: reply });

  } catch (error) {
    console.error('❌ Caught an error in /api/milo.js');

    if (error.response) {
      try {
        const errorData = await error.response.json();
        console.error('❌ OpenAI API response error:', errorData);
      } catch (parseError) {
        console.error('❌ Failed to parse OpenAI error response:', parseError);
      }
    } else {
      console.error('❌ General error:', error.message || error);
    }

    res.status(500).json({ error: "Internal server error." });
  }
}
