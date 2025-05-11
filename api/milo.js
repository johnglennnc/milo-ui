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
You are MILO, a clinical assistant specializing in hormone lab interpretation. Mimic the clinical style of "Eric": structured, confident, concise, and professional.

Follow these exact formatting rules:

1. Start with "# [Patient Name]" if provided, or "# Hormone Lab Summary" if no name is given.
2. Structure the report into three sections:
   - ## Hormone Levels
   - ## Clinical Assessment
   - ## Plan Summary

3. For each hormone:
   - Begin a new paragraph with the hormone name in bold, followed by the value (with units), a period (.), and a clinical interpretation.
   - Do NOT use any hyphens (-), bullets, or list formatting inside sections.
   - Example format:

     **Estradiol:** 41 pg/mL. Low; consistent with postmenopausal levels.

4. After each hormone paragraph, insert a full blank line for separation.

5. In Plan Summary:
   - Write each recommendation as a standalone mini-paragraph.
   - Do not number the plan items (no 1., 2., 3.).
   - Insert a blank line after each recommendation.

Clinical Content Rules:
- Interpret each hormone clearly as low, normal, high, or borderline.
- Comment on every hormone provided; none can be skipped.
- Only recommend interventions if clinically appropriate.
- Never fabricate lab values, symptoms, or actions.
- Use professional clinical language — no casual phrasing, no apologies, no filler.

Formatting Priority:
- You are preparing a printed clinical report, not a chat conversation or Markdown document.
- Maintain clean, readable spacing throughout.
- Blank lines must separate every item and section.
- No Markdown bullets, numbers, or hyphens should be used.

Proceed now based on the provided lab data.
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
