// ============================================================================
// AIO-PATCH — SEMANTIC DEPTH
// Peso composicional, memória emocional por nó, rastreador do "X",
// crenças emergentes.
// Aplica sobre aio-worker-v4.js + aio-patch-context.js
// via importScripts() ou concatenação.
// ============================================================================

// ============================================================================
// 1. COMPOSITIONAL WEIGHT
// O peso de uma proposição é diferente da soma dos tokens.
// Calcula o peso real de unidades semânticas compostas:
//   - sintagma nominal (det + noun + adj)
//   - sintagma verbal (verb + neg + adv)
//   - proposição completa (subj + pred + obj)
// Módula o semanticWeight de cada token pelo impacto composicional.
// ============================================================================
const CompositionalWeight = (() => {

  // Peso base por papel sintáctico na proposição
  const ROLE_BASE = {
    subject:   0.35,  // ancora a proposição
    predicate: 0.40,  // define a relação — maior peso base
    object:    0.20,  // complementa
    modifier:  0.05,  // ajuste marginal
    negation:  0.00,  // não contribui directamente — amplifica outros
    connector: 0.00,  // estrutural
  };

  // Calcula o peso composicional de uma sequência de tokens
  // tokens: array de { form, psi, roles, semanticWeight, negationChain }
  // Devolve: { tokens com compositionalWeight, phraseWeight, tensions }
  function compute(tokens) {
    if (!tokens || tokens.length === 0) return { tokens: [], phraseWeight: 0, tensions: [] };

    const meaningful = tokens.filter(t => !t.roles.isStop && t.semanticWeight > 0.1);
    if (meaningful.length === 0) return { tokens, phraseWeight: 0, tensions: [] };

    // ── Passo 1: detecta unidades compostas ──────────────────────────────
    // Negação inverte e amplifica: "não aquece" tem peso maior que "aquece"
    // porque a contradição da expectativa é mais saliente
    const negationTargets = new Set();
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].roles.isNeg) {
        // Os 3 tokens seguintes estão sob negação
        for (let j = i+1; j < Math.min(i+4, tokens.length); j++) {
          negationTargets.add(j);
        }
      }
    }

    // Intensificadores amplificam o token seguinte
    const intensifiedTargets = new Map(); // index → multiplicador
    for (let i = 0; i < tokens.length - 1; i++) {
      if (tokens[i].roles.isIntens) {
        intensifiedTargets.set(i+1, 1.35);
      }
    }

    // Hedges atenuam o token seguinte
    const hedgedTargets = new Map();
    for (let i = 0; i < tokens.length - 1; i++) {
      if (tokens[i].roles.isHedge) {
        hedgedTargets.set(i+1, 0.65);
      }
    }

    // ── Passo 2: peso composicional por token ─────────────────────────────
    const enriched = tokens.map((token, idx) => {
      let cw = token.semanticWeight || 0.5;

      // Negação: o token negado tem peso amplificado (contradição é saliente)
      if (negationTargets.has(idx)) cw *= 1.25;

      // Intensificador: amplifica
      if (intensifiedTargets.has(idx)) cw *= intensifiedTargets.get(idx);

      // Hedge: atenua
      if (hedgedTargets.has(idx)) cw *= hedgedTargets.get(idx);

      // Causalidade: tokens causais têm peso estrutural alto
      if (token.roles.isCausal) cw = Math.max(cw, 0.85);

      // Clamp [0, 1]
      cw = Math.min(1, Math.max(0, cw));

      return { ...token, compositionalWeight: +cw.toFixed(3) };
    });

    // ── Passo 3: peso da proposição inteira ───────────────────────────────
    // Não é a média — é uma função que penaliza proposições sem predicado
    // e valoriza proposições com relação causal ou de negação
    const hasPredicado = enriched.some(t => {
      const mc = t.psi && t.psi.morphClass;
      return mc && mc.startsWith('VERBO');
    });
    const hasCausal  = enriched.some(t => t.roles.isCausal);
    const hasNeg     = enriched.some(t => t.roles.isNeg);
    const hasIntens  = enriched.some(t => t.roles.isIntens);

    const meaningfulEnriched = enriched.filter(t => !t.roles.isStop && t.compositionalWeight > 0.1);
    const baseWeight = meaningfulEnriched.length > 0
      ? meaningfulEnriched.reduce((s,t) => s + t.compositionalWeight, 0) / meaningfulEnriched.length
      : 0;

    let phraseWeight = baseWeight;
    if (!hasPredicado) phraseWeight *= 0.70; // proposição incompleta
    if (hasCausal)     phraseWeight *= 1.20; // relação causal → mais peso
    if (hasNeg)        phraseWeight *= 1.15; // contradição → mais saliente
    if (hasIntens)     phraseWeight *= 1.10; // intensificado → mais saliente
    phraseWeight = Math.min(1, phraseWeight);

    // ── Passo 4: detecta tensões composicionais ───────────────────────────
    // Uma tensão é uma negação sobre um conceito de alto peso semântico
    const tensions = [];
    for (let i = 0; i < enriched.length; i++) {
      if (enriched[i].roles.isNeg) {
        const targets = enriched.slice(i+1, i+4).filter(t => t.compositionalWeight > 0.5);
        for (const tgt of targets) {
          tensions.push({
            negator:  enriched[i].form,
            concept:  tgt.form,
            weight:   tgt.compositionalWeight,
            position: i,
          });
        }
      }
    }

    return { tokens: enriched, phraseWeight: +phraseWeight.toFixed(3), tensions };
  }

  // Identifica o token de maior impacto composicional numa frase
  // É o candidato ao "X" local da proposição
  function dominantToken(enrichedTokens) {
    const meaningful = enrichedTokens.filter(t =>
      !t.roles.isStop && !t.roles.isNeg && !t.roles.isIntens && !t.roles.isHedge
    );
    if (meaningful.length === 0) return null;
    return meaningful.reduce((a, b) =>
      (b.compositionalWeight || 0) > (a.compositionalWeight || 0) ? b : a
    );
  }

  return { compute, dominantToken };
})();

// ============================================================================
// 2. EMOTIONAL MEMORY PER NODE
// Cada nó regista o estado metacognitivo médio das suas activações.
// Conceitos activados em contextos de alta frustração ficam marcados
// como "tensos". O semanticWeight é modulado por esse histórico.
// ============================================================================
const EmotionalMemory = {

  // Actualiza a memória emocional de um nó com o estado metacognitivo actual
  // node: nó do NeuralGraph
  // meta: { arousal, frustration, confidence, surprise }
  // activationStrength: força da activação neste ciclo
  record(node, meta, activationStrength) {
    if (!node) return;

    if (!node.emotionalHistory) {
      node.emotionalHistory = {
        samples:        0,
        avgFrustration: 0,
        avgArousal:     0,
        avgConfidence:  0,
        avgSurprise:    0,
        tensionEvents:  0,  // vezes que foi activado com frustração > 0.5
        peakFrustration: 0,
        lastEmotionalCycle: 0,
      };
    }

    const h  = node.emotionalHistory;
    const n  = h.samples;
    const lr = 1 / (n + 1); // learning rate decrescente — primeiros samples pesam mais

    // Média móvel exponencial
    h.avgFrustration = h.avgFrustration * (1 - lr) + (meta.frustration || 0) * lr;
    h.avgArousal     = h.avgArousal     * (1 - lr) + (meta.arousal     || 0) * lr;
    h.avgConfidence  = h.avgConfidence  * (1 - lr) + (meta.confidence  || 0) * lr;
    h.avgSurprise    = h.avgSurprise    * (1 - lr) + (meta.surprise    || 0) * lr;
    h.samples        = Math.min(n + 1, 1000); // cap para estabilidade numérica

    if ((meta.frustration || 0) > 0.5) {
      h.tensionEvents++;
      h.peakFrustration = Math.max(h.peakFrustration, meta.frustration);
    }

    h.lastEmotionalCycle = meta.age || 0;
  },

  // Calcula o modificador emocional do peso do token
  // Conceitos "tensos" têm peso reduzido (o agente hesita)
  // Conceitos activados com alta confiança têm peso amplificado
  weightModifier(node) {
    if (!node || !node.emotionalHistory) return 1.0;
    const h = node.emotionalHistory;
    if (h.samples < 3) return 1.0; // sem histórico suficiente

    // Tensão: reduz peso (o agente evita conceitos problemáticos)
    const tensionRatio  = h.tensionEvents / Math.max(1, h.samples);
    const tensionPenalty = 1 - (tensionRatio * 0.3); // máx 30% de penalidade

    // Confiança: amplifica peso
    const confidenceBoost = 1 + (h.avgConfidence - 0.5) * 0.2;

    return Math.max(0.4, Math.min(1.4, tensionPenalty * confidenceBoost));
  },

  // Serializa o perfil emocional de um nó para exposição ao cliente
  profile(node) {
    if (!node || !node.emotionalHistory) return null;
    const h = node.emotionalHistory;
    return {
      samples:         h.samples,
      avgFrustration:  +h.avgFrustration.toFixed(3),
      avgArousal:      +h.avgArousal.toFixed(3),
      avgConfidence:   +h.avgConfidence.toFixed(3),
      tensionEvents:   h.tensionEvents,
      peakFrustration: +h.peakFrustration.toFixed(3),
      isTense:         h.avgFrustration > 0.4 || h.tensionEvents > 5,
    };
  },

  // Aplica memória emocional a todos os nós activos no ciclo
  applyToActive(activeNodes, meta) {
    for (const node of activeNodes) {
      this.record(node, meta, node.activation || 0);
    }
  },
};

// ============================================================================
// 3. X TRACKER — rastreador do "X" da conversa
// O "X" é o conceito de maior centralidade no subgrafo activo da sessão.
// Centralidade = grau ponderado dentro do subgrafo activo
//              + peso composicional acumulado
//              + frequência de aparecimento como dominantToken
// Não é o mais frequente. É o que mais organiza os outros à sua volta.
// ============================================================================
const XTracker = {
  _X:            null,   // { nodeId, form, psi, centrality, cycle }
  _Xhistory:     [],     // evolução do X ao longo da sessão
  _XCandidates:  new Map(), // nodeId → { score, appearances, form }
  _sessionCycle: 0,

  // Calcula a centralidade de cada nó no subgrafo activo
  // Centralidade = soma dos pesos das sinapses para outros nós activos
  _centralityMap(activeNodeIds, brainRef) {
    const activeSet = new Set(activeNodeIds);
    const centrality = new Map();

    for (const id of activeSet) centrality.set(id, 0);

    brainRef.synapses.forEach((syn) => {
      if (syn.pruned) return;
      const srcActive = activeSet.has(syn.source);
      const tgtActive = activeSet.has(syn.target);
      if (srcActive && tgtActive) {
        // Ambos activos: contribui para a centralidade de ambos
        centrality.set(syn.source, (centrality.get(syn.source)||0) + syn.weight);
        centrality.set(syn.target, (centrality.get(syn.target)||0) + syn.weight);
      } else if (srcActive) {
        // Apenas source activo: centralidade menor (conexão para fora do subgrafo)
        centrality.set(syn.source, (centrality.get(syn.source)||0) + syn.weight * 0.3);
      } else if (tgtActive) {
        centrality.set(syn.target, (centrality.get(syn.target)||0) + syn.weight * 0.3);
      }
    });

    return centrality;
  },

  // Actualiza o X com base nos nós activos e no token dominante da proposição
  // activeNodes: nós activos filtrados pelo threshold dinâmico
  // dominantToken: token de maior peso composicional no input actual
  // phraseWeight: peso composicional da proposição
  // brainRef: referência ao NeuralGraph
  update(activeNodes, dominantToken, phraseWeight, brainRef, cycle) {
    this._sessionCycle = cycle;
    if (!activeNodes || activeNodes.length === 0) return this._X;

    const activeIds     = activeNodes.map(n => n.id);
    const centralityMap = this._centralityMap(activeIds, brainRef);

    // Actualiza candidatos ao X
    for (const node of activeNodes) {
      const centrality = centralityMap.get(node.id) || 0;
      const activation = node.activation || 0;

      // Score: centralidade × activação × modificador emocional
      const emotMod = EmotionalMemory.weightModifier(node);
      const score   = centrality * activation * emotMod;

      if (!this._XCandidates.has(node.id)) {
        this._XCandidates.set(node.id, {
          score:       0,
          appearances: 0,
          form:        node.signature?.lexical?.split(' ')[0] || node.id,
          psi:         node.signature?.psi || null,
          nodeId:      node.id,
        });
      }

      const cand = this._XCandidates.get(node.id);
      // Acumula score com decay (eventos antigos pesam menos)
      cand.score       = cand.score * 0.85 + score * 0.15;
      cand.appearances++;
    }

    // Boost extra para o token dominante da proposição actual
    if (dominantToken && dominantToken.form) {
      for (const [id, cand] of this._XCandidates) {
        if (cand.form === dominantToken.form) {
          cand.score += phraseWeight * 0.25;
        }
      }
    }

    // Limpa candidatos com score muito baixo (drift natural)
    for (const [id, cand] of this._XCandidates) {
      cand.score *= 0.95; // decay global
      if (cand.score < 0.005) this._XCandidates.delete(id);
    }

    // Selecciona o X: candidato com maior score
    let bestId = null, bestScore = 0;
    for (const [id, cand] of this._XCandidates) {
      if (cand.score > bestScore) { bestScore = cand.score; bestId = id; }
    }

    if (!bestId) return this._X;

    const bestCand = this._XCandidates.get(bestId);

    // Detecta mudança de X
    const xChanged = !this._X || this._X.nodeId !== bestId;

    this._X = {
      nodeId:     bestId,
      form:       bestCand.form,
      psi:        bestCand.psi,
      centrality: +(bestCand.score).toFixed(4),
      appearances: bestCand.appearances,
      cycle,
      changed:    xChanged,
    };

    if (xChanged) {
      this._Xhistory.push({ ...this._X });
      if (this._Xhistory.length > 10) this._Xhistory.shift();
      console.log('[XTracker] X mudou para:', this._X.form, 'score:', this._X.centrality);
    }

    return this._X;
  },

  // Devolve os satélites do X: nós activos conectados ao X mas que não são o X
  // Distingue "satélites que definem X" (θ próximo, z baixo)
  // de "satélites que orbitam X" (θ distante, z alto)
  satellites(activeNodes, brainRef) {
    if (!this._X || !activeNodes) return { defining: [], orbiting: [] };

    const xNode   = brainRef.nodes.get(this._X.nodeId);
    const xPsi    = xNode?.signature?.psi;
    if (!xPsi) return { defining: [], orbiting: [] };

    const connected = activeNodes.filter(n => {
      if (n.id === this._X.nodeId) return false;
      const k1 = this._X.nodeId + '→' + n.id;
      const k2 = n.id + '→' + this._X.nodeId;
      const s1 = brainRef.synapses.get(k1);
      const s2 = brainRef.synapses.get(k2);
      return (s1 && !s1.pruned && s1.weight > 0.05) ||
             (s2 && !s2.pruned && s2.weight > 0.05);
    });

    const defining  = [], orbiting = [];
    for (const node of connected) {
      const psi = node.signature?.psi;
      if (!psi) continue;
      // Diferença angular — satélites com θ próximo "definem" X
      const dTheta = Math.abs(xPsi.theta - psi.theta);
      const angDiff = Math.min(dTheta, 360 - dTheta);
      if (angDiff < 60 && psi.z < 0.3) {
        defining.push({ form: node.signature?.lexical?.split(' ')[0] || node.id, psi, angDiff: +angDiff.toFixed(1) });
      } else {
        orbiting.push({ form: node.signature?.lexical?.split(' ')[0] || node.id, psi, angDiff: +angDiff.toFixed(1) });
      }
    }

    return { defining, orbiting };
  },

  getX()       { return this._X; },
  getHistory() { return this._Xhistory.slice(-5); },

  serialize() {
    return {
      X:          this._X,
      history:    this.getHistory(),
      candidates: Array.from(this._XCandidates.values())
        .sort((a,b) => b.score - a.score)
        .slice(0, 5)
        .map(c => ({ form: c.form, score: +c.score.toFixed(4), appearances: c.appearances })),
    };
  },
};

// ============================================================================
// 4. EMERGENT BELIEFS
// Padrões de co-ocorrência recorrentes com alta consistência tornam-se
// crenças candidatas. Submetidas ao PropositionVerifier antes de aceites.
// Uma crença emerge quando:
//   - O mesmo predicado é associado ao mesmo sujeito ≥ MIN_INSTANCES vezes
//   - A consistência (sem contradições) é ≥ CONSISTENCY_THRESHOLD
//   - O phraseWeight médio é ≥ WEIGHT_THRESHOLD
// ============================================================================
const EmergentBeliefs = {
  MIN_INSTANCES:         4,    // mínimo de co-ocorrências para candidatura
  CONSISTENCY_THRESHOLD: 0.75, // fracção de ocorrências sem contradição
  WEIGHT_THRESHOLD:      0.50, // phraseWeight médio mínimo

  // Map: "sujeito::predicado" → { count, contradictions, weights, lastSeen }
  _patterns: new Map(),

  // Regista uma co-ocorrência sujeito→predicado com o peso composicional
  record(subjectForm, predicateForm, phraseWeight, hasContradiction) {
    if (!subjectForm || !predicateForm) return;
    const key = subjectForm + '::' + predicateForm;

    if (!this._patterns.has(key)) {
      this._patterns.set(key, {
        subject:       subjectForm,
        predicate:     predicateForm,
        count:         0,
        contradictions: 0,
        totalWeight:   0,
        lastSeen:      Date.now(),
      });
    }

    const p = this._patterns.get(key);
    p.count++;
    p.totalWeight   += phraseWeight;
    if (hasContradiction) p.contradictions++;
    p.lastSeen = Date.now();
  },

  // Avalia todos os padrões e promove candidatos a crenças
  // Verifica com PropositionVerifier antes de aceitar
  evaluate() {
    const newBeliefs = [];

    for (const [key, pattern] of this._patterns) {
      if (pattern.count < this.MIN_INSTANCES) continue;

      const consistency  = 1 - (pattern.contradictions / pattern.count);
      const avgWeight    = pattern.totalWeight / pattern.count;

      if (consistency < this.CONSISTENCY_THRESHOLD) continue;
      if (avgWeight   < this.WEIGHT_THRESHOLD)      continue;

      // Verifica se já existe como crença no SelfModel
      const alreadyBelief = SelfModel.beliefs.some(b =>
        b.statement.includes(pattern.subject) && b.statement.includes(pattern.predicate)
      );
      if (alreadyBelief) continue;

      // Verifica coerência com PropositionVerifier
      const sequence = [
        { form: pattern.subject,   role: 'subject',   polarity: 1, psi: null },
        { form: pattern.predicate, role: 'predicate',  polarity: 1, psi: null },
      ];
      const verification = PropositionVerifier.verify(sequence, 'assertion');
      if (!verification.valid) continue;

      // Promove a crença
      const belief = {
        id:          'emergent_' + key.replace('::', '_') + '_' + Date.now(),
        statement:   pattern.subject + ' ' + pattern.predicate,
        weight:      +(consistency * avgWeight).toFixed(3),
        emergent:    true,
        instances:   pattern.count,
        consistency: +consistency.toFixed(3),
        avgWeight:   +avgWeight.toFixed(3),
        createdAt:   Date.now(),
      };

      SelfModel.beliefs.push(belief);
      newBeliefs.push(belief);

      console.log('[EmergentBeliefs] Nova crença:', belief.statement,
        '| peso:', belief.weight, '| instâncias:', belief.instances);
    }

    // Limpa padrões antigos (mais de 10 min sem ocorrência)
    const cutoff = Date.now() - 600000;
    for (const [key, p] of this._patterns) {
      if (p.lastSeen < cutoff) this._patterns.delete(key);
    }

    return newBeliefs;
  },

  // Decay dos padrões — reduz count gradualmente para evitar crenças obsoletas
  decay() {
    for (const [key, p] of this._patterns) {
      p.count       = Math.max(0, p.count - 0.1);
      p.totalWeight = Math.max(0, p.totalWeight - 0.05);
      if (p.count < 0.5) this._patterns.delete(key);
    }
  },

  stats() {
    return {
      patterns:    this._patterns.size,
      candidates:  Array.from(this._patterns.values())
        .filter(p => p.count >= this.MIN_INSTANCES)
        .length,
      beliefs:     SelfModel.beliefs.filter(b => b.emergent).length,
    };
  },
};

// ============================================================================
// PATCH DE INTEGRAÇÃO — Semantic Depth
// Estende os pipelines perceive/chat com os quatro módulos.
// Usa o padrão Decorator sobre self.onmessage.
// ============================================================================
(function applySemanticDepthPatch() {
  const _orig = self.onmessage;

  self.onmessage = async function(e) {
    const { command, payload } = e.data;

    if (command === 'getSemanticDepth') {
      self.postMessage({
        type:            'semanticDepth',
        X:               XTracker.serialize(),
        beliefs:         EmergentBeliefs.stats(),
        emergentBeliefs: SelfModel.beliefs.filter(b => b.emergent).slice(-5),
      });
      return;
    }

    if (command === 'perceive' || command === 'chat') {
      const inputStr = typeof payload === 'string' ? payload : '';

      // ── 1. Extracção semântica com peso composicional ─────────────────
      const tokens = SemanticTokenizer.extract(inputStr);
      const { tokens: enrichedTokens, phraseWeight, tensions } =
        CompositionalWeight.compute(tokens);

      // Token dominante da proposição
      const domToken = CompositionalWeight.dominantToken(enrichedTokens);

      // Armazena para uso no handler original e nos patches de contexto
      self._enrichedTokens = enrichedTokens;
      self._phraseWeight   = phraseWeight;
      self._domToken       = domToken;
      self._tensions       = tensions;

      // Handler original (+ patch de contexto se carregado)
      await _orig.call(this, e);

      // ── 2. Pós-processamento Semantic Depth ───────────────────────────
      try {
        const meta = {
          frustration: Metacognition.frustration,
          arousal:     Metacognition.arousal,
          confidence:  Metacognition.confidence,
          surprise:    Metacognition.surprise || 0,
          age:         Metacognition.age,
        };

        // Threshold dinâmico — reutiliza o TopicTracker se carregado
        const allNodes = Array.from(brain.nodes.values())
          .filter(n => n.signature && n.signature.psi);
        const threshold = typeof TopicTracker !== 'undefined'
          ? TopicTracker.dynamicThreshold(allNodes)
          : 0.1;
        const activeNodes = allNodes
          .filter(n => (n.activation || 0) >= threshold)
          .sort((a, b) => (b.activation||0) - (a.activation||0))
          .slice(0, 30);

        // ── 3. Memória emocional nos nós activos ─────────────────────────
        EmotionalMemory.applyToActive(activeNodes, meta);

        // ── 4. Actualiza X ───────────────────────────────────────────────
        const X = XTracker.update(activeNodes, domToken, phraseWeight, brain, brain.cycle);
        const sats = X ? XTracker.satellites(activeNodes, brain) : { defining:[], orbiting:[] };

        // ── 5. Regista padrões para crenças emergentes ───────────────────
        // Extrai pares sujeito→predicado dos tokens enriquecidos
        const subjects   = enrichedTokens.filter(t => {
          const mc = t.psi && t.psi.morphClass;
          return mc && (mc==='SUBSTANTIVO'||mc==='PRONOME'||mc==='PROPRIO');
        });
        const predicates = enrichedTokens.filter(t => {
          const mc = t.psi && t.psi.morphClass;
          return mc && mc.startsWith('VERBO');
        });
        const hasContradiction = tensions.length > 0;

        for (const subj of subjects) {
          for (const pred of predicates) {
            EmergentBeliefs.record(
              subj.form, pred.form, phraseWeight, hasContradiction
            );
          }
        }

        // Avalia candidatos a crenças a cada 10 ciclos
        let newBeliefs = [];
        if (brain.cycle % 10 === 0) {
          newBeliefs = EmergentBeliefs.evaluate();
          EmergentBeliefs.decay();
        }

        // ── 6. Emite evento de Semantic Depth ────────────────────────────
        self.postMessage({
          type:         'semanticDepthUpdate',
          cycle:        brain.cycle,
          compositional: {
            phraseWeight,
            tensions,
            dominantToken: domToken ? {
              form:               domToken.form,
              compositionalWeight: domToken.compositionalWeight,
              morphClass:         domToken.psi?.morphClass,
            } : null,
            tokenWeights: enrichedTokens
              .filter(t => !t.roles.isStop && (t.compositionalWeight||0) > 0.1)
              .map(t => ({
                form:               t.form,
                semanticWeight:     t.semanticWeight,
                compositionalWeight: t.compositionalWeight,
                underNegation:      t.roles.underNegation,
                morphClass:         t.psi?.morphClass,
              })),
          },
          X: X ? {
            form:        X.form,
            centrality:  X.centrality,
            appearances: X.appearances,
            changed:     X.changed,
            satellites:  sats,
          } : null,
          emotionalHighlights: activeNodes
            .filter(n => n.emotionalHistory && n.emotionalHistory.isTense)
            .slice(0, 5)
            .map(n => ({
              form:    n.signature?.lexical?.split(' ')[0] || n.id,
              profile: EmotionalMemory.profile(n),
            })),
          beliefs: {
            new:   newBeliefs.map(b => ({ statement: b.statement, weight: b.weight })),
            stats: EmergentBeliefs.stats(),
          },
        });

      } catch(err) {
        console.warn('[SemanticDepthPatch]', err.message);
      }

      return;
    }

    return _orig.call(this, e);
  };

  console.log('[AIO-Patch] Semantic Depth applied: CompositionalWeight + EmotionalMemory + XTracker + EmergentBeliefs');
})();

// ── Patch AutonomousLoop: inclui X e crenças no tick autónomo ────────────────
(function patchAutonomousLoopSD() {
  const _orig = AutonomousLoop._step.bind(AutonomousLoop);
  AutonomousLoop._step = async function() {
    await _orig();

    // Decay periódico dos padrões de crença
    if (this._tick % 30 === 0) EmergentBeliefs.decay();

    // Avalia crenças emergentes a cada 20 ticks autónomos
    if (this._tick % 20 === 0) {
      const newBeliefs = EmergentBeliefs.evaluate();
      if (newBeliefs.length > 0) {
        self.postMessage({
          type:        'newBeliefs',
          tick:        this._tick,
          beliefs:     newBeliefs,
          X:           XTracker.getX(),
          beliefStats: EmergentBeliefs.stats(),
        });
      }
    }
  };
})();