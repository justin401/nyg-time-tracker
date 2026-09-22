// Retired 9/22/26. Clocking in and out now happens in Claude Code with the /clock
// skill (api/clock.js). The page no longer signs anyone in or loads any data.
// The old screens (TimeTracker.jsx, Login.jsx) are kept in the repo, unused, in
// case Justin ever wants them back; the hours themselves are untouched.
export default function App() {
  return (
    <div style={{ minHeight: "100vh", background: "#f5f7fa", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, -apple-system, sans-serif", padding: 24 }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: "40px 36px", maxWidth: 440, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", textAlign: "center" }}>
        <div style={{ fontSize: 13, letterSpacing: 2, color: "#1b5e9c", fontWeight: 700, marginBottom: 14 }}>TOP TIER HAWAII</div>
        <h1 style={{ fontSize: 22, color: "#1a2b3c", margin: "0 0 12px" }}>This site is retired</h1>
        <p style={{ fontSize: 15, color: "#4a5a6a", lineHeight: 1.6, margin: 0 }}>
          Clock in and out in Claude Code. Just say <strong>clock in</strong> or <strong>clock out</strong>.
          Your hours, history and pay stubs are all still there.
        </p>
      </div>
    </div>
  );
}
