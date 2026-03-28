import { useState } from "react";
import { supabase } from "./supabase";

const C = {
  bg: "#0B1219", card: "#15202E",
  accent: "#29ABE2", glow: "0 0 20px rgba(41,171,226,0.3), 0 0 40px rgba(41,171,226,0.1)",
  glowSm: "0 0 10px rgba(41,171,226,0.2)",
  red: "#FF5252", white: "#E8F0FE", dim: "#7B8FA3", border: "#1E3148",
  input: "#0D1520",
};

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) {
      setError(err.message);
      setShake(true);
      setTimeout(() => setShake(false), 500);
    }
    setLoading(false);
  };

  return (
    <div style={{
      fontFamily: "system-ui, -apple-system, sans-serif",
      background: C.bg, minHeight: "100vh",
      display: "flex", alignItems: "center", justifyContent: "center", color: C.white,
    }}>
      <div style={{
        background: C.card, borderRadius: 16, padding: 40,
        border: `1px solid ${C.border}`, boxShadow: C.glow,
        width: 380, maxWidth: "90vw",
        animation: shake ? "shake 0.5s ease-in-out" : "fadeIn 0.6s ease-out",
      }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: 1 }}>NYG LLC</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.accent, letterSpacing: 2.5, textShadow: C.glowSm, marginTop: 4 }}>
            SERVICED AT THE HIGHEST LEVEL
          </div>
          <div style={{ width: 60, height: 3, background: C.accent, borderRadius: 2, margin: "16px auto 0", boxShadow: C.glowSm }} />
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.dim, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>Email</label>
            <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }} placeholder="Enter email" autoFocus
              style={{ width: "100%", padding: 12, borderRadius: 8, border: `1px solid ${error ? C.red : C.border}`, background: C.input, color: C.white, fontSize: 15, boxSizing: "border-box", outline: "none" }} />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.dim, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>Password</label>
            <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }} placeholder="Enter password"
              style={{ width: "100%", padding: 12, borderRadius: 8, border: `1px solid ${error ? C.red : C.border}`, background: C.input, color: C.white, fontSize: 15, boxSizing: "border-box", outline: "none" }} />
          </div>

          {error && (
            <div style={{ color: C.red, fontSize: 13, fontWeight: 600, textAlign: "center", marginBottom: 16, textShadow: `0 0 10px ${C.red}33` }}>{error}</div>
          )}

          <button type="submit" disabled={loading} style={{
            width: "100%", padding: 14, borderRadius: 8, background: C.accent, color: "#fff",
            border: "none", fontWeight: 700, fontSize: 16, cursor: loading ? "default" : "pointer",
            boxShadow: C.glowSm, opacity: loading ? 0.7 : 1,
          }}>{loading ? "Signing in..." : "Sign In"}</button>
        </form>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes shake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-10px); } 40% { transform: translateX(10px); } 60% { transform: translateX(-6px); } 80% { transform: translateX(6px); } }
      `}</style>
    </div>
  );
}
