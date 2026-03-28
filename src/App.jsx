import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import Login from "./Login";
import TimeTracker from "./TimeTracker";

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
  };

  if (loading) {
    return (
      <div style={{ background: "#0B1219", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#29ABE2", fontFamily: "system-ui" }}>
        Loading...
      </div>
    );
  }

  if (!session) return <Login />;
  return <TimeTracker session={session} onLogout={handleLogout} />;
}
