// ============================================================================
// AIO-PATCH — CONTEXTUALIZAÇÃO & RECONHECIMENTO DE ASSUNTOS v2
// Correcções: clustering real, threshold dinâmico, classificação robusta.
// Aplica sobre aio-worker-v4.js via importScripts() ou concatenação.
// ============================================================================

// ============================================================================
// 1. SPEECH ACT CLASSIFIER v2
// Classificação robusta: usa morfologia + posição + padrão completo.
// Elimina dependência de startsWith() sobre token isolado.
// ============================================================================
const SpeechActClassifier = (() => {

  // FIX: \b (fronteira de palavra) trata vogais acentuadas como NÃO-palavra
  // em JavaScript — "é" não pertence a [A-Za-z0-9_], então \bé\b nunca
  // encontra fronteira válida. Isto fazia isDefinition/isExplanation/etc
  // falharem silenciosamente para QUALQUER frase com "é", "porquê", etc.
  // Esta função define fronteira correctamente incluindo letras acentuadas.
  function matchesPhrase(text, phrases) {
    for (const p of phrases) {
      const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(
        '(?:^|[^a-zà-úãõâêîôûäëïöüçñ])' + escaped + '(?:[^a-zà-úãõâêîôûäëïöüçñ]|$)', 'i'
      );
      if (re.test(text)) return true;
    }
    return false;
  }

  const QUESTION_WORDS = new Set([
    'o que','que','qual','quais','quem','onde','quando','como','porque',
    'porquê','quanto','quantos','quantas','para que','de que',
    'what','which','who','where','when','how','why','whose','whom'
  ]);

  // Verbos modais: verificados em QUALQUER posição, não só no início
  const MODAL_VERBS_PT = new Set([
    'pode','podes','poderia','consegue','consegues','queres','quer',
    'deves','deve','precisas','precisas','necessitas'
  ]);
  const MODAL_VERBS_EN = new Set([
    'can','could','would','will','should','must','need','shall'
  ]);

  // Verbos de acção directa — só são pedido se no imperativo (sem sujeito antes)
  const ACTION_VERBS_PT = new Set([
    'faz','faça','diz','diga','mostra','mostre','explica','explique',
    'ajuda','ajude','cria','crie','lista','liste','define','defina',
    'descreve','descreve','calcula','calcula','resolve','resolve'
  ]);
  const ACTION_VERBS_EN = new Set([
    'show','tell','explain','help','create','list','define','give',
    'make','find','write','describe','calculate','solve','generate'
  ]);

  const CONTRADICTION_MARKERS = new Set([
    'mas','porém','contudo','todavia','no entanto','embora','apesar',
    'ao contrário','pelo contrário','discordo','errado','incorreto','falso',
    'but','however','although','though','yet','nevertheless','despite',
    'disagree','wrong','incorrect','false','on the contrary'
  ]);

  const CLARIFICATION_MARKERS = new Set([
    'ou seja','isto é','quer dizer','significa','refiro-me','isto é',
    'that is','i mean','meaning','in other words','to clarify'
  ]);

  const ACK_TOKENS = new Set([
    'sim','ok','certo','claro','exacto','percebo','entendo','compreendo',
    'yes','okay','right','correct','understood','sure','got'
  ]);

  // Detecta se há inversão sujeito-verbo EN (estrutura de questão)
  // Verifica o par (token0, token1) não apenas token0
  function hasSVInversion(forms) {
    const aux = new Set(['is','are','was','were','do','does','did',
                         'have','has','had','can','could','will','would','should']);
    if (forms.length < 2) return false;
    // token0 é auxiliar E token1 é substantivo/pronome (não outro auxiliar)
    return aux.has(forms[0]) && !aux.has(forms[1]);
  }

  // Detecta se o verbo de acção está em posição imperativa
  // Imperativo: verbo de acção no início SEM sujeito pronominal antes
  function isImperative(forms, tokens) {
    if (forms.length === 0) return false;
    const pronouns = new Set(['eu','tu','ele','ela','nós','vós','eles','elas',
                               'i','you','he','she','we','they','it']);
    // Se o primeiro token com semântica real é um pronome, não é imperativo
    const firstMeaningful = tokens.find(t => !t.roles.isStop);
    if (!firstMeaningful) return false;
    if (pronouns.has(firstMeaningful.form)) return false;
    // É imperativo se o primeiro token com semântica é verbo de acção
    return ACTION_VERBS_PT.has(firstMeaningful.form) ||
           ACTION_VERBS_EN.has(firstMeaningful.form);
  }

  // Detecta questão por marcadores interrogativos em QUALQUER posição
  // Resolve: "a consciência, o que é?" — o "o que" não está no início
  function hasInterrogativeMarker(text, forms) {
    const textLower = text.toLowerCase();
    for (const w of QUESTION_WORDS) {
      if (textLower.includes(w)) return true;
    }
    return false;
  }

  // Detecta modal em qualquer posição — resolve pedidos indirectos
  // "podes explicar" vs "como é que não podes"
  // Verifica que o modal NÃO está sob negação
  function hasModalRequest(tokens) {
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if ((MODAL_VERBS_PT.has(t.form) || MODAL_VERBS_EN.has(t.form))
          && !t.roles.underNegation) {
        // Confirma que há um verbo de acção depois do modal
        const rest = tokens.slice(i + 1).map(x => x.form);
        const hasAction = rest.some(f => ACTION_VERBS_PT.has(f) || ACTION_VERBS_EN.has(f));
        if (hasAction) return true;
      }
    }
    return false;
  }

  // Detecta verbo de relação (CAUSES/HAS/ENABLES/...) elíptico no fim da frase
  // "O fogo causa?" "O fogo produz?" — pergunta sobre uma relação específica
  // sem objecto. Consulta SynonymRegistry + builtin se já estiverem carregados.
  function detectRelationalEllipsis(meaningfulForms) {
    if (!meaningfulForms || meaningfulForms.length === 0) return null;
    const last = meaningfulForms[meaningfulForms.length - 1];
    try {
      if (typeof SynonymRegistry !== 'undefined') {
        const synOp = SynonymRegistry.resolveOperator(last);
        if (synOp) return synOp;
      }
      if (typeof resolveBuiltinOperator === 'function') {
        const builtinOp = resolveBuiltinOperator(last);
        if (builtinOp && builtinOp !== 'IS') return builtinOp; // IS já é tratado por isDefinition
      }
    } catch(e) { /* módulos ainda não carregados — ignora silenciosamente */ }
    return null;
  }

  function classify(inputStr, tokens) {
    const text  = (inputStr || '').toLowerCase().trim();
    const forms = tokens ? tokens.map(t => t.form) : text.split(/\s+/);
    const toks  = tokens || forms.map(f => ({ form: f, roles: { isStop: false, isNeg: false, underNegation: false } }));

    // FIX: input com uma única palavra de conteúdo (substantivo, sem verbo,
    // sem pontuação) é tratado como pergunta implícita "o que sabes sobre X?"
    // em vez de afirmação vazia sem predicado. Resolve "Calor" → query, não assertion.
    const contentForms = toks.filter(t => !t.roles?.isStop).map(t => t.form);
    if (contentForms.length === 1 && !text.endsWith('?') && text.split(/\s+/).length <= 2) {
      return { act: 'question', subtype: 'general', confidence: 0.6, impliedQuery: true };
    }

    // ── Questão ────────────────────────────────────────────────────────────
    const endsQ    = text.endsWith('?');
    const hasIntM  = hasInterrogativeMarker(text, forms);
    const hasSVI   = hasSVInversion(forms);

    if (endsQ || hasIntM || hasSVI) {
      const isDefinition  = matchesPhrase(text, ['o que é','what is','what are','define','definição','definition','significa']);
      const isList        = matchesPhrase(text, ['lista','liste','list','quais são','what are','enumera']);
      const isExplanation = matchesPhrase(text, ['como','why','porquê','porque','explain','explica','de que forma']);
      const isYesNo       = hasSVI && !hasIntM;

      // FIX: pergunta elíptica sobre relação específica ("O fogo causa?")
      const relationCode = (!isDefinition && !isList && !isExplanation)
        ? detectRelationalEllipsis(contentForms)
        : null;

      return {
        act:        'question',
        subtype:    relationCode      ? 'relation_query'
                  : isDefinition  ? 'definition'
                  : isList        ? 'list'
                  : isExplanation ? 'explanation'
                  : isYesNo       ? 'yes_no'
                  : 'general',
        confidence:   endsQ ? 0.95 : hasIntM ? 0.85 : 0.72,
        relationCode: relationCode || null,
      };
    }

    // ── Pedido ─────────────────────────────────────────────────────────────
    const hasModal = hasModalRequest(toks);
    const isImp    = isImperative(forms, toks);
    const hasPlease= matchesPhrase(text, ['por favor','please']);

    if (hasModal || isImp || hasPlease) {
      return {
        act:        'request',
        subtype:    hasPlease ? 'polite' : hasModal ? 'modal' : 'imperative',
        confidence: hasModal ? 0.88 : isImp ? 0.82 : 0.78,
      };
    }

    // ── Contradição ────────────────────────────────────────────────────────
    const hasContraMarker = [...CONTRADICTION_MARKERS].some(m => text.includes(m));
    const hasNeg = toks.some(t => t.roles && t.roles.isNeg);

    if (hasContraMarker) {
      return {
        act:        'contradiction',
        subtype:    hasNeg ? 'explicit' : 'implicit',
        confidence: hasNeg ? 0.88 : 0.68,
      };
    }

    // ── Clarificação ───────────────────────────────────────────────────────
    if ([...CLARIFICATION_MARKERS].some(m => text.includes(m))) {
      return { act: 'clarification', subtype: 'restatement', confidence: 0.80 };
    }

    // ── Reconhecimento (inputs curtos de ack) ──────────────────────────────
    const meaningfulForms = forms.filter(f => f.length > 1);
    if (meaningfulForms.length <= 3 &&
        meaningfulForms.some(f => ACK_TOKENS.has(f))) {
      return { act: 'acknowledgement', subtype: 'confirmation', confidence: 0.88 };
    }

    // ── Default: afirmação ─────────────────────────────────────────────────
    return { act: 'assertion', subtype: 'declarative', confidence: 0.70 };
  }

  function plannerHints(speechAct) {
    switch(speechAct.act) {
      case 'question':
        return { preferredRoles: ['predicate','object','subject'], thetaBias: 200 };
      case 'request':
        return { preferredRoles: ['predicate','object'], thetaBias: 135 };
      case 'contradiction':
        return { preferredRoles: ['subject','predicate'], thetaBias: 315, useNegation: true };
      case 'clarification':
        return { preferredRoles: ['subject','predicate','modifier'], thetaBias: 135 };
      case 'acknowledgement':
        return { preferredRoles: ['subject','predicate'], thetaBias: 45, brief: true };
      default:
        return { preferredRoles: ['subject','predicate','object'], thetaBias: 135 };
    }
  }

  return { classify, plannerHints };
})();

// ============================================================================
// 2. TOPIC TRACKER v2
// Clustering geométrico real antes do centróide.
// Threshold dinâmico: média + α×desvio_padrão dos nós activos.
// Pipeline: activeNodes → dynamicThreshold → clusters → dominante → centróide
// ============================================================================
const TopicTracker = (() => {

  let _current         = null;
  let _history         = [];
  let _sessionTopics   = new Map();

  // ── Threshold dinâmico ───────────────────────────────────────────────────
  // Corta nós abaixo de média + α×σ — adapta-se ao ciclo actual.
  // α=0 → corta abaixo da média (agressivo)
  // α=-0.5 → inclui mais nós (permissivo, bom para sessões jovens)
  function dynamicThreshold(nodes, alpha = -0.3) {
    if (!nodes || nodes.length === 0) return 0.1;
    const acts = nodes.map(n => n.activation || 0);
    const mean = acts.reduce((a, b) => a + b, 0) / acts.length;
    const variance = acts.reduce((s, a) => s + (a - mean) ** 2, 0) / acts.length;
    const std = Math.sqrt(variance);
    return Math.max(0.05, mean + alpha * std);
  }

  // ── DBSCAN geométrico simplificado ──────────────────────────────────────
  // Agrupa nós por proximidade cartesiana no espaço ψ.
  // epsilon: raio de vizinhança, minPts: mínimo para formar cluster
  function dbscan(points, epsilon = 0.45, minPts = 2) {
    const n       = points.length;
    const visited = new Array(n).fill(false);
    const cluster = new Array(n).fill(-1); // -1 = ruído
    let   clusterIdx = 0;

    function neighbours(i) {
      const res = [];
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const dx = points[i].x - points[j].x;
        const dy = points[i].y - points[j].y;
        const dz = points[i].z - points[j].z;
        if (Math.sqrt(dx*dx + dy*dy + dz*dz) <= epsilon) res.push(j);
      }
      return res;
    }

    function expand(i, nb, cIdx) {
      cluster[i] = cIdx;
      let queue = [...nb];
      while (queue.length > 0) {
        const j = queue.shift();
        if (!visited[j]) {
          visited[j] = true;
          const nb2 = neighbours(j);
          if (nb2.length >= minPts) queue = queue.concat(nb2);
        }
        if (cluster[j] === -1) cluster[j] = cIdx;
      }
    }

    for (let i = 0; i < n; i++) {
      if (visited[i]) continue;
      visited[i] = true;
      const nb = neighbours(i);
      if (nb.length < minPts) {
        cluster[i] = -1; // ruído
      } else {
        expand(i, nb, clusterIdx);
        clusterIdx++;
      }
    }

    // Agrupa por índice de cluster
    const clusters = new Map();
    for (let i = 0; i < n; i++) {
      if (cluster[i] === -1) continue;
      if (!clusters.has(cluster[i])) clusters.set(cluster[i], []);
      clusters.get(cluster[i]).push(points[i]);
    }
    return Array.from(clusters.values());
  }

  // ── Centróide ponderado de um cluster ───────────────────────────────────
  function centroid(clusterPoints) {
    let sx = 0, sy = 0, sz = 0, tw = 0;
    for (const p of clusterPoints) {
      sx += p.x * p.w; sy += p.y * p.w; sz += p.z * p.w; tw += p.w;
    }
    if (tw === 0) return null;
    const cx = sx/tw, cy = sy/tw, cz = sz/tw;
    const r     = Math.sqrt(cx*cx + cy*cy);
    const theta = ((Math.atan2(cy, cx) * 180 / Math.PI) + 360) % 360;
    return { r: Math.min(1, r), theta, z: Math.max(0, cz) };
  }

  // ── Rótulo do cluster ────────────────────────────────────────────────────
  function labelCluster(centroidPsi, brainRef) {
    if (!centroidPsi || globalKDTree.size() === 0) return 'desconhecido';
    const nearest = globalKDTree.nearest(centroidPsi);
    if (!nearest) return 'desconhecido';
    const node = brainRef.nodes.get(nearest.nodeId);
    if (node && node.signature && node.signature.lexical) {
      return node.signature.lexical.split(' ')[0].toLowerCase();
    }
    return nearest.form || 'desconhecido';
  }

  // ── Update principal ─────────────────────────────────────────────────────
  function update(allActiveNodes, brainRef, cycle) {
    if (!allActiveNodes || allActiveNodes.length === 0) return null;

    // 1. Threshold dinâmico — elimina ruído de activação residual
    const threshold = dynamicThreshold(allActiveNodes);
    const filtered  = allActiveNodes.filter(n => (n.activation || 0) >= threshold
                                               && n.signature && n.signature.psi);
    if (filtered.length === 0) return null;

    // 2. Converte para pontos cartesianos com peso = activation
    const points = filtered.map(n => {
      const psi = n.signature.psi;
      const rad = psi.theta * Math.PI / 180;
      return {
        x:      psi.r * Math.cos(rad),
        y:      psi.r * Math.sin(rad),
        z:      psi.z,
        w:      n.activation || 0.1,
        nodeId: n.id,
        psi,
      };
    });

    // 3. DBSCAN — clusters geométricos reais
    const clusters = dbscan(points,
      filtered.length < 5 ? 0.6 : 0.45, // epsilon maior para grafos jovens
      filtered.length < 4 ? 1 : 2        // minPts menor para grafos jovens
    );

    // Se não há clusters (todos ruído), usa todos os pontos como um só cluster
    const effectiveClusters = clusters.length > 0 ? clusters : [points];

    // 4. Cluster dominante: maior soma de activação
    const dominant = effectiveClusters.reduce((best, cl) => {
      const mass = cl.reduce((s, p) => s + p.w, 0);
      return mass > (best.mass || 0) ? { cluster: cl, mass } : best;
    }, { cluster: null, mass: 0 });

    if (!dominant.cluster) return null;

    // 5. Centróide do cluster dominante
    const centroidPsi = centroid(dominant.cluster);
    if (!centroidPsi) return null;

    // 6. Rótulo
    const label      = labelCluster(centroidPsi, brainRef);
    const confidence = dominant.mass / points.reduce((s, p) => s + p.w, 0);

    const topic = {
      label,
      psi:        centroidPsi,
      confidence: +confidence.toFixed(3),
      clusterCount: effectiveClusters.length,
      dominantMass: +dominant.mass.toFixed(3),
      nodesInCluster: dominant.cluster.length,
      threshold:  +threshold.toFixed(3),
      cycle,
    };

    _current = topic;
    _history.push(topic);
    if (_history.length > 20) _history.shift();
    _sessionTopics.set(label, (_sessionTopics.get(label) || 0) + 1);

    return topic;
  }

  function getCurrent()  { return _current; }
  function getHistory()  { return _history.slice(-5); }
  function getDominant() {
    let maxLabel = null, maxCount = 0;
    for (const [label, count] of _sessionTopics) {
      if (count > maxCount) { maxCount = count; maxLabel = label; }
    }
    return maxLabel ? { label: maxLabel, count: maxCount } : null;
  }
  function serialize() {
    return {
      current:      _current,
      dominant:     getDominant(),
      history:      getHistory(),
      uniqueTopics: _sessionTopics.size,
    };
  }

  return { update, getCurrent, getHistory, getDominant, serialize, dynamicThreshold };
})();

// ============================================================================
// 3. TOPIC CHANGE DETECTOR v2
// Usa o mesmo threshold dinâmico do TopicTracker.
// Compara cluster dominante actual vs anterior — não apenas centro de massa.
// Métricas: fidelity, dominance, drift — expostas ao cliente.
// ============================================================================
const TopicChangeDetector = {
  CHANGE_THRESHOLD:      0.55,
  SOFT_CHANGE_THRESHOLD: 0.35,
  DOMINANCE_THRESHOLD:   0.40,
  _lastChangeCycle:      0,
  _changeCount:          0,
  _previousTopicPsi:     null,

  measure(psiInput, psiForPlanner, activeNodes, episodicBoosted) {
    const metrics = { fidelity: 1, dominance: 0, drift: 0 };

    if (psiInput && psiForPlanner) {
      const r1 = psiInput.theta      * Math.PI / 180;
      const r2 = psiForPlanner.theta * Math.PI / 180;
      const dx = psiInput.r * Math.cos(r1) - psiForPlanner.r * Math.cos(r2);
      const dy = psiInput.r * Math.sin(r1) - psiForPlanner.r * Math.sin(r2);
      const dz = psiInput.z - psiForPlanner.z;
      metrics.fidelity = Math.max(0, 1 - Math.sqrt(dx*dx+dy*dy+dz*dz) / Math.SQRT2);
    }

    // Dominância episódica sobre os nós acima do threshold dinâmico
    if (activeNodes && activeNodes.length > 0) {
      const threshold  = TopicTracker.dynamicThreshold(activeNodes);
      const aboveThresh = activeNodes.filter(n => (n.activation||0) >= threshold).length;
      metrics.dominance = aboveThresh > 0
        ? Math.min(1, episodicBoosted / aboveThresh)
        : 0;
    }

    // Drift: compara com o tópico anterior (não com o centro de massa global)
    if (this._previousTopicPsi && psiInput) {
      const rc = this._previousTopicPsi.theta * Math.PI / 180;
      const ri = psiInput.theta * Math.PI / 180;
      const dx = this._previousTopicPsi.r * Math.cos(rc) - psiInput.r * Math.cos(ri);
      const dy = this._previousTopicPsi.r * Math.sin(rc) - psiInput.r * Math.sin(ri);
      const dz = this._previousTopicPsi.z - psiInput.z;
      metrics.drift = Math.min(1, Math.sqrt(dx*dx+dy*dy+dz*dz) / Math.SQRT2);
    }

    return metrics;
  },

  detect(psiInput, activeNodes, episodicBoosted, cycle) {
    const contextPsi = ContextualInertia.getContextPsi();
    if (!psiInput) {
      return { changed:false, type:null,
               metrics:{ fidelity:1, dominance:0, drift:0 } };
    }

    const psiForPlanner = ContextualInertia.biasedQuery(psiInput);
    const metrics = this.measure(psiInput, psiForPlanner, activeNodes, episodicBoosted);

    let changed = false, type = null, action = null;

    if (metrics.drift > this.CHANGE_THRESHOLD) {
      changed = true; type = 'hard'; action = 'partial_reset';
      this._changeCount++;
      this._lastChangeCycle = cycle;
      // Reset parcial: 50% novo input
      const rad = psiInput.theta * Math.PI / 180;
      ContextualInertia._cx = ContextualInertia._cx * 0.5 + psiInput.r * Math.cos(rad) * 0.5;
      ContextualInertia._cy = ContextualInertia._cy * 0.5 + psiInput.r * Math.sin(rad) * 0.5;
      ContextualInertia._cz = ContextualInertia._cz * 0.5 + psiInput.z * 0.5;
      console.log('[TopicChange] Hard:', metrics.drift.toFixed(3));

    } else if (metrics.drift > this.SOFT_CHANGE_THRESHOLD) {
      changed = true; type = 'soft'; action = 'lambda_adjust';
      const λ = CFG.CONTEXT_LAMBDA * 0.6;
      const rad = psiInput.theta * Math.PI / 180;
      ContextualInertia._cx = λ * ContextualInertia._cx + (1-λ) * psiInput.r * Math.cos(rad);
      ContextualInertia._cy = λ * ContextualInertia._cy + (1-λ) * psiInput.r * Math.sin(rad);
      ContextualInertia._cz = λ * ContextualInertia._cz + (1-λ) * psiInput.z;
    }

    // Actualiza tópico anterior para próxima comparação
    if (psiInput) this._previousTopicPsi = { ...psiInput };

    const dominanceAlert = metrics.dominance > this.DOMINANCE_THRESHOLD;
    if (dominanceAlert) {
      console.warn('[TopicChange] Dominance:', metrics.dominance.toFixed(3));
    }

    return { changed, type, action, metrics, dominanceAlert,
             changeCount: this._changeCount };
  },

  serialize() {
    return {
      lastChangeCycle: this._lastChangeCycle,
      changeCount:     this._changeCount,
      thresholds: {
        hard:      this.CHANGE_THRESHOLD,
        soft:      this.SOFT_CHANGE_THRESHOLD,
        dominance: this.DOMINANCE_THRESHOLD,
      },
    };
  },
};

// ============================================================================
// PATCH DE INTEGRAÇÃO — Decorator sobre self.onmessage
// ============================================================================
(function applyContextPatch() {
  const _orig = self.onmessage;

  self.onmessage = async function(e) {
    const { command, payload } = e.data;

    if (command === 'getTopicState') {
      self.postMessage({
        type:           'topicState',
        topic:          TopicTracker.serialize(),
        changeDetector: TopicChangeDetector.serialize(),
      });
      return;
    }

    if (command === 'perceive' || command === 'chat') {
      const inputStr = typeof payload === 'string' ? payload : '';

      // Classifica acto de fala com tokens reais do SemanticTokenizer
      const tokens   = SemanticTokenizer.extract(inputStr);
      const speechAct     = SpeechActClassifier.classify(inputStr, tokens);
      const plannerHints  = SpeechActClassifier.plannerHints(speechAct);
      self._currentSpeechAct    = speechAct;
      self._currentPlannerHints = plannerHints;

      // Handler original
      await _orig.call(this, e);

      // Pós-processamento com threshold dinâmico
      try {
        const allNodes = Array.from(brain.nodes.values())
          .filter(n => n.signature && n.signature.psi);

        const threshold    = TopicTracker.dynamicThreshold(allNodes);
        const activeNodes  = allNodes
          .filter(n => (n.activation || 0) >= threshold)
          .sort((a, b) => (b.activation||0) - (a.activation||0))
          .slice(0, 30);

        const topic = TopicTracker.update(activeNodes, brain, brain.cycle);

        const contextoAgente = {
          W_estado:    Metacognition.W_estado,
          frustration: Metacognition.frustration,
        };
        const psiInput        = SemanticTokenizer.synthesizePhraseGeometry(tokens, contextoAgente);
        const episodicBoosted = self._lastEpisodicBoost || 0;
        const changeResult    = TopicChangeDetector.detect(
          psiInput, activeNodes, episodicBoosted, brain.cycle
        );

        self.postMessage({
          type:        'contextEnriched',
          cycle:       brain.cycle,
          speechAct,
          plannerHints,
          topic:       topic
            ? { label: topic.label, confidence: topic.confidence,
                clusters: topic.clusterCount, threshold: topic.threshold }
            : null,
          topicChange: changeResult,
          metrics:     changeResult.metrics,
          alerts: {
            dominanceHigh: changeResult.dominanceAlert,
            fidelityLow:   changeResult.metrics.fidelity < 0.5,
            driftHigh:     changeResult.metrics.drift > TopicChangeDetector.SOFT_CHANGE_THRESHOLD,
          },
        });
      } catch(err) {
        console.warn('[ContextPatch]', err.message);
      }
      return;
    }

    return _orig.call(this, e);
  };

  console.log('[AIO-Patch v2] Applied: SpeechAct + TopicTracker + TopicChangeDetector');
})();

// ── Patch SyntacticPlanner com hints do SpeechAct ────────────────────────────
(function patchSyntacticPlanner() {
  const _orig = SyntacticPlanner.candidatesForRole;
  SyntacticPlanner.candidatesForRole = function(psiTarget, role, n = 4) {
    const hints = self._currentPlannerHints;
    if (!hints) return _orig(psiTarget, role, n);
    const thetaBiased = hints.thetaBias ? {
      r:     psiTarget ? psiTarget.r : 0.5,
      theta: (((psiTarget ? psiTarget.theta : 135) * 0.6 + hints.thetaBias * 0.4) + 360) % 360,
      z:     psiTarget ? psiTarget.z : 0.1,
    } : psiTarget;
    const isPreferred = hints.preferredRoles && hints.preferredRoles.includes(role);
    return _orig(thetaBiased, role, isPreferred ? n + 2 : n);
  };
})();

// ── Patch AutonomousLoop com tópico ──────────────────────────────────────────
(function patchAutonomousLoop() {
  const _orig = AutonomousLoop._step.bind(AutonomousLoop);
  AutonomousLoop._step = async function() {
    await _orig();
    if (this._tick % 10 === 0) {
      self.postMessage({
        type:           'topicTick',
        tick:           this._tick,
        topic:          TopicTracker.serialize(),
        changeDetector: TopicChangeDetector.serialize(),
      });
    }
  };
})();
