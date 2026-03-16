/**
 * 🏢 BASE SERVICE
 * Central SCI - Gestão de Contexto e Unidades (Bases)
 * 
 * Responsável por:
 * - Identificar a base ativa no sistema (JOI, FLN, etc.)
 * - Gerenciar permissões de acesso às bases por usuário
 * - Persistir a seleção no localStorage
 * - Notificar o sistema sobre mudanças de base
 */

class BaseService {
    constructor() {
        this.db = null;
        this.auth = null;
        this.currentUser = null;
        this.cache = {
            base: null,
            lastUpdate: null
        };
        this.listeners = [];
    }

    // ══════════════════════════════════════════════════════════
    //  INICIALIZAÇÃO
    // ══════════════════════════════════════════════════════════

    init() {
        if (!this.db) {
            if (typeof firebase === 'undefined') {
                throw new Error('Firebase não foi carregado. Adicione o script do Firebase antes do base-service.js');
            }
            this.db = firebase.firestore();
            if (firebase.auth) {
                this.auth = firebase.auth();
            }
            console.log('✅ BaseService inicializado');
        }
        return this;
    }

    _ensureInit() {
        if (!this.db) {
            this.init();
        }
    }

    // ══════════════════════════════════════════════════════════
    //  GESTÃO DE BASE ATIVA
    // ══════════════════════════════════════════════════════════

    async getBaseSelecionadaPeloUsuario() {
        this._ensureInit();

        // 1. PRIORIDADE: localStorage
        const baseSelecionada = localStorage.getItem('baseSelecionada');
        if (baseSelecionada) {
            return baseSelecionada;
        }

        // 2. PRIORIDADE: Perfil do usuário (Requer Auth)
        if (!this.auth) {
            console.warn('⚠️ Sem Auth: Redirecionando para login ou usando default');
            return null;
        }

        const user = await this._waitForAuth();
        if (!user) return null;

        // Buscar perfil no Firestore (integrado com AuthCore futuramente)
        const doc = await this.db.collection('usuarios').doc(user.uid).get();
        if (doc.exists && doc.data().base) {
            const baseIATA = doc.data().base;

            // Resolver ID da base pelo IATA
            const snapshot = await this.db.collection('bases')
                .where('base', '==', baseIATA)
                .limit(1)
                .get();

            if (!snapshot.empty) {
                const baseId = snapshot.docs[0].id;
                localStorage.setItem('baseSelecionada', baseId);
                return baseId;
            }
        }

        return null;
    }

    async getBaseAtual() {
        this._ensureInit();

        // Cache simples (30s)
        if (this.cache.base && this.cache.lastUpdate && (Date.now() - this.cache.lastUpdate < 30000)) {
            return this.cache.base;
        }

        const baseId = await this.getBaseSelecionadaPeloUsuario();
        if (!baseId) {
            throw new Error('Nenhuma base selecionada ou disponível');
        }

        const doc = await this.db.collection('bases').doc(baseId).get();
        if (!doc.exists) {
            throw new Error('Base não encontrada no sistema');
        }

        const base = { id: doc.id, ...doc.data() };
        this.cache.base = base;
        this.cache.lastUpdate = Date.now();

        return base;
    }

    async selecionarBase(baseIdOuCodigo) {
        this._ensureInit();
        let baseId = baseIdOuCodigo;

        // Se for código IATA (3 letras), resolver para ID
        if (baseIdOuCodigo.length === 3) {
            const snapshot = await this.db.collection('bases')
                .where('base', '==', baseIdOuCodigo)
                .limit(1)
                .get();
            if (snapshot.empty) throw new Error(`Base ${baseIdOuCodigo} não encontrada`);
            baseId = snapshot.docs[0].id;
        }

        // Persistir e limpar cache
        localStorage.setItem('baseSelecionada', baseId);
        this.cache.base = null;

        // Notificar sistema
        window.dispatchEvent(new CustomEvent('base-changed', { detail: { baseId } }));
        console.log(`📍 Base alterada para: ${baseId}`);

        return baseId;
    }

    async getBasesPermitidas() {
        this._ensureInit();
        const user = await this._waitForAuth();
        if (!user) return [];

        const userDoc = await this.db.collection('usuarios').doc(user.uid).get();
        if (!userDoc.exists) return [];

        const perfil = userDoc.data();

        // Super-admin vê todas
        if (perfil.role === 'super-admin') {
            const snapshot = await this.db.collection('bases').get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }

        // Outros: apenas allowedBases
        if (!perfil.allowedBases || perfil.allowedBases.length === 0) {
            // Fallback para a base principal do perfil
            if (perfil.base) {
                const snapshot = await this.db.collection('bases').where('base', '==', perfil.base).get();
                return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            }
            return [];
        }

        const bases = [];
        for (const codigoIATA of perfil.allowedBases) {
            const snapshot = await this.db.collection('bases').where('base', '==', codigoIATA).limit(1).get();
            if (!snapshot.empty) {
                bases.push({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() });
            }
        }
        return bases;
    }

    // ══════════════════════════════════════════════════════════
    //  CONFIGURAÇÕES DA UNIDADE
    // ══════════════════════════════════════════════════════════

    async getModoClassificacao() {
        const base = await this.getBaseAtual();
        return base.modo_classificacao || 'tipo_carga_nominal';
    }

    // ══════════════════════════════════════════════════════════
    //  HELPERS
    // ══════════════════════════════════════════════════════════

    async _waitForAuth() {
        if (!this.auth) return null;
        if (this.auth.currentUser) return this.auth.currentUser;

        return new Promise((resolve) => {
            const unsubscribe = this.auth.onAuthStateChanged((user) => {
                unsubscribe();
                resolve(user);
            });
            // Timeout de segurança
            setTimeout(() => resolve(null), 5000);
        });
    }
}

// Singleton global
const baseService = new BaseService().init();
window.baseService = baseService;
export default baseService;
