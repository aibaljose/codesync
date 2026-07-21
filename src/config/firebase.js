import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAOQAc7MUNtkMhKcvk5HB-huVS5w1wUOrU",
  authDomain: "codesync-fd195.firebaseapp.com",
  projectId: "codesync-fd195",
  storageBucket: "codesync-fd195.firebasestorage.app",
  messagingSenderId: "760852470803",
  appId: "1:760852470803:web:0f37dfc04f88c3a3be73e6"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);