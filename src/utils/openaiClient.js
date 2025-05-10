import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY, // 🔐 Now it pulls from .env.local
  dangerouslyAllowBrowser: true,
});

console.log("🔐 Loaded OpenAI Key:", process.env.NEXT_PUBLIC_OPENAI_API_KEY);

export default openai;
