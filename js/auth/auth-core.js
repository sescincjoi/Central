/**
 * AUTH CORE
 * Central SCI Joinville - Sistema de Autenticação
 * 
 * Gerencia toda a lógica de autenticação:
 * - Login com matrícula/senha
 * - Cadastro de novos usuários
 * - Verificação de matrícula habilitada
 * - Recuperação de sessão e tokens
 */

import { auth, db, CONFIG } from './firebase-config.js';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

/**
 * CLASSE PRINCIPAL DE AUTENTICAÇÃO
 * Centraliza o estado do usuário e métodos de segurança.
 */
class AuthCore {
  constructor() {
    this.initialized = false;
    this.currentUser = null;
    this.userRole = null;
    this.userMatricula = null;
    this.listeners = [];
    this.isRegistering = false;

    // Inicializar listener de mudança de autenticação
    this.initAuthStateListener();
  }

  /**
   * ESCUTADOR DE ESTADO DE AUTENTICAÇÃO
   * Monitora quando o usuário faz login ou logout no Firebase.
   */
  initAuthStateListener() {
    onAuthStateChanged(auth, async (firebaseUser) => {
      if (this.isRegistering) return;

      if (firebaseUser) {
        console.log('🔐 Usuário autenticado:', firebaseUser.uid);

        // Buscar dados completos do usuário no Firestore
        await this.loadUserData(firebaseUser);

        if (!this.initialized) {
          this.initialized = true;
          console.log('✅ AuthCore totalmente inicializado');
          window.dispatchEvent(new CustomEvent('auth-initialized'));
        }

        this.notifyListeners('login', this.currentUser);
        window.dispatchEvent(new CustomEvent('auth-state-changed', {
          detail: { user: this.currentUser }
        }));
      } else {
        console.log('🔓 Usuário desautenticado');
        this.currentUser = null;
        this.userRole = null;
        this.userMatricula = null;

        if (!this.initialized) {
          this.initialized = true;
          console.log('✅ AuthCore inicializado (sem usuário)');
          window.dispatchEvent(new CustomEvent('auth-initialized'));
        }

        this.notifyListeners('logout', null);
        window.dispatchEvent(new CustomEvent('auth-state-changed', {
          detail: { user: null }
        }));
      }
    });
  }

  /**
   * CARREGAR DADOS DO USUÁRIO
   * Busca as informações complementares (role, base, matrícula) no Firestore.
   * @param {Object} firebaseUser - Objeto de usuário do Firebase Auth
   */
  async loadUserData(firebaseUser) {
    try {
      const userDoc = await getDoc(doc(db, 'usuarios', firebaseUser.uid));

      if (userDoc.exists()) {
        const userData = userDoc.data();

        // Centralização do objeto de sessão do usuário
        this.currentUser = {
          uid: firebaseUser.uid,
          email: userData.email,
          displayName: userData.displayName,
          matricula: userData.matricula,
          role: userData.role,
          base: userData.base || "JOI",
          // Suporte futuro a múltiplas bases: se não existir, cria array com base atual
          allowedBases: userData.allowedBases || [userData.base || "JOI"],
          ativo: userData.ativo,
          cadastradoEm: userData.cadastradoEm,
          ultimoAcesso: userData.ultimoAcesso
        };

        this.userRole = userData.role;
        this.userMatricula = userData.matricula;

        // Atualizar carimbo de último acesso
        await updateDoc(doc(db, 'usuarios', firebaseUser.uid), {
          ultimoAcesso: serverTimestamp()
        });

        console.log('✅ Dados do usuário carregados:', this.currentUser.matricula);

      } else {
        // Lógica de retry para aguardar a gravação do cadastro inicial
        let attempts = 0;
        let userData = null;

        while (attempts < 6 && !userData) {
          await new Promise(resolve => setTimeout(resolve, 500));
          const retryDoc = await getDoc(doc(db, 'usuarios', firebaseUser.uid));
          if (retryDoc.exists()) {
            userData = retryDoc.data();
          }
          attempts++;
        }

        if (userData) {
          this.currentUser = {
            uid: firebaseUser.uid,
            email: userData.email,
            displayName: userData.displayName,
            matricula: userData.matricula,
            role: userData.role,
            base: userData.base || "JOI",
            allowedBases: userData.allowedBases || [userData.base || "JOI"],
            ativo: userData.ativo,
            cadastradoEm: userData.cadastradoEm,
            ultimoAcesso: userData.ultimoAcesso
          };

          this.userRole = userData.role;
          this.userMatricula = userData.matricula;

          await updateDoc(doc(db, 'usuarios', firebaseUser.uid), {
            ultimoAcesso: serverTimestamp()
          });

          console.log('✅ Dados do usuário carregados (retry):', this.currentUser.matricula);
        } else {
          console.error('❌ Documento do usuário não encontrado após retries');
          await this.logout();
        }
      }

    } catch (error) {
      console.error('❌ Erro ao carregar dados do usuário:', error);
      throw error;
    }
  }

  /**
   * OBTER ID TOKEN (JWT)
   * Útil para validação segura no backend (Apps Script).
   * @param {boolean} forceRefresh - Forçar renovação do token
   */
  async getIdToken(forceRefresh = false) {
    if (!auth.currentUser) return null;
    return await auth.currentUser.getIdToken(forceRefresh);
  }

  /**
   * OBTER RESULTADO DO ID TOKEN
   * Contém claims customizadas e detalhes do token.
   */
  async getIdTokenResult(forceRefresh = false) {
    if (!auth.currentUser) return null;
    return await auth.currentUser.getIdTokenResult(forceRefresh);
  }

  /**
   * OBTER SESSÃO ATUAL
   * Retorna uma cópia dos dados do usuário logado.
   */
  getSession() {
    return this.currentUser ? { ...this.currentUser } : null;
  }

  /**
   * VALIDAR FORMATO DE MATRÍCULA
   * @param {string} matricula
   */
  validateMatricula(matricula) {
    if (!matricula || matricula.trim() === '') {
      return { valid: false, message: 'Matrícula é obrigatória' };
    }

    const matriculaUpper = matricula.toUpperCase().trim();

    if (!CONFIG.matriculaPattern.test(matriculaUpper)) {
      return {
        valid: false,
        message: 'Matrícula deve ter 3 letras seguidas de 4 números (ex: ABC1234)'
      };
    }

    return { valid: true, matricula: matriculaUpper };
  }

  /**
   * VALIDAR REQUISITOS DE SENHA
   * @param {string} senha
   */
  validateSenha(senha) {
    if (!senha || senha.length < CONFIG.senhaMinLength) {
      return {
        valid: false,
        message: `Senha deve ter no mínimo ${CONFIG.senhaMinLength} caracteres`
      };
    }

    const requirements = CONFIG.senhaRequirements;
    const errors = [];

    if (requirements.uppercase && !/[A-Z]/.test(senha)) {
      errors.push('uma letra maiúscula');
    }

    if (requirements.lowercase && !/[a-z]/.test(senha)) {
      errors.push('uma letra minúscula');
    }

    if (requirements.number && !/\d/.test(senha)) {
      errors.push('um número');
    }

    if (requirements.special) {
      const specialRegex = new RegExp(`[${CONFIG.specialChars.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}]`);
      if (!specialRegex.test(senha)) {
        errors.push('um caractere especial');
      }
    }

    if (errors.length > 0) {
      return {
        valid: false,
        message: `Senha deve conter pelo menos: ${errors.join(', ')}`
      };
    }

    return { valid: true };
  }

  /**
   * VERIFICAR SE MATRÍCULA ESTA AUTORIZADA
   */
  async verificarMatriculaHabilitada(matricula) {
    try {
      const matriculaDoc = await getDoc(doc(db, 'matriculas', matricula));

      if (!matriculaDoc.exists()) {
        return {
          habilitada: false,
          message: 'Matrícula não autorizada. Contate o administrador.'
        };
      }

      const data = matriculaDoc.data();

      if (data.usada) {
        return {
          habilitada: false,
          message: 'Matrícula já foi utilizada para cadastro.'
        };
      }

      if (!data.habilitada) {
        return {
          habilitada: false,
          message: 'Matrícula desabilitada. Contate o administrador.'
        };
      }

      return {
        habilitada: true,
        role: data.role || 'user',
        observacao: data.observacao
      };

    } catch (error) {
      console.error('❌ Erro ao verificar matrícula:', error);
      throw new Error('Erro ao verificar matrícula. Tente novamente.');
    }
  }

  /**
   * FLUXO COMPETLO DE CADASTRO
   */
  async cadastrar(matricula, senha, confirmarSenha, email, nomeCompleto, nomeBA) {
    try {
      const matriculaValidation = this.validateMatricula(matricula);
      if (!matriculaValidation.valid) throw new Error(matriculaValidation.message);

      const matriculaUpper = matriculaValidation.matricula;

      if (senha !== confirmarSenha) throw new Error('As senhas não coincidem');

      const senhaValidation = this.validateSenha(senha);
      if (!senhaValidation.valid) throw new Error(senhaValidation.message);

      if (!email || !email.includes('@')) throw new Error('Email inválido');
      if (!nomeCompleto || nomeCompleto.trim().length < 3) throw new Error('Nome completo inválido');
      if (!nomeBA || nomeBA.trim().length < 2) throw new Error('Nome de BA inválido');

      const matriculaCheck = await this.verificarMatriculaHabilitada(matriculaUpper);
      if (!matriculaCheck.habilitada) throw new Error(matriculaCheck.message);

      const usuariosQuery = query(collection(db, 'usuarios'), where('matricula', '==', matriculaUpper));
      const usuariosSnapshot = await getDocs(usuariosQuery);

      if (!usuariosSnapshot.empty) throw new Error('Matrícula já cadastrada');

      const emailVirtual = `${matriculaUpper}${CONFIG.emailDomain}`;

      this.isRegistering = true;
      const userCredential = await createUserWithEmailAndPassword(auth, emailVirtual, senha);
      const user = userCredential.user;

      await updateProfile(user, { displayName: nomeBA.trim() });

      await setDoc(doc(db, 'usuarios', user.uid), {
        matricula: matriculaUpper,
        email: email.toLowerCase().trim(),
        nomeCompleto: nomeCompleto.trim(),
        displayName: nomeBA.trim(),
        role: matriculaCheck.role,
        base: "JOI",
        allowedBases: ["JOI"],
        ativo: true,
        cadastradoEm: serverTimestamp(),
        ultimoAcesso: serverTimestamp()
      });

      await updateDoc(doc(db, 'matriculas', matriculaUpper), {
        usada: true,
        usadaEm: serverTimestamp(),
        usadaPor: user.uid
      });

      this.isRegistering = false;
      await this.loadUserData(user);

      this.notifyListeners('login', this.currentUser);
      window.dispatchEvent(new CustomEvent('auth-state-changed', {
        detail: { user: this.currentUser }
      }));

      return {
        success: true,
        message: `Bem-vindo(a), ${nomeBA}!`,
        user: { uid: user.uid, matricula: matriculaUpper, displayName: nomeBA.trim() }
      };

    } catch (error) {
      console.error('❌ Erro no cadastro:', error);
      let message = error.message;
      if (error.code === 'auth/email-already-in-use') message = 'Esta matrícula já está cadastrada';
      throw new Error(message);
    }
  }

  /**
   * FLUXO DE LOGIN
   */
  async login(matricula, senha) {
    try {
      const matriculaValidation = this.validateMatricula(matricula);
      if (!matriculaValidation.valid) throw new Error(matriculaValidation.message);
      const matriculaUpper = matriculaValidation.matricula;

      const usuariosQuery = query(collection(db, 'usuarios'), where('matricula', '==', matriculaUpper));
      const usuariosSnapshot = await getDocs(usuariosQuery);

      if (usuariosSnapshot.empty) throw new Error('Matrícula não cadastrada');

      const userData = usuariosSnapshot.docs[0].data();
      if (!userData.ativo) throw new Error('Usuário desativado');

      const emailVirtual = `${matriculaUpper}${CONFIG.emailDomain}`;
      await signInWithEmailAndPassword(auth, emailVirtual, senha);

      return { success: true, message: 'Login realizado com sucesso!' };

    } catch (error) {
      console.error('❌ Erro no login:', error);
      let message = 'Matrícula ou senha incorretos';
      if (error.code === 'auth/wrong-password') message = 'Senha incorreta';
      throw new Error(message);
    }
  }

  /**
   * LOGOUT DO SISTEMA
   */
  async logout() {
    try {
      await signOut(auth);
      return { success: true };
    } catch (error) {
      console.error('❌ Erro no logout:', error);
      throw error;
    }
  }

  /**
   * RECUPERAÇÃO DE SENHA POR EMAIL
   */
  async recuperarSenha(matricula) {
    try {
      const matriculaValidation = this.validateMatricula(matricula);
      if (!matriculaValidation.valid) throw new Error(matriculaValidation.message);
      const matriculaUpper = matriculaValidation.matricula;

      const usuariosQuery = query(collection(db, 'usuarios'), where('matricula', '==', matriculaUpper));
      const usuariosSnapshot = await getDocs(usuariosQuery);

      if (usuariosSnapshot.empty) throw new Error('Matrícula não cadastrada');

      const userData = usuariosSnapshot.docs[0].data();
      await sendPasswordResetEmail(auth, userData.email);

      return { success: true, message: `Email de recuperação enviado para ${userData.email}` };

    } catch (error) {
      console.error('❌ Erro na recuperação:', error);
      throw new Error(error.message);
    }
  }

  /**
   * VERIFICAÇÕES DE PERMISSÃO
   */
  isAdmin() { return this.userRole === 'admin'; }
  isSuperAdmin() { return this.currentUser?.role === 'super-admin'; }
  isAuthenticated() { return this.currentUser !== null; }
  getBaseUsuario() { return this.currentUser?.base || null; }
  isAdminDaBase(baseId) { return this.currentUser?.role === 'admin' && this.currentUser?.base === baseId; }

  /**
   * SISTEMA DE LISTENERS
   */
  addAuthListener(callback) { this.listeners.push(callback); }
  notifyListeners(event, user) {
    this.listeners.forEach(callback => {
      try { callback(event, user); } catch (e) { console.error('❌ Erro em listener:', e); }
    });
  }
}

// Instância singleton para uso em todo o sistema
const authCore = new AuthCore();
export default authCore;
window.authCore = authCore;

console.log('✅ AuthCore carregado (seguro)');
