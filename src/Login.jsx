import { useState } from "react";
import { supabase } from "./supabase";

const C = {
  bg: "#0B1219", card: "#15202E",
  accent: "#29ABE2", glow: "0 0 20px rgba(41,171,226,0.3), 0 0 40px rgba(41,171,226,0.1)",
  glowSm: "0 0 10px rgba(41,171,226,0.2)",
  red: "#FF5252", white: "#E8F0FE", dim: "#7B8FA3", border: "#1E3148",
  input: "#0D1520", green: "#00E676",
};

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const [mode, setMode] = useState("login"); // "login" | "forgot"
  const [resetSent, setResetSent] = useState(false);

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

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (!email.trim()) { setError("Enter your email address"); return; }
    setLoading(true);
    setError("");
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (err) {
      setError(err.message);
    } else {
      setResetSent(true);
    }
    setLoading(false);
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError("");
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (err) {
      setError(err.message);
      setLoading(false);
    }
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

        {mode === "forgot" ? (
          resetSent ? (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>&#9993;</div>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Check your email</div>
              <div style={{ fontSize: 13, color: C.dim, marginBottom: 24, lineHeight: 1.5 }}>
                We sent a password reset link to <span style={{ color: C.accent }}>{email}</span>
              </div>
              <button onClick={() => { setMode("login"); setResetSent(false); setError(""); }} style={{
                background: "transparent", border: `1px solid ${C.border}`, color: C.accent,
                padding: "10px 24px", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 14,
              }}>Back to Sign In</button>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword}>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Reset Password</div>
              <div style={{ fontSize: 13, color: C.dim, marginBottom: 20, lineHeight: 1.4 }}>
                Enter your email and we'll send you a reset link.
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.dim, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>Email</label>
                <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }} placeholder="Enter email" autoFocus
                  style={{ width: "100%", padding: 12, borderRadius: 8, border: `1px solid ${error ? C.red : C.border}`, background: C.input, color: C.white, fontSize: 15, boxSizing: "border-box", outline: "none" }} />
              </div>

              {error && (
                <div style={{ color: C.red, fontSize: 13, fontWeight: 600, textAlign: "center", marginBottom: 16, textShadow: `0 0 10px ${C.red}33` }}>{error}</div>
              )}

              <button type="submit" disabled={loading} style={{
                width: "100%", padding: 14, borderRadius: 8, background: C.accent, color: "#fff",
                border: "none", fontWeight: 700, fontSize: 16, cursor: loading ? "default" : "pointer",
                boxShadow: C.glowSm, opacity: loading ? 0.7 : 1, marginBottom: 12,
              }}>{loading ? "Sending..." : "Send Reset Link"}</button>

              <button type="button" onClick={() => { setMode("login"); setError(""); }} style={{
                width: "100%", padding: 10, borderRadius: 8, background: "transparent",
                border: `1px solid ${C.border}`, color: C.dim, fontWeight: 600, fontSize: 14, cursor: "pointer",
              }}>Back to Sign In</button>
            </form>
          )
        ) : (
          <>
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.dim, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>Email</label>
                <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }} placeholder="Enter email" autoFocus
                  style={{ width: "100%", padding: 12, borderRadius: 8, border: `1px solid ${error ? C.red : C.border}`, background: C.input, color: C.white, fontSize: 15, boxSizing: "border-box", outline: "none" }} />
              </div>

              <div style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.dim, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>Password</label>
                <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }} placeholder="Enter password"
                  style={{ width: "100%", padding: 12, borderRadius: 8, border: `1px solid ${error ? C.red : C.border}`, background: C.input, color: C.white, fontSize: 15, boxSizing: "border-box", outline: "none" }} />
              </div>

              <div style={{ textAlign: "right", marginBottom: 20 }}>
                <button type="button" onClick={() => { setMode("forgot"); setError(""); }} style={{
                  background: "none", border: "none", color: C.accent, fontSize: 12, fontWeight: 600,
                  cursor: "pointer", padding: 0, textDecoration: "none",
                }}>Forgot password?</button>
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

            <div style={{ display: "flex", alignItems: "center", margin: "20px 0", gap: 12 }}>
              <div style={{ flex: 1, height: 1, background: C.border }} />
              <span style={{ fontSize: 11, color: C.dim, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>or</span>
              <div style={{ flex: 1, height: 1, background: C.border }} />
            </div>

            <button onClick={handleGoogleSignIn} disabled={loading} style={{
              width: "100%", padding: 12, borderRadius: 8, background: C.input,
              border: `1px solid ${C.border}`, color: C.white, fontWeight: 600, fontSize: 15,
              cursor: loading ? "default" : "pointer", display: "flex", alignItems: "center",
              justifyContent: "center", gap: 10, boxSizing: "border-box",
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Sign in with Google
            </button>
          </>
        )}
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes shake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-10px); } 40% { transform: translateX(10px); } 60% { transform: translateX(-6px); } 80% { transform: translateX(6px); } }
      `}</style>
    </div>
  );
}
