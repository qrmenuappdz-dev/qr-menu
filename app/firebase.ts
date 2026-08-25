import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCh08x6k_-d1-gwr-KUyc1WfzFsxnbei-c",
  authDomain: "digitalmenuapp-e5ea1.firebaseapp.com",
  projectId: "digitalmenuapp-e5ea1",
  storageBucket: "digitalmenuapp-e5ea1.firebasestorage.app",
  messagingSenderId: "855736883272",
  appId: "1:855736883272:web:69fb07de065c9e0476607d",
  measurementId: "G-7EZ4JHFS0M"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
