export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { text } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: "No text provided" });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-20250514",
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: `Rewrite this work log entry to sound more formal and corporate for a client invoice. Keep it concise (1-3 sentences max). No preamble, no quotation marks, no em dashes. Just the polished text. Original: "${text}"`,
        }],
      }),
    });

    const data = await response.json();
    const polished = data.content?.find((b) => b.type === "text")?.text || text;
    return res.status(200).json({ polished });
  } catch (error) {
    console.error("Polish error:", error);
    return res.status(500).json({ error: "Failed to polish text" });
  }
}
