// Retired with the website. Keep this route so old callers fail closed.
export default function handler(_req, res) {
  return res.status(410).json({ error: "retired" });
}
