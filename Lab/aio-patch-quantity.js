// ============================================================================
// AIO-PATCH — QUANTITY LAYER
// Extrai quantidades numéricas associadas a conceitos, mantendo-as separadas
// da camada semântica pura (consistente com a separação Semântico/Operacional
// já defendida para números e operadores matemáticos).
//
// Resolve: "Duas moléculas de hidrogénio e uma de oxigénio" — o agente não
// perdia a informação de quantidade, simplesmente nunca a extraía.
//
// Cada proposição ensinada com quantidade ganha um campo opcional
// `quantity: { value, unit }` sem alterar a estrutura SPO nem a relação.
// ============================================================================

const QuantityLayer = (() => {

  // Números por extenso PT/EN — cobre o caso comum de ensino em prosa
  const QUANTITY_WORDS = {
    'zero':0,'nenhum':0,'nenhuma':0,
    'um':1,'uma':1,'dois':2,'duas':2,'três':3,'tres':3,'quatro':4,
    'cinco':5,'seis':6,'sete':7,'oito':8,'nove':9,'dez':10,
    'onze':11,'doze':12,'dúzia':12,'duzia':12,
    'vinte':20,'trinta':30,'quarenta':40,'cinquenta':50,'cem':100,'cento':100,
    'one':1,'two':2,'three':3,'four':4,'five':5,'six':6,'seven':7,'eight':8,
    'nine':9,'ten':10,'dozen':12,'twenty':20,'hundred':100,
    // Quantificadores vagos — sem valor numérico exacto, mas com sinal de pluralidade
    'vários':null,'varios':null,'muitos':null,'muitas':null,'alguns':null,'algumas':null,
    'poucos':null,'poucas':null,'diversos':null,'diversas':null,
  };

  // Unidades comuns que costumam seguir a quantidade — úteis para o objecto
  // da proposição não perder a unidade quando existe
  const UNIT_WORDS = new Set([
    'moléculas','molécula','átomos','átomo','gramas','grama','litros','litro',
    'quilos','quilo','metros','metro','graus','grau','unidades','unidade',
    'partes','parte','porções','porcoes','porção','porcao',
  ]);

  // Extrai um número literal (dígitos) de uma forma textual
  function parseNumericForm(form) {
    if (!form) return null;
    const cleaned = form.replace(',', '.');
    if (/^\d+(\.\d+)?$/.test(cleaned)) return parseFloat(cleaned);
    return null;
  }

  // Resolve a quantidade de uma forma textual — extenso, dígito, ou null
  function resolveQuantity(form) {
    if (!form) return null;
    const lower = form.toLowerCase();
    if (lower in QUANTITY_WORDS) return QUANTITY_WORDS[lower];
    return parseNumericForm(form);
  }

  // Extrai todas as quantificações de uma sequência de tokens
  // Devolve: [{ quantity, unit, concept, tokenIndex }]
  // quantity pode ser um número ou null (quantificador vago tipo "vários")
  function extract(tokens) {
    if (!tokens || tokens.length === 0) return [];
    const results = [];

    for (let i = 0; i < tokens.length; i++) {
      const form = tokens[i].form;
      const lower = (form || '').toLowerCase();

      // Só considera como candidato a quantificador se resolver para algo
      // (incluindo null explícito de QUANTITY_WORDS, mas não ausência)
      const isQuantityWord = lower in QUANTITY_WORDS || parseNumericForm(form) !== null;
      if (!isQuantityWord) continue;

      const quantity = resolveQuantity(form);

      // Procura o próximo token significativo (não-stop) para ser a unidade/conceito
      let unit = null;
      let conceptIdx = i + 1;
      while (conceptIdx < tokens.length && tokens[conceptIdx].roles?.isStop) conceptIdx++;
      if (conceptIdx >= tokens.length) continue;

      let concept = tokens[conceptIdx].form;

      // Se o token imediatamente a seguir é uma unidade conhecida (moléculas,
      // átomos...), o CONCEITO real vem depois de "de" — ex: "duas moléculas
      // de hidrogénio" → unit=moléculas, concept=hidrogénio
      if (UNIT_WORDS.has(concept.toLowerCase())) {
        unit = concept;
        let afterUnit = conceptIdx + 1;
        while (afterUnit < tokens.length && tokens[afterUnit].roles?.isStop) afterUnit++;
        if (afterUnit < tokens.length) concept = tokens[afterUnit].form;
      }

      results.push({ quantity, unit, concept, tokenIndex: i });
    }

    return results;
  }

  // Formata uma quantidade extraída de volta para texto, para uso em respostas
  function formatQuantity(q, lang = 'pt') {
    if (!q) return '';
    if (q.quantity === null) {
      return q.unit ? `${q.unit} de ${q.concept}` : q.concept;
    }
    const qtyStr = q.quantity === 1 && lang === 'pt' ? 'uma' : String(q.quantity);
    return q.unit ? `${qtyStr} ${q.unit} de ${q.concept}` : `${qtyStr} ${q.concept}`;
  }

  return { extract, resolveQuantity, formatQuantity, QUANTITY_WORDS, UNIT_WORDS };
})();

// ============================================================================
// PATCH DE INTEGRAÇÃO — anexa quantidade às proposições ensinadas
// Não altera a extracção SPO nem a relação — apenas enriquece a proposição
// resultante com um campo `quantity` opcional, se o teach() a expuser.
// ============================================================================
(function patchTeachWithQuantity() {
  if (typeof PropositionStore === 'undefined') return;
  const _origTeach = PropositionStore.teach;

  PropositionStore.teach = function(tokens, enrichedTokens, opts = {}) {
    const sourceTokens = enrichedTokens || tokens;
    const quantities = QuantityLayer.extract(sourceTokens);

    const result = _origTeach.call(this, tokens, enrichedTokens, opts);

    // Anexa a primeira quantidade relevante encontrada à proposição resultante,
    // sem interferir na sua estrutura SPO já resolvida
    if (result && !result.conflict && quantities.length > 0) {
      result.quantities = quantities;
    }

    return result;
  };

  console.log('[AIO-Patch] QuantityLayer: quantidades anexadas às proposições ensinadas.');
})();

// ============================================================================
// COMANDO DE DIAGNÓSTICO
// ============================================================================
(function addQuantityCommand() {
  const _orig = self.onmessage;

  self.onmessage = async function(e) {
    if (e.data.command === 'parseQuantity') {
      const text   = typeof e.data.payload === 'string' ? e.data.payload : '';
      const tokens = SemanticTokenizer.extract(text);
      const result = QuantityLayer.extract(tokens);
      self.postMessage({ type: 'quantityParsed', input: text, result });
      return;
    }
    return _orig.call(this, e);
  };
})();
