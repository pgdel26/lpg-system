import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAQlnug8U_CvnyODtaT3unNvLY0FjQvPr8",
  authDomain: "gasul-inventory.firebaseapp.com",
  projectId: "gasul-inventory",
  storageBucket: "gasul-inventory.firebasestorage.app",
  messagingSenderId: "473215094403",
  appId: "1:473215094403:web:0334f6366587cbdf8215b6",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
