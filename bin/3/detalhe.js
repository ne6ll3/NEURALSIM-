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
  // Defesa em profundidade: aceita também 'e' isolado de um único carácter
  // SE estiver rodeado de substantivos de ambos os lados (compensação para
  // casos residuais de degradação Unicode que o fix NFC->NFC já deveria
  // ter prevenido, mas mantém-se como rede de segurança)
  if (forms.some(f => ['é','são','era','será','ser','is','are','was','were'].includes(f)))
    return RelationTypes.IS;
  if (forms.includes('e') && tokens.length >= 3) {
    const eIdx = forms.indexOf('e');
    // Só trata 'e' isolado como cópula se está exactamente entre dois
    // tokens de conteúdo (não é genuinamente a conjunção "e" ligando
    // duas frases ou listas — heurística: posição central, frase curta)
    if (eIdx > 0 && eIdx < forms.length - 1 && tokens.length <= 4) {
      return RelationTypes.IS;
    }
  }

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

  // Verbos de estado/mudança que funcionam como equivalência num registo
  // mais informal: "parar", "estagnar", "mover", "fluir" — quando aparecem
  // como predicado principal sem outro marcador, tratamos como IS para
  // permitir verificação de (in)compatibilidade semântica via OPPOSES manual
  const STATE_VERBS = ['parar','estagnar','mover','fluir','mudar','permanecer',
                        'continuar','cessar','persistir','stop','stagnate','flow','change'];
  if (forms.some(f => STATE_VERBS.includes(f)))
    return RelationTypes.IS;

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
  // Conflitos activos: key "subject::relation::object" → { existingProp, attempts, lastCycle }
  const _conflicts   = new Map();

  // Estrutura de uma proposição
  // polarity: +1 = afirmativa ("X é Y"), -1 = negativa ("X não é Y")
  function makeProp(subject, predicate, object, relation, opts = {}) {
    return {
      id:           'p_' + (_nextId++) + '_' + Date.now(),
      subject:      subject,
      predicate:    predicate,
      object:       object,
      relation:     relation.code,
      relationLabel:relation.label,
      polarity:     opts.polarity != null ? opts.polarity : 1, // +1 ou -1
      confidence:   opts.confidence || 1.0,
      source:       opts.source    || 'taught',
      cycle:        opts.cycle     || 0,
      createdAt:    Date.now(),
      fireCount:    0,
      lastUsed:     Date.now(),
      verified:     opts.verified !== false,
      psiSubject:   opts.psiSubject   || null,
      psiObject:    opts.psiObject    || null,
      derivedFrom:  opts.derivedFrom || null,
      // Estado do ciclo de vida: 'active' | 'deprecated' | 'disputed'
      // deprecated = candidata a remoção pelo Dream Cycle, não imediata
      // disputed   = contradita por uma correcção explícita, mantida para auditoria
      state:        opts.state || 'active',
      deprecatedAt: null,
      // Cadeia de correcção: liga proposições substituídas e substituintes
      supersedes:     opts.supersedes     || null, // id da proposição que esta substitui
      supersededBy:   null,                          // preenchido quando outra a substitui
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
  // Conflicto real: mesmo sujeito + mesmo objecto + mesma relação + POLARIDADE OPOSTA
  // Isso é uma contradição genuína: "X é Y" e "X não é Y" não podem coexistir
  function _hasConflict(subject, object, relation, polarity = 1) {
    const ids = _bySubject.get(subject.toLowerCase()) || new Set();
    for (const id of ids) {
      const p = _props.get(id);
      if (!p) continue;
      if (p.object?.toLowerCase() === object?.toLowerCase() &&
          p.relation === relation.code) {
        if (p.polarity !== polarity) return { type: 'contradiction', existingProp: p };
        return 'duplicate';
      }
      if (p.object?.toLowerCase() === object?.toLowerCase() && relation.code === 'OPPOSES') {
        return { type: 'opposes', existingProp: p };
      }
    }
    return false;
  }

  // Extrai sujeito, predicado, objecto E POLARIDADE de uma sequência de tokens
  // A polaridade vem de roles.isNeg / roles.underNegation já calculados
  // pelo SemanticTokenizer — só precisava de chegar até aqui, e agora chega.
  function _extractSPO(tokens, enrichedTokens) {
    const toks = enrichedTokens || tokens;
    const meaningful = toks.filter(t => !t.roles?.isStop && t.form?.length > 1);

    let subject = null, predicate = null, object = null;

    for (const t of meaningful) {
      const mc = t.psi?.morphClass || '';
      if (['SUBSTANTIVO','PRONOME','PROPRIO','ACRONIMO','VERBO_INF'].includes(mc)) {
        if (!subject) { subject = t; continue; }
      }
    }

    for (const t of meaningful) {
      const mc = t.psi?.morphClass || '';
      if (mc.startsWith('VERBO') && t !== subject) {
        if (!predicate) { predicate = t; continue; }
      }
    }

    // Objecto: inclui tokens sob negação — a negação define a POLARIDADE,
    // não exclui o objecto
    if (predicate) {
      const predIdx = meaningful.indexOf(predicate);
      const afterPred = meaningful.slice(predIdx + 1).filter(t => !t.roles?.isCausal);
      if (afterPred.length > 0) object = afterPred[0];
    }

    // FIX: cópula implícita — "Parar [é] contínuo" sem verbo "é" escrito.
    // Se não há objecto distinto do predicado, o "predicado" detectado é na
    // verdade o complemento de uma relação implícita (normalmente IS).
    // Evita a colisão onde object === predicate (mesmo token duplicado).
    if (!object && predicate && predicate !== subject) {
      object    = predicate;
      predicate = null; // a relação fica a cargo do RelationType detectado
    }

    if (!subject && meaningful.length > 0) subject = meaningful[0];
    if (!object  && meaningful.length > 1) {
      const candidate = meaningful[meaningful.length - 1];
      if (candidate !== subject) object = candidate;
    }

    // ── Determina polaridade da proposição ─────────────────────────────────
    // Negativa se: há um marcador de negação ANTES do predicado ou objecto,
    // ou se o predicado/objecto está marcado underNegation pelo tokenizer
    let polarity = 1;
    const hasNegMarker = meaningful.some(t => t.roles?.isNeg);
    const predUnderNeg = predicate?.roles?.underNegation;
    const objUnderNeg  = object?.roles?.underNegation;

    if (hasNegMarker && (predUnderNeg || objUnderNeg || !predicate)) {
      polarity = -1;
    }
    // Caso "X não Y" sem verbo cópula claro (negação adjacente ao objecto)
    if (hasNegMarker && !predUnderNeg && !objUnderNeg && predicate) {
      // Verifica se o negador está logo antes do predicado na sequência original
      const negIdx  = meaningful.findIndex(t => t.roles?.isNeg);
      const predIdx = meaningful.indexOf(predicate);
      if (negIdx >= 0 && negIdx < predIdx) polarity = -1;
    }

    return {
      subject:   subject?.form   || null,
      predicate: predicate?.form || null,
      object:    object?.form    || null,
      psiSubject: subject?.psi   || null,
      psiObject:  object?.psi    || null,
      polarity,
    };
  }

  // ── API pública ─────────────────────────────────────────────────────────────

  // Adiciona uma proposição ensinada directamente
  function teach(tokens, enrichedTokens, opts = {}) {
    const spo      = _extractSPO(tokens, enrichedTokens);
    if (!spo.subject) return null;

    const relation = detectRelationType(enrichedTokens || tokens);

    // FIX: bloqueia ensino de fragmentos vazios — perguntas e fragmentos
    // sem relação real detectada (UNKNOWN) E sem objecto algum não têm
    // conteúdo factual nenhum. Ensiná-los só poluiria o store com entradas
    // que mais tarde aparecem em queryRelevant sem servir de nada.
    // Ex: "O que é o fogo" sem cópula reconhecida → não ensina nada.
    if (relation.code === 'UNKNOWN' && !spo.object && !spo.predicate) {
      return null;
    }

    // Verifica conflicto — agora considera polaridade
    const conflict = _hasConflict(spo.subject, spo.object, relation, spo.polarity);
    if (conflict === 'duplicate') {
      const ids = _bySubject.get(spo.subject.toLowerCase()) || new Set();
      for (const id of ids) {
        const p = _props.get(id);
        if (p && p.relation === relation.code && p.polarity === spo.polarity &&
            p.object?.toLowerCase() === spo.object?.toLowerCase()) {
          p.fireCount++;
          p.confidence = Math.min(1, p.confidence + 0.05);
          p.lastUsed   = Date.now();
          _persistProp(p);
          return p;
        }
      }
    }
    // FIX: conflito real NÃO é mais silenciado. É registado e devolvido
    // como objecto de conflito explícito — para a resposta poder reconhecer
    // a contradição em vez de reafirmar a crença antiga com confiança total.
    if (conflict && conflict.type) {
      const key = spo.subject.toLowerCase() + '::' + relation.code + '::' + (spo.object||'').toLowerCase();
      const existing = _conflicts.get(key);
      const entry = existing || { existingProp: conflict.existingProp, attempts: [], lastCycle: 0 };
      entry.attempts.push({ polarity: spo.polarity, cycle: opts.cycle || 0, ts: Date.now() });
      entry.lastCycle = opts.cycle || 0;
      _conflicts.set(key, entry);

      // Marca a proposição existente como disputada — reduz a sua confiança
      // ligeiramente a cada disputa, em vez de mantê-la intocável
      conflict.existingProp.disputed     = true;
      conflict.existingProp.disputeCount = (conflict.existingProp.disputeCount || 0) + 1;
      conflict.existingProp.confidence   = Math.max(0.3,
        conflict.existingProp.confidence - 0.1
      );
      _persistProp(conflict.existingProp);

      console.warn('[PropStore] CONFLITO:', spo.subject, relation.code, spo.object,
        '— existente conf:', conflict.existingProp.confidence.toFixed(2),
        '| disputas:', conflict.existingProp.disputeCount);

      return {
        conflict:     true,
        existingProp: conflict.existingProp,
        attemptedPolarity: spo.polarity,
        subject: spo.subject, object: spo.object, relation: relation.code,
      };
    }

    const prop = makeProp(
      spo.subject, spo.predicate, spo.object, relation,
      {
        confidence: opts.confidence || 1.0,
        source:     'taught',
        cycle:      opts.cycle || 0,
        psiSubject: spo.psiSubject,
        psiObject:  spo.psiObject,
        polarity:   spo.polarity,
        verified:   true,
      }
    );

    _props.set(prop.id, prop);
    _index(prop);
    _persistProp(prop);

    const polSign = prop.polarity === -1 ? 'NÃO ' : '';
    console.log('[PropStore] Ensinado:', prop.subject, polSign + prop.relationLabel, prop.object,
      '| conf:', prop.confidence.toFixed(2));
    return prop;
  }

  // ── TABELA DE VERDADE DE POLARIDADE ────────────────────────────────────────
  // Combina a polaridade de duas proposições em cadeia transitiva.
  // Regra fundamental: dupla negação sobre termos DIFERENTES não produz
  // afirmação — produz INCERTEZA. Só produz afirmação quando os termos
  // são literalmente equivalentes (mesma relação IS usada simetricamente).
  //
  //  polA  polB  →  resultado
  //  +1    +1    →  +1   (A é B, B é C ⊢ A é C)
  //  -1    +1    →  -1   (A não é B, B é C ⊢ A não é C)
  //  +1    -1    →  -1   (A é B, B não é C ⊢ A não é C)
  //  -1    -1    →  null (A não é B, B não é C ⊢ NADA — incerto, não infere)
  function combinePolarity(polA, polB) {
    if (polA === 1  && polB === 1)  return 1;
    if (polA === -1 && polB === 1)  return -1;
    if (polA === 1  && polB === -1) return -1;
    if (polA === -1 && polB === -1) return null; // bloqueia inferência
    return null;
  }

  // Infere uma proposição a partir de duas existentes (transitividade com polaridade)
  // "A rel B" + "B rel C" → "A rel C" com polaridade combinada e confiança reduzida
  function inferTransitive(propA, propB) {
    if (!propA || !propB) return null;
    const rtA = RelationTypes[propA.relation];
    const rtB = RelationTypes[propB.relation];
    if (!rtA || !rtB) return null;

    // Verifica compatibilidade: propA.object === propB.subject
    if (propA.object?.toLowerCase() !== propB.subject?.toLowerCase()) return null;

    // Verifica que os tipos de relação são compatíveis para transitividade
    if (!rtA.combinesWith.includes(propB.relation)) return null;

    // ── Aplica a tabela de verdade de polaridade ──────────────────────────
    const resultPolarity = combinePolarity(propA.polarity, propB.polarity);
    if (resultPolarity === null) {
      // Dupla negação sobre termos diferentes — não infere, regista para auditoria
      console.log('[PropStore] Inferência bloqueada (dupla negação incerta):',
        propA.subject, '/', propA.relationLabel, '/', propA.object,
        '+', propB.subject, '/', propB.relationLabel, '/', propB.object);
      return null;
    }

    // Confiança da inferência: produto das confianças × penalidade de inferência
    // Penalidade maior quando há negação envolvida (mais propenso a erro)
    const negationPenalty = (propA.polarity === -1 || propB.polarity === -1) ? 0.6 : 0.7;
    const inferredConf = propA.confidence * propB.confidence * negationPenalty;
    if (inferredConf < 0.3) return null;

    const conflict = _hasConflict(propA.subject, propB.object, rtA, resultPolarity);
    if (conflict === true) {
      console.warn('[PropStore] Inferência geraria contradição — bloqueada:',
        propA.subject, rtA.label, propB.object);
      return null;
    }
    if (conflict === 'duplicate') return null; // já existe, não duplica

    const prop = makeProp(
      propA.subject, propA.predicate, propB.object, rtA,
      {
        confidence:  +inferredConf.toFixed(3),
        source:      'inferred',
        cycle:       propA.cycle,
        polarity:    resultPolarity,
        verified:    false,
        derivedFrom: [propA.id, propB.id],
      }
    );

    _props.set(prop.id, prop);
    _index(prop);
    _persistProp(prop);

    const polSign = resultPolarity === -1 ? 'NÃO ' : '';
    console.log('[PropStore] Inferido:', prop.subject, polSign + prop.relationLabel, prop.object,
      '| conf:', prop.confidence.toFixed(2), '(inferred, de', propA.id, '+', propB.id, ')');
    return prop;
  }

  // Busca proposições sobre um sujeito — exclui 'deprecated' por defeito
  function queryBySubject(subjectForm, minConfidence = 0.3, includeDeprecated = false) {
    const ids = _bySubject.get(subjectForm.toLowerCase()) || new Set();
    return Array.from(ids)
      .map(id => _props.get(id))
      .filter(p => p && p.confidence >= minConfidence &&
                   (includeDeprecated || p.state !== 'deprecated'))
      .sort((a, b) => b.confidence - a.confidence);
  }

  // Busca proposições por objecto (busca inversa) — exclui 'deprecated' por defeito
  function queryByObject(objectForm, minConfidence = 0.3, includeDeprecated = false) {
    const ids = _byPredicate.get(objectForm.toLowerCase()) || new Set();
    return Array.from(ids)
      .map(id => _props.get(id))
      .filter(p => p && p.confidence >= minConfidence &&
                   (includeDeprecated || p.state !== 'deprecated'))
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

  // Consulta se existe conflito activo envolvendo um sujeito
  function getActiveConflict(subjectForm) {
    if (!subjectForm) return null;
    const sLower = subjectForm.toLowerCase();
    for (const [key, entry] of _conflicts) {
      if (key.startsWith(sLower + '::')) return { key, ...entry };
    }
    return null;
  }

  // ── DEPRECATE: marca proposições como candidatas a remoção gradual ──────────
  // Não apaga nada imediatamente. O Dream Cycle decide depois se purga.
  // Devolve o número de proposições marcadas.
  function deprecate(subjectForm, objectForm) {
    if (!subjectForm) return 0;
    const sLower = subjectForm.toLowerCase();
    const oLower = objectForm ? objectForm.toLowerCase() : null;
    const ids = _bySubject.get(sLower) || new Set();
    let marked = 0;

    for (const id of ids) {
      const p = _props.get(id);
      if (!p || p.state === 'deprecated') continue;
      if (oLower && p.object?.toLowerCase() !== oLower) continue;
      p.state        = 'deprecated';
      p.deprecatedAt = Date.now();
      marked++;
    }

    if (marked > 0) console.log('[PropStore] Marcado para esquecimento gradual:',
      subjectForm, objectForm||'(todos)', '|', marked, 'proposições');
    return marked;
  }

  // ── PURGE: remove de facto proposições deprecated há tempo suficiente ───────
  // Chamado pelo Dream Cycle, não pelo utilizador directamente.
  // Só purga se: está deprecated há mais de minAgeMs E não foi reforçada
  // (fireCount baixo) desde que foi marcada — protege contra remoção de
  // conhecimento que continua a ser activamente útil.
  function purgeDeprecated(minAgeMs = 300000, maxFireCount = 1) {
    const now = Date.now();
    let purged = 0;

    for (const [id, p] of Array.from(_props)) {
      if (p.state !== 'deprecated') continue;
      const age = now - (p.deprecatedAt || now);
      if (age < minAgeMs) continue;
      if (p.fireCount > maxFireCount) {
        // Foi usada desde que foi marcada — reactiva em vez de purgar
        p.state = 'active';
        p.deprecatedAt = null;
        console.log('[PropStore] Reactivada (uso recente):', p.subject, p.object);
        continue;
      }

      _props.delete(id);
      (_bySubject.get(p.subject?.toLowerCase())  || new Set()).delete(id);
      (_byPredicate.get(p.object?.toLowerCase()) || new Set()).delete(id);
      (_byRelation.get(p.relation)               || new Set()).delete(id);
      purged++;
    }

    if (purged > 0) console.log('[PropStore] Dream Cycle purgou', purged, 'proposições deprecated');
    return purged;
  }

  // ── DISPUTE: demove uma proposição em conflito com uma correcção,
  // sem a apagar. Mantém-na visível para auditoria (/why), com peso
  // estrutural reduzido — em vez de "dados flutuantes sem peso", a
  // contradição fica registada e ponderada.
  function disputeProp(prop, supersedingId) {
    if (!prop) return;
    prop.disputed     = true;
    prop.confidence    = Math.max(0.05, prop.confidence * 0.15);
    prop.supersededBy = supersedingId || prop.supersededBy;
    _persistProp(prop);
  }

  // Remove proposições reais do store — usado apenas internamente pelo
  // purgeDeprecated() e por /forget como fallback directo se necessário.
  // Devolve o número de proposições removidas.
  function retract(subjectForm, objectForm) {
    if (!subjectForm) return 0;
    const sLower = subjectForm.toLowerCase();
    const oLower = objectForm ? objectForm.toLowerCase() : null;
    const ids = _bySubject.get(sLower) || new Set();
    let removed = 0;

    for (const id of Array.from(ids)) {
      const p = _props.get(id);
      if (!p) continue;
      if (oLower && p.object?.toLowerCase() !== oLower) continue;

      _props.delete(id);
      (_bySubject.get(p.subject?.toLowerCase())  || new Set()).delete(id);
      (_byPredicate.get(p.object?.toLowerCase()) || new Set()).delete(id);
      (_byRelation.get(p.relation)               || new Set()).delete(id);
      removed++;
    }

    // Limpa conflitos associados a este sujeito — já não há proposição a disputar
    for (const key of Array.from(_conflicts.keys())) {
      if (key.startsWith(sLower + '::')) _conflicts.delete(key);
    }

    if (removed > 0) console.log('[PropStore] Retraído:', subjectForm, objectForm||'(todos)', '|', removed, 'proposições removidas');
    return removed;
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
    runInference, decay, warmup, stats, all, getActiveConflict, retract,
    deprecate, purgeDeprecated, disputeProp,
    get size() { return _props.size; },
  };
})();

// ============================================================================
// PROPOSITION-AWARE RESPONSE BUILDER
// Substitui a lógica de montagem do ResponseSynthesizer quando há proposições.
// Prioridade: proposições ensinadas > inferidas > KD-Tree (fallback existente)
// ============================================================================
const PropResponseBuilder = (() => {

  // Monta uma frase a partir de uma proposição — RESPEITA POLARIDADE
  function propToSentence(prop, lang) {
    if (!prop) return null;
    const subj = prop.subject.charAt(0).toUpperCase() + prop.subject.slice(1);
    const neg  = prop.polarity === -1 ? (lang === 'pt' ? 'não ' : "doesn't ") : '';

    if (!prop.object) {
      return `${subj} ${neg}${prop.relationLabel}.`;
    }
    return `${subj} ${neg}${prop.relationLabel} ${prop.object}.`;
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

    // ── FIX: verifica conflito activo ANTES de responder com confiança ──────
    // Se o utilizador acabou de contradizer uma crença existente, a resposta
    // deve reconhecer a tensão, não reafirmar a crença antiga como se nada
    // tivesse acontecido.
    const meaningfulTokens = (enrichedTokens || tokens).filter(t => !t.roles?.isStop);
    for (const tok of meaningfulTokens) {
      const activeConflict = PropositionStore.getActiveConflict(tok.form);
      if (activeConflict) {
        const ep = activeConflict.existingProp;
        const neg = ep.polarity === -1 ? (lang==='pt' ? 'não ' : "doesn't ") : '';
        const oldStatement = lang === 'pt'
          ? `Disseste algo diferente de "${ep.subject} ${neg}${ep.relationLabel} ${ep.object}", que eu já tinha aprendido (confiança ${Math.round(ep.confidence*100)}%).`
          : `You said something different from "${ep.subject} ${neg}${ep.relationLabel} ${ep.object}", which I had already learned (confidence ${Math.round(ep.confidence*100)}%).`;
        return {
          text:       oldStatement,
          props:      [ep],
          confidence: 0.5, // intencionalmente moderada — é uma tensão, não uma certeza
          source:     'conflict',
          relation:   ep.relation,
          isConflict: true,
        };
      }
    }

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
    // FIX: agora valida que a segunda proposição tem objecto real e não é
    // um fragmento sem sentido ("Parar é." sem complemento)
    let text = sentence;
    if (speechAct?.act === 'question' && relevant.length > 1) {
      const second = relevant.find(p => p.id !== best.id &&
        p.source === 'taught' && p.confidence > 0.5 && p.object);
      if (second) {
        const s2 = propToSentence(second, lang);
        if (s2 && s2 !== sentence && s2.length > 4) text += ' ' + s2;
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

      // FIX: distingue resultado normal de conflito explícito
      if (taught && taught.conflict) {
        self._lastTaughtProp = null;
        self._lastConflict   = taught;
        // Conflito real bumps frustração — consistente com o resto do sistema
        Metacognition.update({ frustration: 0.12, confidence: -0.05 });
        console.warn('[CONFLICT]', taught.subject, taught.relation, taught.object);
      } else {
        self._lastTaughtProp = taught;
        self._lastConflict   = null;
      }

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