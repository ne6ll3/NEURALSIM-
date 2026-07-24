// ============================================================================
// AIO-PATCH — CONTEXTUALIZAÇÃO & RECONHECIMENTO DE ASSUNTOS
// Aplica sobre aio-worker-v4.js via importScripts() ou concatenação.
// Três módulos: SpeechActClassifier, TopicTracker, TopicChangeDetector.
// Substitui/estende: ResponseSynthesizer.synthesize, ContextualInertia,
//                    SyntacticPlanner.plan, autonomousTick.
// ============================================================================

// ============================================================================
// 1. SPEECH ACT CLASSIFIER
// Classifica cada input como: question | request | assertion | contradiction
// | clarification | acknowledgement
// Usa padrões morfossintácticos já disponíveis nos tokens do SemanticTokenizer.
// Passa speechAct ao SyntacticPlanner para orientar a forma da resposta.
// ============================================================================
const SpeechActClassifier = (() => {

  // Padrões de questão PT e EN
  const QUESTION_WORDS_PT = new Set([
    'o que','que','qual','quais','quem','onde','quando','como','porque',
    'porquê','quanto','quantos','quantas','para que','de que'
  ]);
  const QUESTION_WORDS_EN = new Set([
    'what','which','who','where','when','how','why','whose',
    'whom','how much','how many','how long','how often'
  ]);

  // Verbos modais de pedido PT
  const REQUEST_VERBS_PT = new Set([
    'pode','podes','poderia','consegue','consegues','queres','quer',
    'faz','faça','diz','diga','mostra','mostre','explica','explique',
    'ajuda','ajude','cria','crie','lista','liste','define','defina'
  ]);
  const REQUEST_VERBS_EN = new Set([
    'can','could','would','will','please','show','tell','explain',
    'help','create','list','define','give','make','find','write'
  ]);

  // Marcadores de contradição explícita
  const CONTRADICTION_MARKERS = new Set([
    'mas','porém','contudo','todavia','no entanto','embora','apesar',
    'but','however','although','though','yet','nevertheless','despite',
    'ao contrário','pelo contrário','on the contrary'
  ]);

  // Marcadores de clarificação
  const CLARIFICATION_MARKERS = new Set([
    'ou seja','isto é','quer dizer','significa','refiro','referes',
    'that is','i mean','meaning','in other words','clarify','clarification'
  ]);

  // Marcadores de reconhecimento/confirmação
  const ACK_MARKERS = new Set([
    'sim','ok','certo','claro','exacto','percebo','entendo','compreendo',
    'yes','okay','right','correct','understood','i see','got it','sure'
  ]);

  // Classifica um input dado os seus tokens e texto raw
  function classify(inputStr, tokens) {
    const text  = (inputStr || '').toLowerCase().trim();
    const forms = tokens ? tokens.map(t => t.form) : text.split(/\s+/);
    const formSet = new Set(forms);

    // 1. Questão: termina em '?' ou começa com palavra interrogativa
    const endsWithQ = text.endsWith('?');
    const startsWithQWord =
      [...QUESTION_WORDS_PT, ...QUESTION_WORDS_EN].some(w => text.startsWith(w));
    // Inversão sujeito-verbo EN: "is X...", "are X...", "do X...", "does X..."
    const svInversion = /^(is|are|was|were|do|does|did|have|has|had|can|could|will|would|should)\s/i.test(text);

    if (endsWithQ || startsWithQWord || svInversion) {
      // Sub-tipo: pedido de definição, pedido de lista, pedido de explicação
      const isDefinition = /\b(o que é|what is|what are|define|definição|definition)\b/i.test(text);
      const isList       = /\b(lista|liste|list|quais são|what are)\b/i.test(text);
      const isExplanation= /\b(como|why|porquê|porque|explain|explica)\b/i.test(text);
      return {
        act:        'question',
        subtype:    isDefinition ? 'definition' : isList ? 'list' : isExplanation ? 'explanation' : 'general',
        confidence: endsWithQ ? 0.95 : 0.75,
      };
    }

    // 2. Pedido: começa com verbo de acção/modal
    const firstForm = forms[0] || '';
    if (REQUEST_VERBS_PT.has(firstForm) || REQUEST_VERBS_EN.has(firstForm)) {
      return { act: 'request', subtype: 'action', confidence: 0.85 };
    }
    // Pedido indirecto: "por favor", "please"
    if (/\b(por favor|please)\b/i.test(text)) {
      return { act: 'request', subtype: 'polite', confidence: 0.80 };
    }

    // 3. Contradição explícita: marcador de contraste + negação
    const hasContradictionMarker = [...CONTRADICTION_MARKERS].some(m => text.includes(m));
    const hasNegation = tokens ? tokens.some(t => t.roles && t.roles.isNeg) : /\b(não|no|not|never)\b/i.test(text);
    if (hasContradictionMarker && hasNegation) {
      return { act: 'contradiction', subtype: 'explicit', confidence: 0.88 };
    }
    if (hasContradictionMarker) {
      return { act: 'contradiction', subtype: 'implicit', confidence: 0.65 };
    }

    // 4. Clarificação
    const hasClarification = [...CLARIFICATION_MARKERS].some(m => text.includes(m));
    if (hasClarification) {
      return { act: 'clarification', subtype: 'restatement', confidence: 0.80 };
    }

    // 5. Reconhecimento/confirmação (inputs curtos de ack)
    if (text.split(/\s+/).length <= 3 && [...ACK_MARKERS].some(m => text.includes(m))) {
      return { act: 'acknowledgement', subtype: 'confirmation', confidence: 0.90 };
    }

    // 6. Default: afirmação
    return { act: 'assertion', subtype: 'declarative', confidence: 0.70 };
  }

  // Orienta o SyntacticPlanner baseado no speechAct
  // Devolve ajustes de θ para os candidatos — a resposta adopta a forma certa
  function plannerHints(speechAct) {
    switch(speechAct.act) {
      case 'question':
        // Respostas a perguntas: enfatiza objectos/complementos (180-270°)
        // e predicados informativos (90-180°)
        return { preferredRoles: ['predicate', 'object', 'subject'], thetaBias: 200 };
      case 'request':
        // Respostas a pedidos: enfatiza acção (predicado) + resultado (objecto)
        return { preferredRoles: ['predicate', 'object'], thetaBias: 135 };
      case 'contradiction':
        // Respostas a contradições: enfatiza tensão — usa nós de negação
        return { preferredRoles: ['subject', 'predicate'], thetaBias: 315, useNegation: true };
      case 'clarification':
        // Respostas a clarificações: repete sujeito com predicado mais específico
        return { preferredRoles: ['subject', 'predicate', 'modifier'], thetaBias: 135 };
      case 'acknowledgement':
        // Confirmações: resposta breve, foco no sujeito
        return { preferredRoles: ['subject', 'predicate'], thetaBias: 45, brief: true };
      default:
        return { preferredRoles: ['subject', 'predicate', 'object'], thetaBias: 135 };
    }
  }

  return { classify, plannerHints };
})();

// ============================================================================
// 2. TOPIC TRACKER
// Detecta o tópico dominante da conversa a partir dos nós activos.
// O tópico é o centróide do cluster de nós activos + o rótulo lexical
// do nó mais próximo desse centróide na KD-Tree.
// Actualiza a cada input e expõe o histórico de tópicos da sessão.
// ============================================================================
const TopicTracker = {
  _current:  null,  // { label, psi, confidence, cycle }
  _history:  [],    // últimos 20 tópicos detectados
  _sessionTopics: new Map(), // label → count (frequência na sessão)

  // Calcula o centróide cartesiano de um conjunto de nós activos
  _centroid(activeNodes) {
    if (!activeNodes || activeNodes.length === 0) return null;
    const withPsi = activeNodes.filter(n => n.signature && n.signature.psi);
    if (withPsi.length === 0) return null;

    let sx = 0, sy = 0, sz = 0, totalW = 0;
    for (const node of withPsi) {
      const psi = node.signature.psi;
      const rad = psi.theta * Math.PI / 180;
      const w   = node.activation || 0.1;
      sx += psi.r * Math.cos(rad) * w;
      sy += psi.r * Math.sin(rad) * w;
      sz += psi.z * w;
      totalW += w;
    }
    if (totalW === 0) return null;

    const cx = sx / totalW, cy = sy / totalW, cz = sz / totalW;
    const r     = Math.sqrt(cx*cx + cy*cy);
    const theta = ((Math.atan2(cy, cx) * 180 / Math.PI) + 360) % 360;
    return { r: Math.min(1, r), theta, z: Math.max(0, cz) };
  },

  // Encontra o rótulo do tópico: forma lexical do nó mais próximo do centróide
  _label(centroidPsi, brainRef) {
    if (!centroidPsi || globalKDTree.size() === 0) return 'desconhecido';
    const nearest = globalKDTree.nearest(centroidPsi);
    if (!nearest) return 'desconhecido';
    // Prefere a forma lexical limpa
    const node = brainRef.nodes.get(nearest.nodeId);
    if (node && node.signature && node.signature.lexical) {
      return node.signature.lexical.split(' ')[0].toLowerCase();
    }
    return nearest.form || 'desconhecido';
  },

  // Actualiza o tópico com base nos nós activos do ciclo actual
  update(activeNodes, brainRef, cycle) {
    const centroid = this._centroid(activeNodes);
    if (!centroid) return null;

    const label      = this._label(centroid, brainRef);
    const confidence = activeNodes.length > 0
      ? Math.min(1, activeNodes.reduce((s,n) => s + (n.activation||0), 0) / activeNodes.length)
      : 0;

    const topic = { label, psi: centroid, confidence, cycle };
    this._current = topic;

    // Regista no histórico
    this._history.push(topic);
    if (this._history.length > 20) this._history.shift();

    // Frequência na sessão
    this._sessionTopics.set(label, (this._sessionTopics.get(label) || 0) + 1);

    return topic;
  },

  getCurrent()  { return this._current; },
  getHistory()  { return this._history.slice(-5); },

  // Tópico dominante da sessão (mais frequente)
  getDominant() {
    let maxLabel = null, maxCount = 0;
    for (const [label, count] of this._sessionTopics) {
      if (count > maxCount) { maxCount = count; maxLabel = label; }
    }
    return maxLabel ? { label: maxLabel, count: maxCount } : null;
  },

  serialize() {
    return {
      current:  this._current,
      dominant: this.getDominant(),
      history:  this.getHistory(),
      uniqueTopics: this._sessionTopics.size,
    };
  },
};

// ============================================================================
// 3. TOPIC CHANGE DETECTOR
// Compara o ψ do input actual com o centro de massa da ContextualInertia.
// Se a distância cartesiana ultrapassar o threshold → mudança de tópico.
// Acciona: reset parcial da inércia + recalibração do EpisodicRecall.
// Expõe métricas de instrumentação: fidelity, dominance, drift.
// ============================================================================
const TopicChangeDetector = {
  // Thresholds
  CHANGE_THRESHOLD:     0.55, // distância cartesiana [0,√2] que indica mudança
  SOFT_CHANGE_THRESHOLD:0.35, // mudança suave — ajusta mas não reseta
  DOMINANCE_THRESHOLD:  0.40, // episodicDominance acima disto → alerta

  _lastChangeCycle: 0,
  _changeCount:     0,

  // Calcula as três métricas de instrumentação
  // psiInput:     ψ do input real (antes do bias)
  // psiForPlanner: ψ enviado ao planner (depois do bias)
  // activeNodes:  nós activos no ciclo
  // episodicBoosted: contagem de nós boosted por EpisodicRecall
  measure(psiInput, psiForPlanner, activeNodes, episodicBoosted) {
    const metrics = { fidelity: 1, dominance: 0, drift: 0 };

    // 1. Input Fidelity: quanto o biasedQuery distorceu o input real
    if (psiInput && psiForPlanner) {
      const r1 = psiInput.theta     * Math.PI / 180;
      const r2 = psiForPlanner.theta * Math.PI / 180;
      const dx = psiInput.r     * Math.cos(r1) - psiForPlanner.r * Math.cos(r2);
      const dy = psiInput.r     * Math.sin(r1) - psiForPlanner.r * Math.sin(r2);
      const dz = psiInput.z - psiForPlanner.z;
      const distFidelity = Math.sqrt(dx*dx + dy*dy + dz*dz);
      // Normaliza [0, √2] → [1, 0]: 1 = sem distorção, 0 = completamente distorcido
      metrics.fidelity = Math.max(0, 1 - distFidelity / Math.SQRT2);
    }

    // 2. Episodic Dominance: fracção de nós activos boosted por episódios
    if (activeNodes && activeNodes.length > 0) {
      metrics.dominance = Math.min(1, episodicBoosted / activeNodes.length);
    }

    // 3. Context Drift: distância entre contextPsi e psiInput
    const contextPsi = ContextualInertia.getContextPsi();
    if (contextPsi && psiInput) {
      const rc = contextPsi.theta * Math.PI / 180;
      const ri = psiInput.theta   * Math.PI / 180;
      const dx = contextPsi.r * Math.cos(rc) - psiInput.r * Math.cos(ri);
      const dy = contextPsi.r * Math.sin(rc) - psiInput.r * Math.sin(ri);
      const dz = contextPsi.z - psiInput.z;
      metrics.drift = Math.min(1, Math.sqrt(dx*dx + dy*dy + dz*dz) / Math.SQRT2);
    }

    return metrics;
  },

  // Detecta e reage à mudança de tópico
  // Devolve: { changed, type, metrics, action }
  detect(psiInput, activeNodes, episodicBoosted, cycle) {
    const contextPsi = ContextualInertia.getContextPsi();
    if (!psiInput || !contextPsi) {
      return { changed: false, type: null, metrics: { fidelity:1, dominance:0, drift:0 } };
    }

    const metrics = this.measure(psiInput, ContextualInertia.biasedQuery(psiInput), activeNodes, episodicBoosted);

    // Avalia mudança por drift
    let changed = false, type = null, action = null;

    if (metrics.drift > this.CHANGE_THRESHOLD) {
      // Mudança forte: reset parcial da inércia (mantém 30% do histórico)
      changed = true; type = 'hard'; action = 'partial_reset';
      this._changeCount++;
      this._lastChangeCycle = cycle;

      // Reset parcial: move o centro de massa 50% em direcção ao novo input
      const rad = psiInput.theta * Math.PI / 180;
      const nx  = psiInput.r * Math.cos(rad);
      const ny  = psiInput.r * Math.sin(rad);
      const nz  = psiInput.z;
      ContextualInertia._cx = ContextualInertia._cx * 0.5 + nx * 0.5;
      ContextualInertia._cy = ContextualInertia._cy * 0.5 + ny * 0.5;
      ContextualInertia._cz = ContextualInertia._cz * 0.5 + nz * 0.5;

      console.log('[TopicChange] Hard change detected. Drift:', metrics.drift.toFixed(3));

    } else if (metrics.drift > this.SOFT_CHANGE_THRESHOLD) {
      // Mudança suave: apenas ajusta o lambda temporariamente
      changed = true; type = 'soft'; action = 'lambda_adjust';
      // Reduz lambda temporariamente → dá mais peso ao input novo
      const tempLambda = CFG.CONTEXT_LAMBDA * 0.6;
      const rad = psiInput.theta * Math.PI / 180;
      const nx  = psiInput.r * Math.cos(rad);
      const ny  = psiInput.r * Math.sin(rad);
      const nz  = psiInput.z;
      ContextualInertia._cx = tempLambda * ContextualInertia._cx + (1 - tempLambda) * nx;
      ContextualInertia._cy = tempLambda * ContextualInertia._cy + (1 - tempLambda) * ny;
      ContextualInertia._cz = tempLambda * ContextualInertia._cz + (1 - tempLambda) * nz;
    }

    // Alerta de dominância episódica excessiva
    const dominanceAlert = metrics.dominance > this.DOMINANCE_THRESHOLD;
    if (dominanceAlert) {
      console.warn('[TopicChange] Episodic dominance high:', metrics.dominance.toFixed(3),
        '— episódios podem estar a sobrepor-se ao input real.');
    }

    return { changed, type, action, metrics, dominanceAlert, changeCount: this._changeCount };
  },

  serialize() {
    return {
      lastChangeCycle: this._lastChangeCycle,
      changeCount:     this._changeCount,
      thresholds: {
        hard: this.CHANGE_THRESHOLD,
        soft: this.SOFT_CHANGE_THRESHOLD,
        dominance: this.DOMINANCE_THRESHOLD,
      },
    };
  },
};

// ============================================================================
// PATCH DE INTEGRAÇÃO
// Envolve os handlers 'perceive' e 'chat' existentes com os novos sistemas.
// Usa o padrão Decorator sobre self.onmessage — não substitui, estende.
// ============================================================================
(function applyContextPatch() {
  const _originalOnMessage = self.onmessage;

  self.onmessage = async function(e) {
    const { command, payload } = e.data;

    // Comandos novos do patch — tratados aqui, não chegam ao handler original
    if (command === 'getTopicState') {
      self.postMessage({
        type:        'topicState',
        topic:       TopicTracker.serialize(),
        changeDetector: TopicChangeDetector.serialize(),
      });
      return;
    }

    // Para perceive e chat, intercepta a mensagem, enriquece, e repassa
    if (command === 'perceive' || command === 'chat') {
      const inputStr = typeof payload === 'string' ? payload : '';

      // Classifica o acto de fala ANTES de repassar ao handler original
      // Extrai tokens rapidamente para o classifier
      const quickTokens = inputStr.split(/[\s,;.!?()\[\]{}"]+/)
        .filter(t => t.length > 1)
        .map(t => ({
          form: t.toLowerCase(),
          roles: { isNeg: /^(não|no|not|never|nem|nunca)$/i.test(t.toLowerCase()) }
        }));

      const speechAct   = SpeechActClassifier.classify(inputStr, quickTokens);
      const plannerHints = SpeechActClassifier.plannerHints(speechAct);

      // Armazena no contexto global para o SyntacticPlanner aceder
      self._currentSpeechAct    = speechAct;
      self._currentPlannerHints = plannerHints;

      // Chama o handler original — ele processa tudo incluindo ContextualInertia
      await _originalOnMessage.call(this, e);

      // Após o handler original correr, acede aos resultados e enriquece
      // TopicTracker e TopicChangeDetector precisam dos nós activos
      // Usamos brain (global no worker) directamente
      try {
        const activeNodes = Array.from(brain.nodes.values())
          .filter(n => n.activation > 0.1)
          .sort((a, b) => (b.activation||0) - (a.activation||0))
          .slice(0, 12);

        // Actualiza TopicTracker
        const topic = TopicTracker.update(activeNodes, brain, brain.cycle);

        // Detecta mudança de tópico
        const contextoAgente = { W_estado: Metacognition.W_estado, frustration: Metacognition.frustration };

        // Re-calcula psiInput para métricas (SemanticTokenizer já foi chamado no handler)
        const tokens   = SemanticTokenizer.extract(inputStr);
        const psiInput = SemanticTokenizer.synthesizePhraseGeometry(tokens, contextoAgente);

        // Conta nós boosted por episódios (estimativa via EpisodicRecall cache size delta)
        const episodicBoosted = self._lastEpisodicBoost || 0;

        const changeResult = TopicChangeDetector.detect(
          psiInput, activeNodes, episodicBoosted, brain.cycle
        );

        // Envia evento de contexto enriquecido ao cliente
        self.postMessage({
          type:        'contextEnriched',
          cycle:       brain.cycle,
          speechAct,
          plannerHints,
          topic:       topic ? { label: topic.label, confidence: +topic.confidence.toFixed(3) } : null,
          topicChange: changeResult,
          metrics:     changeResult.metrics,
          // Alerta se dominância ou fidelidade fora dos limites seguros
          alerts: {
            dominanceHigh:  changeResult.dominanceAlert,
            fidelityLow:    changeResult.metrics.fidelity < 0.5,
            driftHigh:      changeResult.metrics.drift > TopicChangeDetector.SOFT_CHANGE_THRESHOLD,
          },
        });

      } catch(err) {
        console.warn('[ContextPatch] Post-processing error:', err.message);
      }

      return;
    }

    // Todos os outros comandos: passa directamente ao handler original
    return _originalOnMessage.call(this, e);
  };

  console.log('[AIO-Patch] Context patch applied. SpeechAct + TopicTracker + TopicChangeDetector active.');
})();

// ============================================================================
// PATCH DO SYNTACTIC PLANNER — usa speechAct hints para orientar candidatos
// Estende candidatesForRole com o thetaBias do speechAct actual
// ============================================================================
(function patchSyntacticPlanner() {
  const _originalCandidatesForRole = SyntacticPlanner.candidatesForRole;

  // Sobrepõe candidatesForRole para aplicar hints do SpeechActClassifier
  SyntacticPlanner.candidatesForRole = function(psiTarget, role, n = 4) {
    const hints = self._currentPlannerHints;

    // Se não há hints ou o papel já é preferido, usa o original
    if (!hints) return _originalCandidatesForRole(psiTarget, role, n);

    // Ajusta o psiTarget com o thetaBias do speechAct
    const thetaBiased = hints.thetaBias
      ? {
          r:     psiTarget ? psiTarget.r : 0.5,
          theta: (((psiTarget ? psiTarget.theta : 135) * 0.6 + hints.thetaBias * 0.4) + 360) % 360,
          z:     psiTarget ? psiTarget.z : 0.1,
        }
      : psiTarget;

    // Roles preferidos recebem mais candidatos
    const isPreferred = hints.preferredRoles && hints.preferredRoles.includes(role);
    const adjustedN   = isPreferred ? n + 2 : n;

    return _originalCandidatesForRole(thetaBiased, role, adjustedN);
  };

  console.log('[AIO-Patch] SyntacticPlanner patched with SpeechAct hints.');
})();

// ============================================================================
// PATCH DO AUTONOMOUS LOOP — inclui tópico e métricas no autonomousTick
// ============================================================================
(function patchAutonomousLoop() {
  const _originalStep = AutonomousLoop._step.bind(AutonomousLoop);

  AutonomousLoop._step = async function() {
    await _originalStep();

    // Enriquece autonomousTick com dados de tópico (apenas a cada 10 ticks)
    if (this._tick % 10 === 0) {
      self.postMessage({
        type:  'topicTick',
        tick:  this._tick,
        topic: TopicTracker.serialize(),
        changeDetector: TopicChangeDetector.serialize(),
      });
    }
  };

  console.log('[AIO-Patch] AutonomousLoop patched with topic awareness.');
})();