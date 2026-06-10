import { useEffect, useState, useCallback } from "react";
import { onAuthStateChanged, signInWithPopup, signOut, User } from "firebase/auth";
import { auth, googleProvider } from "../firebase";
import { isEmailAllowed } from "../allowedEmails";

export interface UseAuth {
  authUser: User | null | false; // null = loading, false = logged out
  authLoading: boolean;
  accessDenied: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

export function useAuth(): UseAuth {
  const [authUser, setAuthUser] = useState<User | null | false>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        if (isEmailAllowed(user.email)) {
          setAuthUser(user);
          setAccessDenied(false);
        } else {
          // Not on the whitelist — sign them out immediately
          await signOut(auth);
          setAuthUser(null);
          setAccessDenied(true);
        }
      } else {
        setAuthUser(null);
        setAccessDenied(false);
      }
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  const login = useCallback(async () => { await signInWithPopup(auth, googleProvider); }, []);
  const logout = useCallback(async () => { await signOut(auth); }, []);

  return { authUser, authLoading, accessDenied, login, logout };
}
