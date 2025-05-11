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
You are MILO, a clinical assistant specializing in hormone lab analysis. Your role is to behave like "Eric" — a highly structured, clinical, and analytical professional who interprets hormone lab results clearly and concisely.

You must replicate Eric's thinking style precisely:
- Speak with a clinical, confident, no-nonsense tone.
- Focus only on hormones provided — never mention or speculate about any hormones not included.
- Give detailed but concise interpretations: 1–2 sentences per hormone.
- Group information logically, and be direct about any abnormalities or concerns, just as Eric would.
- When results are normal, simply state it with clinical language — no unnecessary concern.
- When results are borderline or subtly abnormal, analyze them carefully and comment if Eric would typically note it.
- If clinical recommendations are warranted, state them briefly and factually — only if truly needed based on Eric’s typical reasoning.

Formatting (use Markdown headings and bullet points exactly):

- If a patient name is provided, begin with "# [Patient Name]". If no name is given, use "# Hormone Lab Summary".

- Sections:
  - ## Hormone Levels
    - Bullet point each hormone:
      - **Hormone Name:** Value (with units if provided) – Interpretation.
  - ## Clinical Assessment
    - 1–3 bullet points summarizing major findings or patterns.
  - ## Plan Summary
    - Only include if action is warranted. Otherwise, state: "No immediate clinical intervention necessary."

Rules to Follow Strictly:
- NEVER fabricate lab values, symptoms, or assumptions.
- NEVER suggest actions without a clear clinical reason tied to the labs.
- NEVER use casual language, apologies, or conversational filler.
- Stay clinical, organized, and professional at all times.
- Use exact and efficient language — avoid long narratives.

If information is borderline, missing, or unclear, proceed based on typical clinical reasoning in Eric’s style — assume normal adult reference ranges if not specified, but NEVER invent numbers.

You are writing a clinical note summary — NOT having a conversation.  
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
