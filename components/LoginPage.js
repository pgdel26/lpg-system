"use client";
import { useState } from "react";
import { signInWithPopup, signInWithEmailAndPassword } from "firebase/auth";
import { auth, googleProvider } from "../lib/firebase";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

export default function LoginPage({ denied, deniedEmail, onRetry }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleGoogleSignIn = async () => {
    setEmailError("");
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      if (err.code !== "auth/popup-closed-by-user" && err.code !== "auth/cancelled-popup-request") {
        const msgs = {
          "auth/operation-not-allowed": "Google sign-in is not enabled. Enable it in Firebase Console → Authentication → Sign-in method.",
          "auth/popup-blocked": "Popup was blocked by your browser. Allow popups for this site and try again.",
          "auth/unauthorized-domain": "This domain is not authorized in Firebase Console → Authentication → Settings → Authorized domains.",
        };
        setEmailError(msgs[err.code] || `Google sign-in failed: ${err.message}`);
      }
    }
  };

  const handleEmailSignIn = async (e) => {
    e.preventDefault();
    setEmailError("");
    setSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      const msgs = {
        "auth/invalid-email": "Invalid email address.",
        "auth/user-not-found": "No account found with this email.",
        "auth/wrong-password": "Incorrect password.",
        "auth/invalid-credential": "Incorrect email or password.",
        "auth/too-many-requests": "Too many failed attempts. Try again later.",
      };
      setEmailError(msgs[err.code] || "Sign-in failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle = {
    width: "100%", padding: "11px 14px", borderRadius: "10px",
    border: "1px solid rgba(255,255,255,0.15)",
    background: "rgba(255,255,255,0.07)", color: "#fff",
    fontSize: "14px", fontFamily: "inherit", outline: "none",
    boxSizing: "border-box",
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "linear-gradient(135deg, #0f172a 0%, #1e3a8a 60%, #1d4ed8 100%)",
      position: "relative", overflow: "hidden",
    }}>
      {/* Background glows */}
      <div style={{ position: "absolute", top: "-200px", right: "-200px", width: "600px", height: "600px", background: "radial-gradient(circle, rgba(59,130,246,0.15) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: "-300px", left: "-200px", width: "700px", height: "700px", background: "radial-gradient(circle, rgba(37,99,235,0.1) 0%, transparent 70%)", pointerEvents: "none" }} />

      <div style={{
        background: "rgba(255,255,255,0.04)", backdropFilter: "blur(20px)",
        border: "1px solid rgba(255,255,255,0.1)", borderRadius: "20px",
        padding: "48px 40px", width: "100%", maxWidth: "400px",
        textAlign: "center", position: "relative",
        boxShadow: "0 32px 80px rgba(0,0,0,0.4)",
      }}>
        {/* Logo / Brand */}
        <h1 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", marginBottom: "6px" }}>
          LPG Sales Tracker
        </h1>
        <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)", marginBottom: "36px" }}>
          Sign in to access the dashboard
        </p>

        {denied ? (
          /* Access denied state */
          <>
            <div style={{
              padding: "14px 16px", borderRadius: "10px", marginBottom: "24px",
              background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)",
            }}>
              <div style={{ fontSize: "20px", marginBottom: "8px" }}>🚫</div>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#f87171", marginBottom: "4px" }}>
                Access Denied
              </div>
              <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>
                <strong style={{ color: "rgba(255,255,255,0.7)" }}>{deniedEmail}</strong> is not authorized to access this app.
              </div>
            </div>
            <button
              onClick={onRetry}
              style={{
                width: "100%", padding: "12px 16px", borderRadius: "10px",
                border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer",
                background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.7)",
                fontSize: "13px", fontWeight: 600, fontFamily: "inherit",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.12)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.07)"}
            >
              Try a different account
            </button>
          </>
        ) : (
          <>
            {/* Email / password sign-in */}
            <form onSubmit={handleEmailSignIn} style={{ textAlign: "left" }}>
              <div style={{ marginBottom: "12px" }}>
                <input
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  style={inputStyle}
                />
              </div>
              <div style={{ marginBottom: "16px" }}>
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  style={inputStyle}
                />
              </div>
              {emailError && (
                <div style={{
                  marginBottom: "14px", padding: "10px 12px", borderRadius: "8px",
                  background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)",
                  fontSize: "12px", color: "#f87171",
                }}>
                  {emailError}
                </div>
              )}
              <button
                type="submit"
                disabled={submitting}
                style={{
                  width: "100%", padding: "12px 16px", borderRadius: "10px",
                  border: "none", cursor: submitting ? "not-allowed" : "pointer",
                  background: submitting ? "rgba(37,99,235,0.4)" : "rgba(37,99,235,0.8)", color: "#fff",
                  fontSize: "14px", fontWeight: 600, fontFamily: "inherit",
                  transition: "all 0.15s",
                }}
              >
                {submitting ? "Signing in…" : "Sign In"}
              </button>
            </form>

            {/* Divider */}
            <div style={{
              display: "flex", alignItems: "center", gap: "12px",
              margin: "20px 0",
            }}>
              <div style={{ flex: 1, height: "1px", background: "rgba(255,255,255,0.1)" }} />
              <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", fontWeight: 500 }}>or</span>
              <div style={{ flex: 1, height: "1px", background: "rgba(255,255,255,0.1)" }} />
            </div>

            {/* Google sign-in */}
            <button
              onClick={handleGoogleSignIn}
              style={{
                width: "100%", padding: "11px 16px", borderRadius: "10px",
                border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer",
                background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.8)",
                fontSize: "13px", fontWeight: 600, fontFamily: "inherit",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.12)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.07)"}
            >
              <GoogleIcon />
              Sign in with Google
            </button>
          </>
        )}
      </div>
    </div>
  );
}
