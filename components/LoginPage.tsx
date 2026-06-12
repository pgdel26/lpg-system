"use client";
import { useState } from "react";
import { signInWithPopup, signInWithEmailAndPassword } from "firebase/auth";
import { auth, googleProvider } from "../lib/firebase";
import styles from "./LoginPage.module.css";

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

export default function LoginPage({
  denied,
  deniedEmail,
  onRetry,
}: {
  denied: boolean;
  deniedEmail: string;
  onRetry: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleGoogleSignIn = async () => {
    setEmailError("");
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: unknown) {
      const authErr = err as { code?: string; message?: string };
      if (authErr.code !== "auth/popup-closed-by-user" && authErr.code !== "auth/cancelled-popup-request") {
        const msgs: Record<string, string> = {
          "auth/operation-not-allowed": "Google sign-in is not enabled. Enable it in Firebase Console → Authentication → Sign-in method.",
          "auth/popup-blocked": "Popup was blocked by your browser. Allow popups for this site and try again.",
          "auth/unauthorized-domain": "This domain is not authorized in Firebase Console → Authentication → Settings → Authorized domains.",
        };
        setEmailError(msgs[authErr.code ?? ""] || `Google sign-in failed: ${authErr.message}`);
      }
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError("");
    setSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: unknown) {
      const authErr = err as { code?: string };
      const msgs: Record<string, string> = {
        "auth/invalid-email": "Invalid email address.",
        "auth/user-not-found": "No account found with this email.",
        "auth/wrong-password": "Incorrect password.",
        "auth/invalid-credential": "Incorrect email or password.",
        "auth/too-many-requests": "Too many failed attempts. Try again later.",
      };
      setEmailError(msgs[authErr.code ?? ""] || "Sign-in failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      {/* Background glows */}
      <div className={styles.glowTopRight} />
      <div className={styles.glowBottomLeft} />

      <div className={styles.card}>
        {/* Logo / Brand */}
        <h1 className={styles.brandTitle}>LPG Sales Tracker</h1>
        <p className={styles.brandSub}>Sign in to access the dashboard</p>

        {denied ? (
          /* Access denied state */
          <>
            <div className={styles.deniedBox}>
              <div className={styles.deniedEmoji}>🚫</div>
              <div className={styles.deniedHeading}>Access Denied</div>
              <div className={styles.deniedBody}>
                <strong className={styles.deniedEmail}>{deniedEmail}</strong> is not authorized to access this app.
              </div>
            </div>
            <button onClick={onRetry} className={styles.retryButton}>
              Try a different account
            </button>
          </>
        ) : (
          <>
            {/* Email / password sign-in */}
            <form onSubmit={handleEmailSignIn} className={styles.form}>
              <div className={styles.inputGroup}>
                <input
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className={styles.input}
                />
              </div>
              <div className={styles.inputGroupLast}>
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className={styles.input}
                />
              </div>
              {emailError && (
                <div className={styles.errorBox}>{emailError}</div>
              )}
              <button
                type="submit"
                disabled={submitting}
                className={`${styles.submitButton} ${submitting ? styles.submitting : ""}`}
              >
                {submitting ? "Signing in…" : "Sign In"}
              </button>
            </form>

            {/* Divider */}
            <div className={styles.divider}>
              <div className={styles.dividerLine} />
              <span className={styles.dividerText}>or</span>
              <div className={styles.dividerLine} />
            </div>

            {/* Google sign-in */}
            <button onClick={handleGoogleSignIn} className={styles.googleButton}>
              <GoogleIcon />
              Sign in with Google
            </button>
          </>
        )}
      </div>
    </div>
  );
}
