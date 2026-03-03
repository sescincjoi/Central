// ══════════════════════════════════════════════════════════
//  EXTINTOR SERVICE - Gerenciamento de Extintores
// ══════════════════════════════════════════════════════════

class ExtintorService {
  constructor() {
    // NÃO inicializar Firebase aqui - será feito no init()
    this.db = null;
    this.cache = {
      extintores: null,
      edificacoes: null,
      config: null,
      lastUpdate: null
    };
  }

  // Inicializar após Firebase estar pronto
  init() {
    if (!this.db) {
      if (typeof firebase === 'undefined') {
        throw new Error('Firebase não foi carregado. Adicione o script do Firebase antes do extintor-service.js');
      }
      if (!firebase.firestore) {
        throw new Error('Firestore não está disponível. Verifique se o script do Firestore foi carregado.');
      }
      this.db = firebase.firestore();
      console.log('✅ ExtintorService inicializado');
    }
    return this;
  }

  // Garantir que está inicializado antes de usar
  _ensureInit() {
    if (!this.db) {
      this.init();
    }
  }

  // ─────────────────────────────────────────────────────────
  //  CONFIGURAÇÃO
  // ─────────────────────────────────────────────────────────
  
  async getConfiguracao() {
    this._ensureInit();
    
    if (this.cache.config) return this.cache.config;
    
    const doc = await this.db.collection('configuracao').doc('base_atual').get();
    
    if (!doc.exists) {
      throw new Error('Configuração não encontrada no Firestore. Execute a migração primeiro.');
    }
    
    this.cache.config = doc.data();
    return this.cache.config;
  }

  async getModoClassificacao() {
    const config = await this.getConfiguracao();
    return config.modo_classificacao || 'tipo_kg';
  }

  async setModoClassificacao(novoModo) {
    this._ensureInit();
    
    if (!['tipo_kg', 'tipo_capacidade'].includes(novoModo)) {
      throw new Error('Modo inválido. Use "tipo_kg" ou "tipo_capacidade"');
    }

    await this.db.collection('configuracao').doc('base_atual').update({
      modo_classificacao: novoModo,
      atualizado_em: new Date().toISOString()
    });

    // Limpar cache
    this.cache.config = null;
    
    return { sucesso: true, modo: novoModo };
  }

  // ─────────────────────────────────────────────────────────
  //  EXTINTORES INSTALADOS
  // ─────────────────────────────────────────────────────────
  
  async listarExtintores(forcarRecarregar = false) {
    this._ensureInit();
    
    // Usar cache se disponível e recente (< 5 min)
    if (
      !forcarRecarregar && 
      this.cache.extintores && 
      this.cache.lastUpdate && 
      (Date.now() - this.cache.lastUpdate < 300000)
    ) {
      return this.cache.extintores;
    }

    console.log('📥 Carregando extintores do Firestore...');
    
    const snapshot = await this.db
      .collection('extintores_instalados')
      .where('ativo', '==', true)
      .get();

    const extintores = [];
    snapshot.forEach(doc => {
      extintores.push({
        id: doc.id,
        ...doc.data()
      });
    });

    // Atualizar cache
    this.cache.extintores = extintores;
    this.cache.lastUpdate = Date.now();

    console.log(`✅ ${extintores.length} extintores carregados`);
    return extintores;
  }

  async getExtintor(id) {
    this._ensureInit();
    
    const doc = await this.db
      .collection('extintores_instalados')
      .doc(id)
      .get();

    if (!doc.exists) {
      throw new Error(`Extintor ${id} não encontrado`);
    }

    return { id: doc.id, ...doc.data() };
  }

  async criarExtintor(dados) {
    this._ensureInit();
    
    const id = `${dados.edificacao}_${dados.numero}`;
    
    // Verificar se já existe
    const existe = await this.db.collection('extintores_instalados').doc(id).get();
    if (existe.exists) {
      throw new Error(`Extintor ${dados.numero} já existe na edificação ${dados.edificacao}`);
    }

    const extintor = {
      id: id,
      numero: dados.numero,
      edificacao: dados.edificacao,
      descricao: dados.descricao,
      tipo: dados.tipo,
      kg: dados.kg || null,
      capacidade_extintora: dados.capacidade_extintora || "",
      localizacao_gps: dados.localizacao_gps || null,
      qrcode: dados.qrcode || `EXT-SBJV-${dados.edificacao.substring(0, 6).toUpperCase()}-${dados.numero}`,
      ativo: true,
      status: "operacional",
      vencimento_nivel2: dados.vencimento_nivel2 || "",
      vencimento_nivel3: dados.vencimento_nivel3 || null,
      criado_em: new Date().toISOString(),
      criado_por: dados.criado_por || "admin",
      atualizado_em: new Date().toISOString(),
      atualizado_por: dados.criado_por || "admin"
    };

    await this.db.collection('extintores_instalados').doc(id).set(extintor);

    // Limpar cache
    this.cache.extintores = null;

    return { sucesso: true, id: id, extintor: extintor };
  }

  async atualizarExtintor(id, dados) {
    this._ensureInit();
    
    const doc = await this.db.collection('extintores_instalados').doc(id).get();
    
    if (!doc.exists) {
      throw new Error(`Extintor ${id} não encontrado`);
    }

    const atualizacao = {
      ...dados,
      atualizado_em: new Date().toISOString(),
      atualizado_por: dados.atualizado_por || "admin"
    };

    // Remover campos que não devem ser atualizados
    delete atualizacao.id;
    delete atualizacao.criado_em;
    delete atualizacao.criado_por;

    await this.db.collection('extintores_instalados').doc(id).update(atualizacao);

    // Limpar cache
    this.cache.extintores = null;

    return { sucesso: true, id: id };
  }

  async desativarExtintor(id, motivo) {
    this._ensureInit();
    
    await this.db.collection('extintores_instalados').doc(id).update({
      ativo: false,
      status: "desativado",
      motivo_desativacao: motivo || "",
      desativado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString()
    });

    // Limpar cache
    this.cache.extintores = null;

    return { sucesso: true, id: id };
  }

  // ─────────────────────────────────────────────────────────
  //  EDIFICAÇÕES
  // ─────────────────────────────────────────────────────────
  
  async listarEdificacoes() {
    this._ensureInit();
    
    if (this.cache.edificacoes) return this.cache.edificacoes;

    const doc = await this.db.collection('edificacoes').doc('lista').get();
    
    if (!doc.exists) {
      throw new Error('Edificações não encontradas. Execute a migração primeiro.');
    }

    this.cache.edificacoes = doc.data();
    return this.cache.edificacoes;
  }

  async getEdificacao(nome) {
    const edificacoes = await this.listarEdificacoes();
    return edificacoes[nome] || null;
  }

  // ─────────────────────────────────────────────────────────
  //  FORMATAÇÃO PARA COMPATIBILIDADE COM CÓDIGO ANTIGO
  // ─────────────────────────────────────────────────────────
  
  async getExtintoresFormatoAntigo() {
    const extintores = await this.listarExtintores();
    const edificacoes = await this.listarEdificacoes();

    // Formatar no estilo antigo: { "EDIFICACAO": { "numero": { dados } } }
    const extintoresInfo = {};
    const edificacoesDescr = {};
    const edificacoesArray = [];

    // Edificações
    Object.entries(edificacoes).forEach(([nome, dados]) => {
      edificacoesDescr[nome] = dados.descricao;
      edificacoesArray.push(nome);
      extintoresInfo[nome] = {};
    });

    // Extintores
    extintores.forEach(ext => {
      if (!extintoresInfo[ext.edificacao]) {
        extintoresInfo[ext.edificacao] = {};
      }
      
      extintoresInfo[ext.edificacao][ext.numero] = {
        descricao: ext.descricao,
        tipo: ext.tipo,
        kg: ext.kg,
        capacidade_extintora: ext.capacidade_extintora
      };
    });

    return {
      extintoresInfo,
      edificacoesDescr,
      edificacoesArray
    };
  }

  // ─────────────────────────────────────────────────────────
  //  BUSCA E FILTROS
  // ─────────────────────────────────────────────────────────
  
  async buscarExtintores(filtros = {}) {
    this._ensureInit();
    
    let query = this.db.collection('extintores_instalados');

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

  // ─────────────────────────────────────────────────────────
  //  ESTATÍSTICAS
  // ─────────────────────────────────────────────────────────
  
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
      // Por tipo
      if (!stats.por_tipo[ext.tipo]) {
        stats.por_tipo[ext.tipo] = 0;
      }
      stats.por_tipo[ext.tipo]++;

      // Por edificação
      if (!stats.por_edificacao[ext.edificacao]) {
        stats.por_edificacao[ext.edificacao] = 0;
      }
      stats.por_edificacao[ext.edificacao]++;

      // Por status
      if (!stats.por_status[ext.status]) {
        stats.por_status[ext.status] = 0;
      }
      stats.por_status[ext.status]++;

      // Vencimentos
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

  // ─────────────────────────────────────────────────────────
  //  LIMPAR CACHE
  // ─────────────────────────────────────────────────────────
  
  limparCache() {
    this.cache = {
      extintores: null,
      edificacoes: null,
      config: null,
      lastUpdate: null
    };
    console.log('🔄 Cache limpo');
  }
}

// Exportar classe (não instanciar automaticamente)
// O HTML deve chamar: const extintorService = new ExtintorService().init();
// ou simplesmente usar: new ExtintorService().init().listarExtintores()
if (typeof window !== 'undefined') {
  window.ExtintorService = ExtintorService;
}
