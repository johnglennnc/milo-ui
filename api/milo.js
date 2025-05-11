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
2. Structure the report into three sections, each with a header:
   - ## Hormone Levels
   - ## Clinical Assessment
   - ## Plan Summary
3. For each hormone:
   - Begin a new paragraph with the hormone name in bold, followed by the value (with units) and a clinical interpretation.
   - Example format:
     
     **Estradiol:** 41 pg/mL — Low; consistent with postmenopausal levels.

4. Insert a full blank line (two hard returns) after each hormone's paragraph for visual separation.
5. Do NOT use hyphens (-), numbered lists (1., 2., 3.), or any list formatting inside sections.
6. Write each plan recommendation as a mini-paragraph, also separated by a blank line.
7. Ensure readability by maintaining clean spacing between all entries and sections.

Clinical Content Rules:
- Interpret each hormone based on typical clinical standards.
- Comment on every lab value provided; none can be skipped.
- Do not assume "adequacy" unless specifically supported by context.
- Only recommend interventions if clinically appropriate based on lab results.
- Never fabricate lab values, symptoms, or actions.
- Use clinical, professional wording — no casual phrases, no filler, no apologies.

Formatting Priority:
- You are writing a printed clinical report for a medical record, not a chat or Markdown document.
- Maintain precise, readable paragraph spacing throughout.

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
