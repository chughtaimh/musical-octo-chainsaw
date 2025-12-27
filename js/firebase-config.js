import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, onValue, push, set } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDwjSeEdz3g6ofnvvURIr_Q_q0KII4QtdU",
  authDomain: "drinks-tracker-cb5e5.firebaseapp.com",
  databaseURL: "https://drinks-tracker-cb5e5-default-rtdb.firebaseio.com",
  projectId: "drinks-tracker-cb5e5",
  storageBucket: "drinks-tracker-cb5e5.firebasestorage.app",
  messagingSenderId: "670928393598",
  appId: "1:670928393598:web:1d3bf4c73fe8f7714d0f2f",
  measurementId: "G-36G1HBRE9K"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const historyRef = ref(db, "history");
const weeklyPlansRef = ref(db, "weeklyPlans");

export { app, db, historyRef, weeklyPlansRef, push, set, ref, onValue };
