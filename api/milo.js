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
- Create a bullet point with **bolded hormone name**, value (with units), and a short clinical interpretation (1–2 sentences).
- After each bullet point, **insert two hard returns (two newlines)** to create a visible blank line before the next bullet. This is mandatory for readability.

Format strictly:
- Start with "# [Patient Name]" if given, or "# Hormone Lab Summary" if no name is provided.
- Use these sections, with a full blank line between each:
  - ## Hormone Levels
  - ## Clinical Assessment
  - ## Plan Summary

Interpret values clinically:
- Clearly state if each value is low, normal, high, or borderline based on typical clinical standards.
- Always comment on every lab value provided. No labs may be skipped.
- Do not assume adequacy; classify values based on standards unless otherwise justified.

Strict Rules:
- Only comment on hormones or labs explicitly given. Never refer to labs not listed.
- Never fabricate values, symptoms, or actions.
- Use clinical wording. No casual language, no apologies, no extra commentary.
- Maintain professional spacing and structure for easy reading.

If any information is missing, reason based on typical clinical standards without inventing specifics.

Always write like you are preparing a clean, professional clinical report.
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
