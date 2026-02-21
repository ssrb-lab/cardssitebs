import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = typeof __firebase_config !== "undefined" 
  ? JSON.parse(__firebase_config) 
  : {
      apiKey: "AIzaSyAF0XD16LUmsVFF0q5perWadlU9RWoCpLs",
      authDomain: "narutocardgame-a4017.firebaseapp.com",
      projectId: "narutocardgame-a4017",
      storageBucket: "narutocardgame-a4017.firebasestorage.app",
      messagingSenderId: "1061146381013",
      appId: "1:1061146381013:web:38941af7656858ce55b05c",
      measurementId: "G-36ZECLRRLE",
    };

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const GAME_ID = typeof __app_id !== "undefined" ? __app_id : "narutocardgame";