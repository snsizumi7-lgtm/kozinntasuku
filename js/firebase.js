// js/firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, doc,
  getDocs, addDoc, updateDoc, deleteDoc, getDoc, setDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBpn6WRCh0UDmF5KkhcQihEJMQLniPQ3jc",
  authDomain: "tasuku-3e8ac.firebaseapp.com",
  projectId: "tasuku-3e8ac",
  storageBucket: "tasuku-3e8ac.firebasestorage.app",
  messagingSenderId: "551813900502",
  appId: "1:551813900502:web:753645be12622952108177"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db, collection, doc, getDocs, addDoc, updateDoc, deleteDoc, getDoc, setDoc };
