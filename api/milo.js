/// /api/milo.js

export const config = {
  runtime: 'edge',
  maxDuration: 30,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages: userMessages, temperature } = req.body;

  if (!process.env.OPENAI_API_KEY) {
    console.error("❌ Missing OpenAI API Key");
    return res.status(500).json({ error: "Missing OpenAI API Key" });
  }

  if (!userMessages) {
    return res.status(400).json({ error: "Missing messages in request." });
  }

  const systemPrompt = `
You are MILO, a clinical assistant specializing in hormone lab interpretation. Mimic the clinical style of "Eric": structured, confident, concise, and professional.

Follow this exact format:

# [Patient Name]

## Hormone Levels

**Estradiol:** 41 pg/mL. Low; consistent with postmenopausal levels.

(blank line)

**Progesterone:** 6.8 ng/mL. Suboptimal; consider supplementation.

(blank line)

**Total Testosterone:** 38 ng/dL. Normal.

(blank line)

## Clinical Assessment

Summarize key findings here as a clean paragraph.

(blank line)

## Plan Summary

State each recommendation as a mini-paragraph.

(blank line between each item)

Formatting Rules:
- No hyphens (-) anywhere.
- No numbered lists (1., 2., 3.).
- Insert a full blank line between each hormone and each plan recommendation.
- Maintain a clean, paragraph style clinical report.

Content Rules:
- Comment on every hormone provided; none can be skipped.
- Accurately classify low, normal, or high results.
- Recommend actions only when clinically justified.
- Never fabricate values, symptoms, or interventions.

Proceed now based on the provided lab data.
  `.trim();

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4',  // ✅ You can change to 'gpt-3.5-turbo-0125' if you want cheaper calls
        messages: [
          { role: 'system', content: systemPrompt },
          ...userMessages
        ],
        temperature: temperature || 0.2
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ OpenAI API error:', data);
      return res.status(response.status).json({ error: data.error?.message || "OpenAI API error" });
    }

    const reply = data.choices?.[0]?.message?.content || "No response generated.";

    return res.status(200).json({ message: reply });

  } catch (error) {
    console.error('❌ Server crash error:', error);
    res.status(500).json({ error: "Internal server error." });
  }
}
