// ⚠️ Firebaseコンソールで取得した設定をここに貼り付けてください
// 手順はREADME.mdを参照

import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  // Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDslW42ydu8c5IwUwSaAvNac-DtudfmvGE",
  authDomain: "quiz-f8ee3.firebaseapp.com",
  projectId: "quiz-f8ee3",
  storageBucket: "quiz-f8ee3.firebasestorage.app",
  messagingSenderId: "263683850540",
  appId: "1:263683850540:web:ef919dfae0b1763c95ec89",
  measurementId: "G-8ZZQXZN3D5"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
