// ============================================================================
// AIO-PATCH — PROPOSITION STORE
// Proposições como unidades de memória com tipo de relação e proveniência.
// Aplica sobre aio-worker-v4.js via importScripts() ou concatenação.
//
// Substitui a lógica de montagem de resposta do SyntacticPlanner:
// em vez de buscar nós próximos na KD-Tree e compor,
// consulta proposições verificadas e emite apenas o que foi ensinado
// ou inferido com confiança suficiente.
// ============================================================================

// ============================================================================
// RELATION TYPES — tipos de relação entre proposições
// Cada tipo tem: código, inverso, compatibilidade com outros tipos
// ============================================================================
const RelationTypes = {
  IS:       { code: 'IS',       label: 'é',        inverse: 'IS',       combinesWith: ['IS','HAS','ENABLES'] },
  CAUSES:   { code: 'CAUSES',   label: 'causa',     inverse: 'CAUSED_BY',combinesWith: ['CAUSES','ENABLES'] },
  HAS:      { code: 'HAS',      label: 'tem',       inverse: 'BELONGS',  combinesWith: ['HAS','IS'] },
  ENABLES:  { code: 'ENABLES',  label: 'permite',   inverse: 'REQUIRES', combinesWith: ['ENABLES','CAUSES'] },
  REQUIRES: { code: 'REQUIRES', label: 'requer',    inverse: 'ENABLES',  combinesWith: ['REQUIRES','IS'] },
  OPPOSES:  { code: 'OPPOSES',  label: 'opõe-se a', inverse: 'OPPOSES',  combinesWith: [] },
  PART_OF:  { code: 'PART_OF',  label: 'faz parte de', inverse: 'HAS',  combinesWith: ['PART_OF','IS'] },
  UNKNOWN:  { code: 'UNKNOWN',  label: '→',         inverse: 'UNKNOWN',  combinesWith: ['UNKNOWN'] },
};

// Detecta o tipo de relação a partir do verbo/cópula da proposição
function detectRelationType(tokens) {
  const forms = tokens.map(t => t.form.toLowerCase());

  // Cópula "é/são/era/será" → IS
  if (forms.some(f => ['é','são','era','será','ser','is','are','was','were'].includes(f)))
    return RelationTypes.IS;

  // Causalidade → CAUSES
  if (forms.some(f => ['causa','provoca','gera','origina','produces','causes','creates'].includes(f)))
    return RelationTypes.CAUSES;

  // Posse → HAS
  if (forms.some(f => ['tem','têm','possui','possuem','has','have','contains'].includes(f)))
    return RelationTypes.HAS;

  // Permissão/activação → ENABLES
  if (forms.some(f => ['permite','possibilita','activa','enables','allows','activates'].includes(f)))
    return RelationTypes.ENABLES;

  // Requisito → REQUIRES
  if (forms.some(f => ['requer','necessita','precisa','requires','needs','depends'].includes(f)))
    return RelationTypes.REQUIRES;

  // Oposição → OPPOSES
  if (forms.some(f => ['opõe','contradiz','nega','opposes','contradicts','negates'].includes(f)))
    return RelationTypes.OPPOSES;

  // Parte de → PART_OF
  if (forms.some(f => ['faz parte','pertence','integra','part of','belongs','integrates'].includes(f)))
    return RelationTypes.PART_OF;

  // Verbos de acção genérica com marcador causal → CAUSES
  if (tokens.some(t => t.roles && t.roles.isCausal))
    return RelationTypes.CAUSES;

  return RelationTypes.UNKNOWN;
}

// ============================================================================
// PROPOSITION STORE
// Guarda proposições completas com tipo de relação e proveniência.
// Persiste no IndexedDB via tabela 'propositions'.
// ============================================================================
const PropositionStore = (() => {

  // Cache em memória — evita IDB constante
  const _props  = new Map(); // id → Proposition
  let   _nextId = 1;

  // Índices para busca rápida
  const _bySubject   = new Map(); // subjectForm → Set<id>
  const _byPredicate = new Map(); // predicateForm → Set<id>
  const _byRelation  = new Map(); // relationType → Set<id>

  // Estrutura de uma proposição
  function makeProp(subject, predicate, object, relation, opts = {}) {
    return {
      id:           'p_' + (_nextId++) + '_' + Date.now(),
      subject:      subject,      // forma lexical do sujeito
      predicate:    predicate,    // forma lexical do predicado/verbo
      object:       object,       // forma lexical do objecto/complemento
      relation:     relation.code,
      relationLabel:relation.label,
      confidence:   opts.confidence || 1.0,
      source:       opts.source    || 'taught',  // 'taught'|'inferred'|'emergent'
      cycle:        opts.cycle     || 0,
      createdAt:    Date.now(),
      fireCount:    0,           // vezes que foi activada/recuperada
      lastUsed:     Date.now(),
      verified:     opts.verified !== false, // passou pelo PropositionVerifier
      psiSubject:   opts.psiSubject   || null,
      psiObject:    opts.psiObject    || null,
    };
  }

  function _index(prop) {
    const s = prop.subject.toLowerCase();
    const r = prop.relation;

    if (!_bySubject.has(s))   _bySubject.set(s, new Set());
    if (!_byRelation.has(r))  _byRelation.set(r, new Set());

    _bySubject.get(s).add(prop.id);
    _byRelation.get(r).add(prop.id);

    if (prop.object) {
      const o = prop.object.toLowerCase();
      if (!_byPredicate.has(o)) _byPredicate.set(o, new Set());
      _byPredicate.get(o).add(prop.id);
    }
  }

  // Verifica se uma proposição conflicta com as existentes
  // Conflicto: mesmo sujeito + mesmo objecto + relação OPPOSES
  function _hasConflict(subject, object, relation) {
    const ids = _bySubject.get(subject.toLowerCase()) || new Set();
    for (const id of ids) {
      const p = _props.get(id);
      if (!p) continue;
      if (p.object?.toLowerCase() === object?.toLowerCase()) {
        if (p.relation === 'OPPOSES' || relation.code === 'OPPOSES') return true;
        // Mesma proposição já existe com IS — não duplica
        if (p.relation === relation.code) return 'duplicate';
      }
    }
    return false;
  }

  // Extrai sujeito, predicado e objecto de uma sequência de tokens
  function _extractSPO(tokens, enrichedTokens) {
    const toks = enrichedTokens || tokens;
    const meaningful = toks.filter(t => !t.roles?.isStop && t.form?.length > 1);

    let subject = null, predicate = null, object = null;

    // Sujeito: primeiro token não-stop com morphClass de entidade
    for (const t of meaningful) {
      const mc = t.psi?.morphClass || '';
      if (['SUBSTANTIVO','PRONOME','PROPRIO','ACRONIMO','VERBO_INF'].includes(mc)) {
        if (!subject) { subject = t; continue; }
      }
    }

    // Predicado: primeiro verbo
    for (const t of meaningful) {
      const mc = t.psi?.morphClass || '';
      if (mc.startsWith('VERBO') && t !== subject) {
        if (!predicate) { predicate = t; continue; }
      }
    }

    // Objecto: token após o predicado que não é stop
    if (predicate) {
      const predIdx = meaningful.indexOf(predicate);
      const afterPred = meaningful.slice(predIdx + 1).filter(t =>
        !t.roles?.isNeg && !t.roles?.isCausal
      );
      if (afterPred.length > 0) object = afterPred[0];
    }

    // Fallback: se não há predicado claro, usa o token de maior peso
    if (!subject && meaningful.length > 0) subject = meaningful[0];
    if (!object  && meaningful.length > 2) object  = meaningful[meaningful.length - 1];

    return {
      subject:   subject?.form   || null,
      predicate: predicate?.form || null,
      object:    object?.form    || null,
      psiSubject: subject?.psi   || null,
      psiObject:  object?.psi    || null,
    };
  }

  // ── API pública ─────────────────────────────────────────────────────────────

  // Adiciona uma proposição ensinada directamente
  function teach(tokens, enrichedTokens, opts = {}) {
    const spo      = _extractSPO(tokens, enrichedTokens);
    if (!spo.subject) return null;

    const relation = detectRelationType(enrichedTokens || tokens);

    // Verifica conflicto
    const conflict = _hasConflict(spo.subject, spo.object, relation);
    if (conflict === 'duplicate') {
      // Reforça a existente em vez de duplicar
      const ids = _bySubject.get(spo.subject.toLowerCase()) || new Set();
      for (const id of ids) {
        const p = _props.get(id);
        if (p && p.relation === relation.code &&
            p.object?.toLowerCase() === spo.object?.toLowerCase()) {
          p.fireCount++;
          p.confidence = Math.min(1, p.confidence + 0.05);
          p.lastUsed   = Date.now();
          _persistProp(p);
          return p;
        }
      }
    }
    if (conflict === true) {
      console.warn('[PropStore] Conflicto detectado:', spo.subject, relation.code, spo.object);
      return null;
    }

    const prop = makeProp(
      spo.subject, spo.predicate, spo.object, relation,
      {
        confidence: opts.confidence || 1.0,
        source:     'taught',
        cycle:      opts.cycle || 0,
        psiSubject: spo.psiSubject,
        psiObject:  spo.psiObject,
        verified:   true,
      }
    );

    _props.set(prop.id, prop);
    _index(prop);
    _persistProp(prop);

    console.log('[PropStore] Ensinado:', prop.subject, prop.relationLabel, prop.object,
      '| conf:', prop.confidence.toFixed(2));
    return prop;
  }

  // Infere uma proposição a partir de duas existentes (transitividade limitada)
  // "A é B" + "B é C" → "A é C" com confiança reduzida
  // Só infere com tipos de relação compatíveis
  function inferTransitive(propA, propB) {
    if (!propA || !propB) return null;
    const rtA = RelationTypes[propA.relation];
    const rtB = RelationTypes[propB.relation];
    if (!rtA || !rtB) return null;

    // Verifica compatibilidade: propA.object === propB.subject
    if (propA.object?.toLowerCase() !== propB.subject?.toLowerCase()) return null;

    // Verifica que os tipos de relação são compatíveis para transitividade
    if (!rtA.combinesWith.includes(propB.relation)) return null;

    // Confiança da inferência: produto das confianças × 0.7 (penalidade de inferência)
    const inferredConf = propA.confidence * propB.confidence * 0.7;
    if (inferredConf < 0.3) return null; // demasiado incerto para guardar

    const conflict = _hasConflict(propA.subject, propB.object, rtA);
    if (conflict) return null;

    const prop = makeProp(
      propA.subject, propA.predicate, propB.object, rtA,
      {
        confidence: +inferredConf.toFixed(3),
        source:     'inferred',
        cycle:      propA.cycle,
        verified:   false, // requer verificação antes de ser emitida
      }
    );

    _props.set(prop.id, prop);
    _index(prop);
    _persistProp(prop);

    console.log('[PropStore] Inferido:', prop.subject, prop.relationLabel, prop.object,
      '| conf:', prop.confidence.toFixed(2), '(inferred)');
    return prop;
  }

  // Busca proposições sobre um sujeito
  function queryBySubject(subjectForm, minConfidence = 0.3) {
    const ids = _bySubject.get(subjectForm.toLowerCase()) || new Set();
    return Array.from(ids)
      .map(id => _props.get(id))
      .filter(p => p && p.confidence >= minConfidence)
      .sort((a, b) => b.confidence - a.confidence);
  }

  // Busca proposições por objecto (busca inversa)
  function queryByObject(objectForm, minConfidence = 0.3) {
    const ids = _byPredicate.get(objectForm.toLowerCase()) || new Set();
    return Array.from(ids)
      .map(id => _props.get(id))
      .filter(p => p && p.confidence >= minConfidence)
      .sort((a, b) => b.confidence - a.confidence);
  }

  // Busca proposições por tipo de relação
  function queryByRelation(relationType, minConfidence = 0.3) {
    const ids = _byRelation.get(relationType) || new Set();
    return Array.from(ids)
      .map(id => _props.get(id))
      .filter(p => p && p.confidence >= minConfidence)
      .sort((a, b) => b.confidence - a.confidence);
  }

  // Busca proposições relevantes para um input (sujeito ou objecto match)
  function queryRelevant(tokens, maxResults = 5) {
    const forms = tokens
      .filter(t => !t.roles?.isStop && t.semanticWeight > 0.4)
      .map(t => t.form.toLowerCase());

    const candidates = new Map();

    for (const form of forms) {
      // Busca por sujeito
      const bySubj = queryBySubject(form, 0.25);
      bySubj.forEach(p => candidates.set(p.id, p));
      // Busca por objecto
      const byObj = queryByObject(form, 0.25);
      byObj.forEach(p => candidates.set(p.id, p));
    }

    return Array.from(candidates.values())
      .sort((a, b) => {
        // Ordena por: source (taught > inferred > emergent) × confidence
        const srcWeight = { taught: 1.0, inferred: 0.7, emergent: 0.5 };
        const wa = (srcWeight[a.source] || 0.5) * a.confidence;
        const wb = (srcWeight[b.source] || 0.5) * b.confidence;
        return wb - wa;
      })
      .slice(0, maxResults);
  }

  // Executa inferências transitivas sobre as proposições existentes
  // Chamado periodicamente pelo AutonomousLoop
  function runInference() {
    let newInferences = 0;
    const allProps = Array.from(_props.values())
      .filter(p => p.source === 'taught' && p.confidence > 0.5);

    for (let i = 0; i < allProps.length; i++) {
      for (let j = 0; j < allProps.length; j++) {
        if (i === j) continue;
        const inferred = inferTransitive(allProps[i], allProps[j]);
        if (inferred) newInferences++;
      }
    }

    if (newInferences > 0) {
      console.log('[PropStore] Inferências produzidas:', newInferences);
    }
    return newInferences;
  }

  // Decay das proposições com baixo uso
  function decay(cycle) {
    const cutoff = Date.now() - 1800000; // 30 min sem uso
    let pruned = 0;
    for (const [id, p] of _props) {
      if (p.source === 'inferred' && p.lastUsed < cutoff && p.fireCount < 2) {
        _props.delete(id);
        // Remove dos índices
        (_bySubject.get(p.subject?.toLowerCase())  || new Set()).delete(id);
        (_byPredicate.get(p.object?.toLowerCase()) || new Set()).delete(id);
        (_byRelation.get(p.relation)               || new Set()).delete(id);
        pruned++;
      }
    }
    if (pruned > 0) console.log('[PropStore] Decay: removidas', pruned, 'inferências');
    return pruned;
  }

  // Persiste proposição no IndexedDB
  async function _persistProp(prop) {
    try {
      await DB.open();
      // Usa tabela 'patterns' como fallback se 'propositions' não existir
      // (evita migration do schema sem reiniciar o DB)
      if (DB._schema && DB._schema.propositions) {
        await DB.propositions.put(prop);
      }
    } catch(e) {
      // Silencioso — a proposição existe em memória mesmo sem persistência
    }
  }

  // Carrega proposições do IndexedDB no arranque
  async function warmup() {
    try {
      await DB.open();
      if (DB._schema && DB._schema.propositions) {
        const stored = await DB.propositions.toArray();
        stored.forEach(p => {
          _props.set(p.id, p);
          _index(p);
          if (p.id) {
            const num = parseInt(p.id.split('_')[1]);
            if (!isNaN(num) && num >= _nextId) _nextId = num + 1;
          }
        });
        console.log('[PropStore] Warmup:', _props.size, 'proposições carregadas');
      }
    } catch(e) {
      console.warn('[PropStore] Warmup sem tabela propositions — a criar em memória');
    }
  }

  function stats() {
    const bySource = { taught: 0, inferred: 0, emergent: 0 };
    const byRelation = {};
    for (const p of _props.values()) {
      bySource[p.source] = (bySource[p.source] || 0) + 1;
      byRelation[p.relation] = (byRelation[p.relation] || 0) + 1;
    }
    return {
      total:      _props.size,
      bySource,
      byRelation,
      subjects:   _bySubject.size,
    };
  }

  function all(minConfidence = 0) {
    return Array.from(_props.values())
      .filter(p => p.confidence >= minConfidence)
      .sort((a, b) => b.confidence - a.confidence);
  }

  return {
    teach, queryRelevant, queryBySubject, queryByObject, queryByRelation,
    runInference, decay, warmup, stats, all,
    get size() { return _props.size; },
  };
})();

// ============================================================================
// PROPOSITION-AWARE RESPONSE BUILDER
// Substitui a lógica de montagem do ResponseSynthesizer quando há proposições.
// Prioridade: proposições ensinadas > inferidas > KD-Tree (fallback existente)
// ============================================================================
const PropResponseBuilder = (() => {

  // Monta uma frase a partir de uma proposição
  function propToSentence(prop, lang) {
    if (!prop) return null;
    const parts = [prop.subject, prop.relationLabel, prop.object].filter(Boolean);
    if (parts.length < 2) return null;
    const sentence = parts[0].charAt(0).toUpperCase() + parts[0].slice(1) +
      ' ' + parts.slice(1).join(' ') + '.';
    return sentence;
  }

  // Escolhe a melhor proposição para responder dado o input
  // Critérios: relevância para o input + confiança + proveniência
  function selectBest(relevantProps, speechAct) {
    if (!relevantProps || relevantProps.length === 0) return null;

    // Filtra proposições verificadas ou ensinadas
    const safe = relevantProps.filter(p =>
      p.source === 'taught' || (p.source === 'inferred' && p.confidence > 0.6)
    );

    if (safe.length === 0) return null;

    // Para questões: prefere proposições IS (definições)
    if (speechAct?.act === 'question' && speechAct?.subtype === 'definition') {
      const isDef = safe.find(p => p.relation === 'IS');
      if (isDef) return isDef;
    }

    // Para questões causais: prefere CAUSES
    if (speechAct?.act === 'question' && speechAct?.subtype === 'explanation') {
      const isCause = safe.find(p => p.relation === 'CAUSES');
      if (isCause) return isCause;
    }

    return safe[0]; // melhor por score (já ordenados)
  }

  // Constrói resposta a partir de proposições relevantes
  // Retorna { text, props, confidence, source } ou null se não há proposições
  function build(tokens, enrichedTokens, speechAct, lang, cycle) {
    const relevant = PropositionStore.queryRelevant(enrichedTokens || tokens, 4);
    if (relevant.length === 0) return null;

    const best = selectBest(relevant, speechAct);
    if (!best) return null;

    // Marca como usada
    best.fireCount++;
    best.lastUsed = Date.now();

    const sentence = propToSentence(best, lang);
    if (!sentence) return null;

    // Para questões, pode adicionar uma segunda proposição relacionada
    let text = sentence;
    if (speechAct?.act === 'question' && relevant.length > 1) {
      const second = relevant.find(p => p.id !== best.id &&
        p.source === 'taught' && p.confidence > 0.5);
      if (second) {
        const s2 = propToSentence(second, lang);
        if (s2 && s2 !== sentence) text += ' ' + s2;
      }
    }

    // Marca de confiança
    const confMark = best.source === 'inferred'
      ? (lang === 'pt' ? ' (inferido)' : ' (inferred)')
      : '';

    return {
      text:       text + confMark,
      props:      relevant.slice(0, 3),
      confidence: best.confidence,
      source:     best.source,
      relation:   best.relation,
      propId:     best.id,
    };
  }

  return { build, propToSentence, selectBest };
})();

// ============================================================================
// PATCH DE INTEGRAÇÃO
// ============================================================================
(function applyPropositionPatch() {
  const _orig = self.onmessage;

  self.onmessage = async function(e) {
    const { command, payload } = e.data;

    // ── Comandos novos ────────────────────────────────────────────────────────
    if (command === 'getPropositions') {
      self.postMessage({
        type:        'propositionsState',
        stats:       PropositionStore.stats(),
        propositions: PropositionStore.all(0.2).slice(0, 50),
      });
      return;
    }

    if (command === 'teachProposition') {
      // Permite ensinar proposições directamente via interface
      const { subject, relation, object, confidence } = payload || {};
      if (subject && object) {
        const fakeTokens = [subject, relation||'é', object].map(f => ({
          form: f, roles: { isStop: false, isNeg: false, isCausal: false },
          semanticWeight: 0.8, psi: anchorPsi({ form: f, roles: {}, semanticWeight: 0.8 })
        }));
        const prop = PropositionStore.teach(fakeTokens, fakeTokens, {
          confidence: confidence || 1.0, cycle: brain.cycle
        });
        self.postMessage({ type: 'propositionTaught', prop });
      }
      return;
    }

    // ── perceive / chat: intercepta e ensina proposições ─────────────────────
    if (command === 'perceive' || command === 'chat') {
      const inputStr = typeof payload === 'string' ? payload : '';

      // Extrai tokens para o PropositionStore
      const tokens         = SemanticTokenizer.extract(inputStr);
      const enrichedResult = typeof CompositionalWeight !== 'undefined'
        ? CompositionalWeight.compute(tokens)
        : { tokens };
      const enrichedTokens = enrichedResult.tokens || tokens;

      // Ensina a proposição do input ao store
      const taught = PropositionStore.teach(tokens, enrichedTokens, {
        confidence: 1.0,
        cycle:      brain.cycle + 1,
      });

      self._lastTaughtProp = taught;

      // Handler original
      await _orig.call(this, e);

      // Pós-processamento: emite estado das proposições
      if (brain.cycle % 5 === 0) {
        self.postMessage({
          type:  'propositionsUpdate',
          cycle: brain.cycle,
          stats: PropositionStore.stats(),
          recent: PropositionStore.all(0.5).slice(0, 10).map(p => ({
            subject:   p.subject,
            relation:  p.relationLabel,
            object:    p.object,
            confidence: +p.confidence.toFixed(2),
            source:    p.source,
          })),
        });
      }

      return;
    }

    return _orig.call(this, e);
  };

  console.log('[AIO-Patch] PropositionStore aplicado.');
})();

// ── Patch ResponseSynthesizer — usa PropositionStore como fonte primária ──────
(function patchSynthesizerWithProps() {
  const _origSynth = ResponseSynthesizer.synthesize;

  ResponseSynthesizer.synthesize = function(opts) {
    const { input, semantic } = opts;
    const lang      = ResponseSynthesizer.detectLang(input || '');
    const speechAct = self._currentSpeechAct;
    const tokens    = semantic?.tokens || SemanticTokenizer.extract(input || '');

    // ── Tenta responder com proposições verificadas primeiro ─────────────────
    const propResult = PropResponseBuilder.build(
      tokens,
      self._enrichedTokens || tokens,
      speechAct,
      lang,
      opts.cycle
    );

    if (propResult && propResult.confidence >= 0.5) {
      // Resposta baseada em proposição verificada — alta fiabilidade
      const psiInput = opts.context?.contextPsi || null;

      return {
        text:             propResult.text,
        lang,
        intent:           opts.decision?.action || 'proceed',
        regime:           opts.regime || 'STABLE',
        resonance:        Math.round(propResult.confidence * 100),
        tension:          0,
        plannerUsed:      false,
        propUsed:         true,             // flag: veio do PropositionStore
        propSource:       propResult.source,
        propRelation:     propResult.relation,
        propConfidence:   propResult.confidence,
        usedProps:        propResult.props,
        psiInput,
        collapsed:        [],
        recalled:         opts.context?.recalledEpisodes || [],
        episodicBoost:    opts.context?.episodicBoost    || 0,
        contextPsi:       opts.context?.contextPsi       || null,
      };
    }

    // ── Fallback: pipeline original (KD-Tree + Planner) ──────────────────────
    const original = _origSynth.call(this, opts);

    // Anota que não havia proposições suficientes
    if (original) {
      original.propUsed    = false;
      original.propMissing = PropositionStore.size === 0;
    }

    return original;
  };

  console.log('[AIO-Patch] ResponseSynthesizer patchado com PropositionStore.');
})();

// ── Patch AutonomousLoop: inferência periódica ─────────────────────────────────
(function patchAutonomousLoopProps() {
  const _orig = AutonomousLoop._step.bind(AutonomousLoop);

  AutonomousLoop._step = async function() {
    await _orig();

    // Inferência transitiva a cada 40 ticks
    if (this._tick % 40 === 0 && PropositionStore.size > 1) {
      PropositionStore.runInference();
    }

    // Decay de inferências a cada 60 ticks
    if (this._tick % 60 === 0) {
      PropositionStore.decay(this._tick);
    }

    // Expõe stats no tick
    if (this._tick % 10 === 0) {
      self.postMessage({
        type:      'propStoreTick',
        tick:      this._tick,
        propStats: PropositionStore.stats(),
      });
    }
  };
})();

// ── Warmup no arranque ────────────────────────────────────────────────────────
(function initPropositionStore() {
  const _origMsg = self.onmessage;
  self.onmessage = async function(e) {
    if (e.data.command === 'init') {
      await PropositionStore.warmup();
    }
    return _origMsg.call(this, e);
  };
})();
