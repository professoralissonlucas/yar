/** Instâncias únicas do Firebase (só Auth e Firestore; sem Analytics). */
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { firebaseConfig } from './firebaseConfig.js';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
auth.languageCode = 'pt-BR';
export const db = getFirestore(app);
