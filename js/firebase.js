// js/firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, doc,
  getDocs, addDoc, updateDoc, deleteDoc, getDoc, setDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAklLEbs-WugPIH4Nt9ku9vf70w5y8wi4I",
  authDomain: "kozinn-tasuku.firebaseapp.com",
  projectId: "kozinn-tasuku",
  storageBucket: "kozinn-tasuku.firebasestorage.app",
  messagingSenderId: "832929413074",
  appId: "1:832929413074:web:7b2d66c5a63b6f02fd3a0b"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db, collection, doc, getDocs, addDoc, updateDoc, deleteDoc, getDoc, setDoc };
