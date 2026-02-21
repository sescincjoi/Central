/**
 * MATRICULA HANDLER
 * Central SCI Joinville - Utilitários de Matrícula
 * 
 * Funções auxiliares para trabalhar com matrículas:
 * - Formatação e máscara
 * - Validação em tempo real
 * - Conversão email virtual
 * - Normalização
 */

import { CONFIG } from './firebase-config.js';

/**
 * CLASSE DE UTILITÁRIOS DE MATRÍCULA
 */
class MatriculaHandler {
  
  /**
   * NORMALIZAR MATRÍCULA
   * Remove espaços, converte para maiúscula
   * @param {string} matricula 
   * @returns {string}
   */
  normalize(matricula) {
    if (!matricula) return '';
    return matricula.toUpperCase().trim().replace(/\s+/g, '');
  }

  /**
   * VALIDAR FORMATO
   * @param {string} matricula 
   * @returns {boolean}
   */
  isValid(matricula) {
    const normalized = this.normalize(matricula);
    return CONFIG.matriculaPattern.test(normalized);
  }

  /**
   * FORMATAR MATRÍCULA COM HÍFEN (AAA-1234)
   * @param {string} matricula 
   * @returns {string}
   */
  format(matricula) {
    const normalized = this.normalize(matricula);
    if (normalized.length === 7) {
      return `${normalized.substring(0, 3)}-${normalized.substring(3)}`;
    }
    return normalized;
  }

  /**
   * REMOVER FORMATAÇÃO (AAA-1234 → AAA1234)
   * @param {string} matricula 
   * @returns {string}
   */
  unformat(matricula) {
    return this.normalize(matricula.replace(/-/g, ''));
  }

  /**
   * APLICAR MÁSCARA EM TEMPO REAL
   * Para usar em eventos de input
   * @param {HTMLInputElement} input 
   */
  applyMask(input) {
    input.addEventListener('input', (e) => {
      let value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      
      // Limitar comprimento
      if (value.length > 7) {
        value = value.substring(0, 7);
      }
      
      e.target.value = value;
    });

    input.addEventListener('blur', (e) => {
      const value = e.target.value;
      if (value.length === 7) {
        e.target.value = this.format(value);
      }
    });

    input.addEventListener('focus', (e) => {
      e.target.value = this.unformat(e.target.value);
    });
  }

  /**
   * VALIDAR EM TEMPO REAL COM FEEDBACK VISUAL
   * Adiciona classes CSS para indicar válido/inválido
   * @param {HTMLInputElement} input 
   */
  validateRealTime(input) {
    const validate = () => {
      const value = input.value;
      
      if (value.length === 0) {
        input.classList.remove('valid', 'invalid');
        return;
      }
      
      if (this.isValid(value)) {
        input.classList.remove('invalid');
        input.classList.add('valid');
      } else {
        input.classList.remove('valid');
        input.classList.add('invalid');
      }
    };

    input.addEventListener('input', validate);
    input.addEventListener('blur', validate);
  }

  /**
   * CONVERTER MATRÍCULA PARA EMAIL VIRTUAL
   * @param {string} matricula 
   * @returns {string}
   */
  toVirtualEmail(matricula) {
    const normalized = this.normalize(matricula);
    return `${normalized}${CONFIG.emailDomain}`;
  }

  /**
   * EXTRAIR MATRÍCULA DE EMAIL VIRTUAL
   * @param {string} email 
   * @returns {string|null}
   */
  fromVirtualEmail(email) {
    if (!email.endsWith(CONFIG.emailDomain)) {
      return null;
    }
    
    const matricula = email.replace(CONFIG.emailDomain, '');
    return this.isValid(matricula) ? matricula : null;
  }

  /**
   * VERIFICAR SE É EMAIL VIRTUAL
   * @param {string} email 
   * @returns {boolean}
   */
  isVirtualEmail(email) {
    return email.endsWith(CONFIG.emailDomain);
  }

  /**
   * GERAR MATRÍCULA ALEATÓRIA (para testes)
   * @returns {string}
   */
  generateRandom() {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    
    let matricula = '';
    
    // 3 letras
    for (let i = 0; i < 3; i++) {
      matricula += letters.charAt(Math.floor(Math.random() * letters.length));
    }
    
    // 4 números
    for (let i = 0; i < 4; i++) {
      matricula += numbers.charAt(Math.floor(Math.random() * numbers.length));
    }
    
    return matricula;
  }

  /**
   * OBTER INFORMAÇÕES DA MATRÍCULA
   * @param {string} matricula 
   * @returns {object}
   */
  getInfo(matricula) {
    const normalized = this.normalize(matricula);
    const valid = this.isValid(normalized);
    
    return {
      original: matricula,
      normalized: normalized,
      formatted: this.format(normalized),
      valid: valid,
      letters: valid ? normalized.substring(0, 3) : null,
      numbers: valid ? normalized.substring(3) : null,
      virtualEmail: valid ? this.toVirtualEmail(normalized) : null
    };
  }

  /**
   * COMPARAR DUAS MATRÍCULAS
   * @param {string} m1 
   * @param {string} m2 
   * @returns {boolean}
   */
  equals(m1, m2) {
    return this.normalize(m1) === this.normalize(m2);
  }

  /**
   * VALIDAR LOTE DE MATRÍCULAS
   * @param {string[]} matriculas 
   * @returns {object}
   */
  validateBatch(matriculas) {
    const results = {
      total: matriculas.length,
      valid: [],
      invalid: [],
      duplicates: []
    };

    const seen = new Set();

    matriculas.forEach(m => {
      const normalized = this.normalize(m);
      
      if (this.isValid(normalized)) {
        if (seen.has(normalized)) {
          results.duplicates.push(normalized);
        } else {
          results.valid.push(normalized);
          seen.add(normalized);
        }
      } else {
        results.invalid.push(m);
      }
    });

    return results;
  }

  /**
   * SUGERIR CORREÇÕES PARA MATRÍCULA INVÁLIDA
   * @param {string} matricula 
   * @returns {string[]}
   */
  suggestCorrections(matricula) {
    const normalized = this.normalize(matricula);
    const suggestions = [];

    // Já está válida
    if (this.isValid(normalized)) {
      return [normalized];
    }

    // Muito curta ou muito longa
    if (normalized.length < 7) {
      suggestions.push(`Complete com mais caracteres (faltam ${7 - normalized.length})`);
    } else if (normalized.length > 7) {
      suggestions.push(normalized.substring(0, 7));
    }

    // Tentar corrigir ordem (números antes de letras)
    const letters = normalized.match(/[A-Z]/g) || [];
    const numbers = normalized.match(/\d/g) || [];
    
    if (letters.length === 3 && numbers.length === 4) {
      const corrected = letters.join('') + numbers.join('');
      if (this.isValid(corrected)) {
        suggestions.push(corrected);
      }
    }

    // Sugerir formato correto
    if (suggestions.length === 0) {
      suggestions.push('Formato correto: AAA1234 (3 letras + 4 números)');
    }

    return suggestions;
  }

  /**
   * CRIAR INPUT DE MATRÍCULA COM VALIDAÇÃO
   * Retorna um elemento input configurado
   * @param {object} options 
   * @returns {HTMLInputElement}
   */
  createInput(options = {}) {
    const input = document.createElement('input');
    
    input.type = 'text';
    input.maxLength = 7;
    input.placeholder = options.placeholder || 'ABC1234';
    input.id = options.id || 'matricula-input';
    input.name = options.name || 'matricula';
    input.required = options.required !== false;
    input.autocomplete = options.autocomplete || 'off';

    // Aplicar máscara
    this.applyMask(input);

    // Validação visual
    if (options.validateRealTime !== false) {
      this.validateRealTime(input);
    }

    return input;
  }

  /**
   * ADICIONAR ESTILOS PARA VALIDAÇÃO VISUAL
   */
  injectValidationStyles() {
    const styleId = 'matricula-validation-styles';
    
    if (document.getElementById(styleId)) return;
    
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      input.valid {
        border-color: #10b981 !important;
        background-color: #f0fdf4;
      }
      
      input.invalid {
        border-color: #ef4444 !important;
        background-color: #fef2f2;
      }
      
      input.valid:focus {
        box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.1) !important;
      }
      
      input.invalid:focus {
        box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1) !important;
      }
    `;
    
    document.head.appendChild(style);
  }
}

// Criar instância global
const matriculaHandler = new MatriculaHandler();

// Injetar estilos
matriculaHandler.injectValidationStyles();

// Exportar
export default matriculaHandler;

// Também disponibilizar globalmente
window.matriculaHandler = matriculaHandler;

console.log('✅ MatriculaHandler inicializado');
