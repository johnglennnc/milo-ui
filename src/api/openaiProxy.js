export async function sendLabTextToOpenAI(labText) {
  const response = await fetch("/api/openai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ labText }),
  });

  if (!response.ok) {
    throw new Error("Failed to get response from server");
  }

  const data = await response.json();
  return data.result; // whatever OpenAI gave us
}
