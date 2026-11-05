const SUPABASE_URL = process.env.SUPABASE_URL || "https://gdyfcqpbbehozyyjrnah.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Y3JZyVPIcnhPEOIgwxfgZA_fKGGJwHJ";

// Verifies the caller's Supabase session token and returns the user only when
// the email is on the team domain; any other Google account gets null.
async function teamUserFromRequest(req) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ") || auth.length < 20) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: auth },
    });
    if (!r.ok) return null;
    const u = await r.json();
    const email = String(u?.email || "").toLowerCase();
    return email.endsWith("@teamtaparra.com") ? u : null;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Signed-in team members only: this endpoint spends the Anthropic key, so a
  // stranger must not be able to call it (security audit 11/4/26).
  const user = await teamUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ error: "Sign in required" });
  }

  const { text } = req.body || {};
  if (typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ error: "No text provided" });
  }
  if (text.length > 4000) {
    return res.status(413).json({ error: "Text too long" });
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
