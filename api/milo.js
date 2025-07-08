// /api/milo.js

// ✅ Use Node.js instead of Edge — avoids 10s timeout
export const config = {
  runtime: 'nodejs',
  maxDuration: 60, // 60 seconds allowed
};

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
    });
  }

  try {
    const { model, messages, temperature } = await req.json();

    // ✅ Check for required environment variable
    if (!process.env.OPENAI_API_KEY) {
      console.error("❌ Missing OpenAI API Key");
      return new Response(JSON.stringify({ error: 'Missing OpenAI API Key' }), {
        status: 500,
      });
    }

    // ✅ Validate request body
    if (!model || !messages) {
      return new Response(JSON.stringify({ error: 'Missing model or messages.' }), {
        status: 400,
      });
    }

    // ✅ Make request to OpenAI
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: temperature || 0.2,
      }),
    });

    // ✅ Handle OpenAI response errors
    if (!openaiResponse.ok) {
      const errorData = await openaiResponse.text();
      console.error('❌ OpenAI API error:', errorData);
      return new Response(JSON.stringify({ error: errorData }), {
        status: openaiResponse.status,
      });
    }

    // ✅ Parse and return result immediately (no delays)
    const data = await openaiResponse.json();
    const reply = data.choices?.[0]?.message?.content || "No response generated.";

    return new Response(JSON.stringify({ message: reply }), {
      status: 200,
    });

  } catch (error) {
    console.error('❌ Error contacting OpenAI:', error.message || error);
    return new Response(JSON.stringify({ error: 'Internal server error.' }), {
      status: 500,
    });
  }
}
