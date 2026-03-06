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
  //  BASES E CONFIGURAÇÃO
  // ─────────────────────────────────────────────────────────
  
  async getBaseAtual() {
    this._ensureInit();
    
    const doc = await this.db.collection('bases').doc('aeroporto-joinville').get();
    
    if (!doc.exists) {
      throw new Error('Base não encontrada. Execute o script de migração primeiro.');
    }
    
    return { id: doc.id, ...doc.data() };
  }

  async getModoClassificacao() {
    const base = await this.getBaseAtual();
    return base.modo_classificacao || 'tipo_carga_nominal';
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

    // Registrar mudança no histórico
    const mudanca = {
      data: new Date().toISOString(),
      de: modoAntigo,
      para: novoModo,
      motivo: motivo,
      por: 'admin' // TODO: pegar do auth
    };

    // Atualizar base
    await this.db.collection('bases').doc('aeroporto-joinville').update({
      modo_classificacao: novoModo,
      historico_mudancas: firebase.firestore.FieldValue.arrayUnion(mudanca),
      atualizado_em: new Date().toISOString()
    });

    // Marcar todos extintores para revisão (sem limpar dados!)
    await this.marcarTodosParaRevisaoSemLimpar(novoModo);

    // Resetar vistorias
    await this.resetarTodasVistorias();

    return {
      sucesso: true,
      modo_antigo: modoAntigo,
      modo_novo: novoModo,
      mensagem: `Modo alterado para ${novoModo}. Dados antigos preservados.`
    };
  }

  async marcarTodosParaRevisaoSemLimpar(novoModo) {
    this._ensureInit();
    
    const snapshot = await this.db.collection('extintores_instalados').get();
    const batch = this.db.batch();
    let count = 0;

    snapshot.forEach(doc => {
      // IMPORTANTE: Apenas atualizar modo_atual e requer_revisao
      // NÃO limpar carga_nominal_valor, carga_nominal_unidade, capacidade_extintora
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

  // Manter função antiga para compatibilidade (deprecated)
  async marcarTodosParaRevisao(novoModo) {
    return this.marcarTodosParaRevisaoSemLimpar(novoModo);
  }

  async resetarTodasVistorias() {
    // TODO: Implementar reset no Realtime Database
    // Por enquanto apenas log
    console.log('⚠️ Vistorias devem ser resetadas manualmente no Realtime Database');
    return true;
  }

  async getExtintoresPendentesRevisao() {
    this._ensureInit();
    
    const snapshot = await this.db
      .collection('extintores_instalados')
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
    
    await this.db.collection('extintores_instalados').doc(extintorId).update({
      requer_revisao: false,
      revisado_em: new Date().toISOString(),
      revisado_por: 'admin', // TODO: pegar do auth
      atualizado_em: new Date().toISOString()
    });

    return { sucesso: true };
  }

  // ─────────────────────────────────────────────────────────
  //  CONFIGURAÇÃO
  // ─────────────────────────────────────────────────────────
  
  async getConfiguracao() {
    this._ensureInit();
    
    // DEPRECATED: buscar da coleção antiga configuracao
    // Mantido para compatibilidade
    if (this.cache.config) return this.cache.config;
    
    const doc = await this.db.collection('configuracao').doc('base_atual').get();
    
    if (!doc.exists) {
      console.warn('⚠️ Configuração antiga não encontrada');
      return null;
    }
    
    this.cache.config = doc.data();
    return this.cache.config;
  }

  async getModoClassificacao() {
    // NOVO: Buscar da coleção bases
    try {
      const base = await this.getBaseAtual();
      return base.modo_classificacao || 'tipo_carga_nominal';
    } catch (error) {
      console.error('❌ Erro ao buscar modo da base:', error);
      // Fallback: tentar configuração antiga
      const config = await this.getConfiguracao();
      return config?.modo_classificacao || 'tipo_carga_nominal';
    }
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
    
    // ═══ VALIDAÇÃO 1: Verificar se já existe nesta edificação ═══
    const existeNaEdificacao = await this.db.collection('extintores_instalados').doc(id).get();
    if (existeNaEdificacao.exists) {
      throw new Error(`Extintor ${dados.numero} já existe na edificação ${dados.edificacao}`);
    }

    // ═══ VALIDAÇÃO 2: Verificar se número já existe em QUALQUER edificação ═══
    const snapshot = await this.db
      .collection('extintores_instalados')
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

    // Obter modo atual
    const modo = await this.getModoClassificacao();

    const extintor = {
      id: id,
      numero: dados.numero,
      edificacao: dados.edificacao,
      descricao: dados.descricao,
      tipo: dados.tipo,
      
      // ═══ CARGA NOMINAL ═══
      carga_nominal_valor: dados.carga_nominal_valor || null,
      carga_nominal_unidade: dados.carga_nominal_unidade || "",
      
      // ═══ CAPACIDADE EXTINTORA ═══
      capacidade_extintora: dados.capacidade_extintora || "",
      
      // ═══ CONTROLE ═══
      modo_atual: modo,
      requer_revisao: false,
      
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

    // Calcular classificação conforme o modo configurado
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
      kg: ext.kg, // mantido por compatibilidade legada
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
    modo // expõe o modo para a página usar
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
  //  HELPERS
  // ─────────────────────────────────────────────────────────
  
  formatarCargaNominal(extintor) {
    const { tipo, carga_nominal_valor, carga_nominal_unidade } = extintor;
    
    if (!carga_nominal_valor) {
      return tipo;
    }
    
    return `${tipo} ${carga_nominal_valor}${carga_nominal_unidade}`;
  }

  formatarCapacidadeExtintora(extintor) {
    const { tipo, capacidade_extintora } = extintor;
    
    if (!capacidade_extintora) {
      return tipo;
    }
    
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
