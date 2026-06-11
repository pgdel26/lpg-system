import { useEffect, useState, useCallback } from "react";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { auth } from "../firebase";
import { isEmailAllowed } from "../allowedEmails";

export interface UseAuth {
  authUser: User | null; // null = not yet resolved (loading) or signed out
  authLoading: boolean;
  accessDenied: boolean;
  logout: () => Promise<void>;
}

export function useAuth(): UseAuth {
  const [authUser, setAuthUser] = useState<User | null>(null);
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

  const logout = useCallback(async () => { await signOut(auth); }, []);

  return { authUser, authLoading, accessDenied, logout };
}
