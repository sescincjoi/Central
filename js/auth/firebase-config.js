/**
 * FIREBASE CONFIGURATION
 * Central SCI Joinville - Sistema de Autenticação
 * 
 * Este arquivo contém as configurações do Firebase e inicializa os serviços necessários.
 * Padrão de matrícula: 3 letras + 4 números (ex: ABC1234)
 */

// Importar funções necessárias do Firebase SDK
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getAuth, connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { getFirestore, connectFirestoreEmulator } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

// Configuração do Firebase (suas credenciais)
const firebaseConfig = {
  apiKey: "AIzaSyBS6l2v37JzVQrx4U7K_zdiCVRU7EYWrxg",
  authDomain: "central-sci-joinville.firebaseapp.com",
  projectId: "central-sci-joinville",
  storageBucket: "central-sci-joinville.firebasestorage.app",
  messagingSenderId: "340864161035",
  appId: "1:340864161035:web:bba5069c82beadfe6c7e0e"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);

// Inicializar serviços
const auth = getAuth(app);
const db = getFirestore(app);

// Configurações do domínio
const CONFIG = {
  domain: 'sescincjoi.github.io',
  emailDomain: '@auth.centralsci.internal', // Email virtual para autenticação

  // Padrão de matrícula: 3 letras + 4 números
  matriculaPattern: /^[A-Z]{3}\d{4}$/,

  // Requisitos de senha
  senhaMinLength: 8,
  senhaRequirements: {
    uppercase: true,    // Pelo menos 1 maiúscula
    lowercase: true,    // Pelo menos 1 minúscula
    number: true,       // Pelo menos 1 número
    special: true       // Pelo menos 1 caractere especial
  },

  // Caracteres especiais permitidos
  specialChars: '!@#$%^&*()_+-=[]{}|;:,.<>?',

  // Modo de desenvolvimento (desabilitar em produção)
  dev: false
};

// Se estiver em desenvolvimento local, pode usar emuladores (opcional)
if (CONFIG.dev && window.location.hostname === 'localhost') {
  connectAuthEmulator(auth, 'http://localhost:9099');
  connectFirestoreEmulator(db, 'localhost', 8080);
  console.log('🔧 Usando emuladores Firebase locais');
}

// Exportar para uso em outros módulos
export { app, auth, db, CONFIG };


// Log de inicialização
console.log('✅ Firebase inicializado:', {
  projectId: firebaseConfig.projectId,
  domain: CONFIG.domain
});
