// ══════════════════════════════════════════════════════════
//  EXTINTOR SERVICE v3 - Multi-Base com Controle de Permissões
//  Atualizado para: Seleção por usuário (allowedBases)
// ══════════════════════════════════════════════════════════

class ExtintorService {
  constructor() {
    this.db = null;
    this.auth = null;
    this.currentUser = null;
    this.cache = {
      extintores: null,
      edificacoes: null,
      base: null,
      lastUpdate: null
    };
  }

  // ══════════════════════════════════════════════════════════
  //  INICIALIZAÇÃO
  // ══════════════════════════════════════════════════════════

  init() {
    if (!this.db) {
      if (typeof firebase === 'undefined') {
        throw new Error('Firebase não foi carregado. Adicione o script do Firebase antes do extintor-service.js');
      }
      if (!firebase.firestore) {
        throw new Error('Firestore não está disponível. Verifique se o script do Firestore foi carregado.');
      }
      this.db = firebase.firestore();

      // Auth é opcional (nem todas as páginas usam)
      if (firebase.auth) {
        this.auth = firebase.auth();
        console.log('✅ ExtintorService v3 inicializado (multi-base com permissões)');
      } else {
        console.log('✅ ExtintorService v3 inicializado (sem auth)');
      }
    }
    return this;
  }

  _ensureInit() {
    if (!this.db) {
      this.init();
    }
  }

  // ══════════════════════════════════════════════════════════
  //  BASE ATUAL (Via BaseService)
  // ══════════════════════════════════════════════════════════

  async getBaseAtual() {
    if (!window.baseService) {
      throw new Error('BaseService não inicializado');
    }
    return await window.baseService.getBaseAtual();
  }

  async getModoClassificacao() {
    if (!window.baseService) return 'tipo_carga_nominal';
    return await window.baseService.getModoClassificacao();
  }

  async getOpcoesCargaNominal() {
    const base = await this.getBaseAtual();
    return base.opcoes_carga_nominal || {};
  }

  async getOpcoesCapacidade() {
    const base = await this.getBaseAtual();
    return base.opcoes_capacidade || {};
  }

  async trocarModoClassificacao(novoModo, motivo = '') {
    this._ensureInit();

    if (!['tipo_carga_nominal', 'tipo_capacidade'].includes(novoModo)) {
      throw new Error('Modo inválido. Use "tipo_carga_nominal" ou "tipo_capacidade"');
    }

    const base = await this.getBaseAtual();
    const modoAntigo = base.modo_classificacao;

    if (modoAntigo === novoModo) {
      throw new Error('Este modo já está ativo');
    }

    const mudanca = {
      data: new Date().toISOString(),
      de: modoAntigo,
      para: novoModo,
      motivo: motivo,
      por: 'admin'
    };

    await this.db.collection('bases').doc(base.id).update({
      modo_classificacao: novoModo,
      historico_mudancas: firebase.firestore.FieldValue.arrayUnion(mudanca),
      atualizado_em: new Date().toISOString()
    });

    // Notificar BaseService para limpar cache
    if (window.baseService) window.baseService.cache.base = null;

    await this.marcarTodosParaRevisaoSemLimpar(novoModo);

    return {
      sucesso: true,
      modo_antigo: modoAntigo,
      modo_novo: novoModo,
      mensagem: `Modo alterado para ${novoModo}. Dados antigos preservados.`
    };
  }

  async marcarTodosParaRevisaoSemLimpar(novoModo) {
    this._ensureInit();

    const base = await this.getBaseAtual();

    const snapshot = await this.db
      .collection('bases')
      .doc(base.id)
      .collection('extintores')
      .get();

    const batch = this.db.batch();
    let count = 0;

    snapshot.forEach(doc => {
      batch.update(doc.ref, {
        modo_atual: novoModo,
        requer_revisao: true,
        atualizado_em: new Date().toISOString()
      });
      count++;
    });

    await batch.commit();
    console.log(`✅ ${count} extintores marcados para revisão (dados preservados)`);
    return count;
  }

  async marcarTodosParaRevisao(novoModo) {
    return this.marcarTodosParaRevisaoSemLimpar(novoModo);
  }

  async resetarTodasVistorias() {
    console.log('⚠️ Vistorias devem ser resetadas manualmente no Realtime Database');
    return true;
  }

  async getExtintoresPendentesRevisao() {
    this._ensureInit();

    const base = await this.getBaseAtual();

    const snapshot = await this.db
      .collection('bases')
      .doc(base.id)
      .collection('extintores')
      .where('requer_revisao', '==', true)
      .get();

    const extintores = [];
    snapshot.forEach(doc => {
      extintores.push({ id: doc.id, ...doc.data() });
    });

    return extintores;
  }

  async marcarExtintorRevisado(extintorId) {
    this._ensureInit();

    const base = await this.getBaseAtual();

    await this.db
      .collection('bases')
      .doc(base.id)
      .collection('extintores')
      .doc(extintorId)
      .update({
        requer_revisao: false,
        revisado_em: new Date().toISOString(),
        revisado_por: 'admin',
        atualizado_em: new Date().toISOString()
      });

    return { sucesso: true };
  }

  // ══════════════════════════════════════════════════════════
  //  EXTINTORES - CRUD
  // ══════════════════════════════════════════════════════════

  async listarExtintores(forcarRecarregar = false) {
    this._ensureInit();

    if (
      !forcarRecarregar &&
      this.cache.extintores &&
      this.cache.lastUpdate &&
      (Date.now() - this.cache.lastUpdate < 300000)
    ) {
      return this.cache.extintores;
    }

    console.log('📥 Carregando extintores do Firestore...');

    const base = await this.getBaseAtual();

    const snapshot = await this.db
      .collection('bases')
      .doc(base.id)
      .collection('extintores')
      .where('ativo', '==', true)
      .get();

    const extintores = [];
    snapshot.forEach(doc => {
      extintores.push({
        id: doc.id,
        ...doc.data()
      });
    });

    this.cache.extintores = extintores;
    this.cache.lastUpdate = Date.now();

    console.log(`✅ ${extintores.length} extintores carregados`);
    return extintores;
  }

  async getExtintor(id) {
    this._ensureInit();

    const base = await this.getBaseAtual();

    const doc = await this.db
      .collection('bases')
      .doc(base.id)
      .collection('extintores')
      .doc(id)
      .get();

    if (!doc.exists) {
      throw new Error(`Extintor ${id} não encontrado`);
    }

    return { id: doc.id, ...doc.data() };
  }

  async criarExtintor(dados) {
    this._ensureInit();

    const base = await this.getBaseAtual();
    const id = `${dados.edificacao}_${dados.numero}`;

    const existeNaEdificacao = await this.db
      .collection('bases')
      .doc(base.id)
      .collection('extintores')
      .doc(id)
      .get();

    if (existeNaEdificacao.exists) {
      throw new Error(`Extintor ${dados.numero} já existe na edificação ${dados.edificacao}`);
    }

    const snapshot = await this.db
      .collection('bases')
      .doc(base.id)
      .collection('extintores')
      .where('numero', '==', dados.numero)
      .where('ativo', '==', true)
      .get();

    if (!snapshot.empty) {
      const existente = snapshot.docs[0].data();
      throw new Error(
        `❌ Número ${dados.numero} já está em uso!\n\n` +
        `Extintor existente:\n` +
        `• Edificação: ${existente.edificacao}\n` +
        `• Localização: ${existente.descricao}\n\n` +
        `Cada extintor deve ter um número único no sistema.`
      );
    }

    const modo = await this.getModoClassificacao();

    const extintor = {
      id: id,
      numero: dados.numero,
      edificacao: dados.edificacao,
      descricao: dados.descricao,
      tipo: dados.tipo,

      carga_nominal_valor: dados.carga_nominal_valor || null,
      carga_nominal_unidade: dados.carga_nominal_unidade || "",

      capacidade_extintora: dados.capacidade_extintora || "",

      modo_atual: modo,
      requer_revisao: false,

      localizacao_gps: dados.localizacao_gps || null,
      qrcode: dados.qrcode || `EXT-${base.codigo}-${dados.edificacao.substring(0, 6).toUpperCase()}-${dados.numero}`,
      ativo: true,
      status: "operacional",
      vencimento_nivel2: dados.vencimento_nivel2 || "",
      vencimento_nivel3: dados.vencimento_nivel3 || null,
      criado_em: new Date().toISOString(),
      criado_por: dados.criado_por || "admin",
      atualizado_em: new Date().toISOString(),
      atualizado_por: dados.criado_por || "admin"
    };

    await this.db
      .collection('bases')
      .doc(base.id)
      .collection('extintores')
      .doc(id)
      .set(extintor);

    this.cache.extintores = null;

    return { sucesso: true, id: id, extintor: extintor };
  }

  async atualizarExtintor(id, dados) {
    this._ensureInit();

    const base = await this.getBaseAtual();

    const doc = await this.db
      .collection('bases')
      .doc(base.id)
      .collection('extintores')
      .doc(id)
      .get();

    if (!doc.exists) {
      throw new Error(`Extintor ${id} não encontrado`);
    }

    const atualizacao = {
      ...dados,
      atualizado_em: new Date().toISOString(),
      atualizado_por: dados.atualizado_por || "admin"
    };

    delete atualizacao.id;
    delete atualizacao.criado_em;
    delete atualizacao.criado_por;

    await this.db
      .collection('bases')
      .doc(base.id)
      .collection('extintores')
      .doc(id)
      .update(atualizacao);

    this.cache.extintores = null;

    return { sucesso: true, id: id };
  }

  async desativarExtintor(id, motivo) {
    this._ensureInit();

    const base = await this.getBaseAtual();

    await this.db
      .collection('bases')
      .doc(base.id)
      .collection('extintores')
      .doc(id)
      .update({
        ativo: false,
        status: "desativado",
        motivo_desativacao: motivo || "",
        desativado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString()
      });

    this.cache.extintores = null;

    return { sucesso: true, id: id };
  }

  // ══════════════════════════════════════════════════════════
  //  EDIFICAÇÕES
  // ══════════════════════════════════════════════════════════

  async listarEdificacoes() {
    this._ensureInit();

    if (this.cache.edificacoes) return this.cache.edificacoes;

    const base = await this.getBaseAtual();

    if (!base.edificacoes) {
      throw new Error('Edificações não encontradas. Execute a migração primeiro.');
    }

    this.cache.edificacoes = base.edificacoes;
    return this.cache.edificacoes;
  }

  async getEdificacao(nome) {
    const edificacoes = await this.listarEdificacoes();
    return edificacoes[nome] || null;
  }

  // ══════════════════════════════════════════════════════════
  //  FORMATO LEGADO (compatibilidade)
  // ══════════════════════════════════════════════════════════

  async getExtintoresFormatoAntigo() {
    const extintores = await this.listarExtintores();
    const edificacoes = await this.listarEdificacoes();
    const modo = await this.getModoClassificacao();

    const extintoresInfo = {};
    const edificacoesDescr = {};
    const edificacoesArray = [];

    Object.entries(edificacoes).forEach(([nome, dados]) => {
      edificacoesDescr[nome] = dados.descricao;
      edificacoesArray.push(nome);
      extintoresInfo[nome] = {};
    });

    extintores.forEach(ext => {
      if (!extintoresInfo[ext.edificacao]) {
        extintoresInfo[ext.edificacao] = {};
      }

      let classificacao;
      if (modo === 'tipo_capacidade') {
        classificacao = ext.capacidade_extintora
          ? `${ext.tipo} ${ext.capacidade_extintora}`
          : ext.tipo;
      } else {
        classificacao = ext.carga_nominal_valor
          ? `${ext.tipo} ${ext.carga_nominal_valor}${ext.carga_nominal_unidade}`
          : ext.tipo;
      }

      extintoresInfo[ext.edificacao][ext.numero] = {
        descricao: ext.descricao,
        tipo: ext.tipo,
        kg: ext.kg,
        carga_nominal_valor: ext.carga_nominal_valor,
        carga_nominal_unidade: ext.carga_nominal_unidade,
        capacidade_extintora: ext.capacidade_extintora,
        classificacao: classificacao
      };
    });

    return {
      extintoresInfo,
      edificacoesDescr,
      edificacoesArray,
      modo
    };
  }

  // ══════════════════════════════════════════════════════════
  //  BUSCA E FILTROS
  // ══════════════════════════════════════════════════════════

  async buscarExtintores(filtros = {}) {
    this._ensureInit();

    const base = await this.getBaseAtual();

    let query = this.db
      .collection('bases')
      .doc(base.id)
      .collection('extintores');

    if (filtros.ativo !== undefined) {
      query = query.where('ativo', '==', filtros.ativo);
    }

    if (filtros.edificacao) {
      query = query.where('edificacao', '==', filtros.edificacao);
    }

    if (filtros.status) {
      query = query.where('status', '==', filtros.status);
    }

    if (filtros.tipo) {
      query = query.where('tipo', '==', filtros.tipo);
    }

    const snapshot = await query.get();
    const extintores = [];

    snapshot.forEach(doc => {
      extintores.push({ id: doc.id, ...doc.data() });
    });

    return extintores;
  }

  // ══════════════════════════════════════════════════════════
  //  ESTATÍSTICAS
  // ══════════════════════════════════════════════════════════

  async getEstatisticas() {
    const extintores = await this.listarExtintores();

    const stats = {
      total: extintores.length,
      por_tipo: {},
      por_edificacao: {},
      por_status: {},
      vencimentos_proximos: {
        nivel2_30dias: 0,
        nivel2_vencido: 0,
        nivel3_90dias: 0,
        nivel3_vencido: 0
      }
    };

    const hoje = new Date();
    const em30dias = new Date(hoje.getTime() + 30 * 24 * 60 * 60 * 1000);
    const em90dias = new Date(hoje.getTime() + 90 * 24 * 60 * 60 * 1000);

    extintores.forEach(ext => {
      if (!stats.por_tipo[ext.tipo]) stats.por_tipo[ext.tipo] = 0;
      stats.por_tipo[ext.tipo]++;

      if (!stats.por_edificacao[ext.edificacao]) stats.por_edificacao[ext.edificacao] = 0;
      stats.por_edificacao[ext.edificacao]++;

      if (!stats.por_status[ext.status]) stats.por_status[ext.status] = 0;
      stats.por_status[ext.status]++;

      if (ext.vencimento_nivel2) {
        const vencN2 = new Date(ext.vencimento_nivel2 + '-01');
        if (vencN2 < hoje) {
          stats.vencimentos_proximos.nivel2_vencido++;
        } else if (vencN2 < em30dias) {
          stats.vencimentos_proximos.nivel2_30dias++;
        }
      }

      if (ext.vencimento_nivel3) {
        const vencN3 = new Date(ext.vencimento_nivel3, 0, 1);
        if (vencN3 < hoje) {
          stats.vencimentos_proximos.nivel3_vencido++;
        } else if (vencN3 < em90dias) {
          stats.vencimentos_proximos.nivel3_90dias++;
        }
      }
    });

    return stats;
  }

  // ══════════════════════════════════════════════════════════
  //  HELPERS
  // ══════════════════════════════════════════════════════════

  formatarCargaNominal(extintor) {
    const { tipo, carga_nominal_valor, carga_nominal_unidade } = extintor;

    if (!carga_nominal_valor) return tipo;

    return `${tipo} ${carga_nominal_valor}${carga_nominal_unidade}`;
  }

  formatarCapacidadeExtintora(extintor) {
    const { tipo, capacidade_extintora } = extintor;

    if (!capacidade_extintora) return tipo;

    return `${tipo} ${capacidade_extintora}`;
  }

  formatarExtintor(extintor) {
    const modo = extintor.modo_atual || 'tipo_carga_nominal';

    if (modo === 'tipo_capacidade') {
      return this.formatarCapacidadeExtintora(extintor);
    } else {
      return this.formatarCargaNominal(extintor);
    }
  }

  limparCache() {
    this.cache = {
      extintores: null,
      edificacoes: null,
      base: null,
      lastUpdate: null
    };
    console.log('🔄 Cache limpo');
  }

  limparBaseSelecionada() {
    localStorage.removeItem('baseSelecionada');
    this.cache.base = null;
    console.log('🔄 Base selecionada removida (use no logout)');
  }
}

// Exportar classe
if (typeof window !== 'undefined') {
  window.ExtintorService = ExtintorService;
}
