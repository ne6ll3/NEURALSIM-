// ============================================================================
// AIO-PATCH — ORCHESTRATION
// Fecha as ligações entre módulos existentes.
// Zero módulos novos. Apenas conexões que faltavam.
//
// Ligações implementadas:
//   1. EmotionalMemory.weightModifier → brain.calculateResonance
//   2. GoalGenerator.goals → ThalamicLobe.adjustAttention
//   3. SelfModel.beliefs → PropositionVerifier
//   4. Metacognition.surprise → LoboFuzzy
//   5. CompositionalWeight.phraseWeight → ResponseSynthesizer candidatos
//   6. XTracker.X → EpisodicRecall query primária
//   7. SpeechAct → ResponseSynthesizer forma da resposta
//   8. ActivationSources — decomposição por origem
// ============================================================================

// ── Guarda: só aplica se os módulos necessários estiverem carregados ──────────
(function checkDependencies() {
  const required = ['brain','Metacognition','SelfModel','GoalGenerator',
                    'PropositionVerifier','LoboFuzzy','ThalamicLobe',
                    'ResponseSynthesizer','EpisodicRecall'];
  const optional = ['EmotionalMemory','XTracker','CompositionalWeight'];
  for (const dep of required) {
    if (typeof self[dep] === 'undefined' && typeof eval(dep) === 'undefined') {
      console.error('[Orchestration] Dependência em falta:', dep);
    }
  }
  console.log('[Orchestration] Verificação de dependências concluída.');
})();

// ============================================================================
// LIGAÇÃO 1 — EmotionalMemory.weightModifier → brain.calculateResonance
// A ressonância de um nó é agora modulada pelo seu histórico emocional.
// Conceitos tensos têm ressonância reduzida — o agente hesita ao usá-los.
// ============================================================================
(function patchCalculateResonance() {
  const _orig = brain.calculateResonance.bind(brain);

  brain.calculateResonance = function(input, signature) {
    const baseResonance = _orig(input, signature);
    if (baseResonance <= 0) return 0;

    // Aplica modificador emocional se EmotionalMemory disponível
    if (typeof EmotionalMemory === 'undefined') return baseResonance;

    // Encontra o nó correspondente a esta signature
    let targetNode = null;
    this.nodes.forEach(n => {
      if (n.signature === signature) targetNode = n;
    });

    if (!targetNode) return baseResonance;

    const modifier = EmotionalMemory.weightModifier(targetNode);
    return Math.min(1, baseResonance * modifier);
  };

  console.log('[Orchestration] L1: EmotionalMemory → calculateResonance');
})();

// ============================================================================
// LIGAÇÃO 2 — GoalGenerator.goals → ThalamicLobe.adjustAttention
// A urgência dos objectivos activos influencia os pesos de atenção do Thalamus.
// Objectivos de alta urgência aumentam o peso do LoboInferencial (resolve).
// Objectivos de contradição aumentam o peso do LoboFuzzy (tensão emocional).
// ============================================================================
(function patchThalamicAttention() {
  const _orig = thalamus.adjustAttention.bind(thalamus);

  thalamus.adjustAttention = function() {
    _orig(); // aplica a lógica original primeiro

    if (typeof GoalGenerator === 'undefined') return;

    const activeGoals = GoalGenerator.getActive();
    if (activeGoals.length === 0) return;

    // Urgência máxima dos objectivos activos
    const maxUrgency     = activeGoals.reduce((m, g) => Math.max(m, g.urgency), 0);
    const contraGoals    = activeGoals.filter(g => g.type === 'resolve_contradiction');
    const noveltyGoals   = activeGoals.filter(g => g.type === 'explore_novelty');
    const consolidGoals  = activeGoals.filter(g => g.type === 'consolidate_pattern');

    // Ajuste baseado no tipo de objectivo dominante
    if (contraGoals.length > 0) {
      // Contradição pendente: inferencial sobe (precisa de resolver)
      const boost = Math.min(0.15, contraGoals[0].urgency * 0.2);
      this.attentionWeights.inferential = Math.min(0.70,
        this.attentionWeights.inferential + boost);
    }

    if (noveltyGoals.length > 0) {
      // Novidade: emergente sobe (precisa de explorar)
      const boost = Math.min(0.10, noveltyGoals[0].urgency * 0.15);
      this.attentionWeights.emergent = Math.min(0.60,
        this.attentionWeights.emergent + boost);
    }

    if (consolidGoals.length > 0) {
      // Consolidação: fuzzy sobe ligeiramente (padrão já existe, confirma)
      const boost = Math.min(0.08, consolidGoals[0].urgency * 0.10);
      this.attentionWeights.fuzzy = Math.min(0.50,
        this.attentionWeights.fuzzy + boost);
    }

    // Re-normaliza após ajuste
    const sum = Object.values(this.attentionWeights).reduce((a, b) => a + b, 0);
    if (sum > 0) {
      Object.keys(this.attentionWeights).forEach(k =>
        this.attentionWeights[k] /= sum
      );
    }
  };

  console.log('[Orchestration] L2: GoalGenerator.goals → ThalamicLobe.adjustAttention');
})();

// ============================================================================
// LIGAÇÃO 3 — SelfModel.beliefs → PropositionVerifier
// O verificador agora controla proposições contra as crenças do SelfModel.
// Uma proposição que contradiz uma crença de peso > 0.7 é rejeitada.
// ============================================================================
(function patchPropositionVerifier() {
  // Estende checkBeliefCoherence para incluir SelfModel.beliefs reais
  const _origVerify = PropositionVerifier.verify;

  PropositionVerifier.verify = function(sequence, intent) {
    const result = _origVerify(sequence, intent);

    if (!SelfModel || !SelfModel.beliefs || SelfModel.beliefs.length === 0) {
      return result;
    }

    // Verifica cada token da sequência contra as crenças
    const beliefViolations = [];
    for (const token of sequence) {
      if (!token.form) continue;
      for (const belief of SelfModel.beliefs) {
        if (belief.weight < 0.70) continue; // só verifica crenças fortes

        // Detecta negação directa de uma crença
        // Se a crença diz "X Y" e a proposição tem "não X Y" → violação
        const beliefTokens = belief.statement.toLowerCase().split(/\s+/);
        const tokenIsInBelief = beliefTokens.includes(token.form.toLowerCase());

        if (tokenIsInBelief && token.role === 'predicate' && token.polarity === -1) {
          beliefViolations.push({
            type:     'belief_contradiction',
            belief:   belief.statement,
            token:    token.form,
            weight:   belief.weight,
            severity: belief.weight * 0.8,
          });
        }
      }
    }

    if (beliefViolations.length === 0) return result;

    // Recalcula score com violações de crença
    const allIssues   = [...result.issues, ...beliefViolations];
    const maxSeverity = Math.max(...allIssues.map(i => i.severity || 0));
    const score       = Math.max(0, 1 - maxSeverity);

    return {
      ...result,
      valid:           score >= 0.4,
      score:           +score.toFixed(3),
      beliefViolations,
      issues:          allIssues,
    };
  };

  console.log('[Orchestration] L3: SelfModel.beliefs → PropositionVerifier');
})();

// ============================================================================
// LIGAÇÃO 4 — Metacognition.surprise → LoboFuzzy
// O LoboFuzzy passa a consumir surprise como variável principal.
// Alta surpresa → aumenta exploração e curiosidade.
// Baixa surpresa → confirma padrão, aumenta exploit.
// ============================================================================
(function patchLoboFuzzy() {
  const _orig = LoboFuzzy.propose.bind(LoboFuzzy);

  LoboFuzzy.propose = function(sensoryInput) {
    const base   = _orig(sensoryInput);
    const surprise = Metacognition.surprise || 0;
    const goalUrgency = typeof GoalGenerator !== 'undefined'
      ? GoalGenerator.maxUrgency()
      : 0;

    // Surprise modifica o vector do LoboFuzzy
    // Alta surpresa → mais exploração, menos wait
    // Baixa surpresa → mais exploit (padrão confirmado)
    const surpriseExplore = surprise * 0.6;
    const surpriseExploit = (1 - surprise) * 0.4;
    const goalBoost       = goalUrgency * 0.3;

    return {
      ...base,
      vector: {
        ...base.vector,
        explore:     Math.min(1, (base.vector.explore  || 0) + surpriseExplore),
        exploit:     Math.min(1, (base.vector.exploit  || 0) + surpriseExploit),
        wait:        Math.max(0, (base.vector.wait     || 0) - surprise * 0.2),
        create:      Math.min(1, (base.vector.create   || 0) + goalBoost),
      },
      // Expõe as fontes do vector para diagnóstico
      sources: { surprise, goalUrgency, baseAction: base.action },
    };
  };

  console.log('[Orchestration] L4: Metacognition.surprise → LoboFuzzy');
})();

// ============================================================================
// LIGAÇÃO 5 — CompositionalWeight.phraseWeight → ResponseSynthesizer
// O phraseWeight filtra os candidatos da KD-Tree:
// candidatos cujo peso composicional é muito inferior ao phraseWeight
// são descartados — o agente não responde com conceitos de baixa densidade
// quando a pergunta tem alta densidade semântica.
// ============================================================================
(function patchResponseSynthesizerCandidates() {
  if (typeof SyntacticPlanner === 'undefined') return;

  const _origPlan = SyntacticPlanner.plan;

  SyntacticPlanner.plan = function(psiIntent, context) {
    // Injeta phraseWeight no contexto do planner
    const phraseWeight = self._phraseWeight || 0;
    const enrichedContext = {
      ...context,
      phraseWeight,
      // Filtra nós activos por peso emocional se disponível
      activatedNodes: (context.activatedNodes || []).filter(n => {
        if (!n || typeof EmotionalMemory === 'undefined') return true;
        const mod = EmotionalMemory.weightModifier(n);
        // Remove nós com modificador muito baixo quando phraseWeight é alto
        return phraseWeight < 0.6 || mod > 0.5;
      }),
    };

    return _origPlan.call(this, psiIntent, enrichedContext);
  };

  // Estende scoreCandidate para usar compositionalWeight se disponível
  const _origScore = SyntacticPlanner.scoreCandidate ||
    function(candidate, psiTarget, brainRef, otherNodes) { return 0; };

  // Injeta peso composicional no scoring dos candidatos
  // Candidatos com psi.r muito baixo perdem score quando phraseWeight é alto
  const _origCandidatesForRole = SyntacticPlanner.candidatesForRole;
  SyntacticPlanner.candidatesForRole = function(psiTarget, role, n = 4) {
    const candidates = _origCandidatesForRole.call(this, psiTarget, role, n);
    const phraseWeight = self._phraseWeight || 0;
    if (phraseWeight < 0.5) return candidates; // só filtra para frases densas

    // Filtra candidatos cuja densidade (r) é incompatível com a densidade da frase
    return candidates.filter(c => {
      if (!c.psi) return true;
      // Para frases densas (phraseWeight > 0.5), exige r > 0.3 nos candidatos
      return c.psi.r > 0.3;
    });
  };

  console.log('[Orchestration] L5: CompositionalWeight.phraseWeight → SyntacticPlanner');
})();

// ============================================================================
// LIGAÇÃO 6 — XTracker.X → EpisodicRecall query primária
// Quando o X está definido, o EpisodicRecall usa o ψ do X como query
// em vez do ψ do input isolado — recupera episódios sobre o tema central,
// não apenas sobre o último input.
// ============================================================================
(function patchEpisodicRecallQuery() {
  if (typeof EpisodicRecall === 'undefined' || typeof XTracker === 'undefined') return;

  const _origRecall = EpisodicRecall.recall.bind(EpisodicRecall);

  EpisodicRecall.recall = function(psiQuery, n) {
    // Se X está definido e tem ψ, combina: 60% X + 40% query actual
    if (typeof XTracker !== 'undefined') {
      const X = XTracker.getX();
      if (X && X.psi && psiQuery) {
        const xRad = X.psi.theta * Math.PI / 180;
        const qRad = psiQuery.theta * Math.PI / 180;
        const mx   = X.psi.r * Math.cos(xRad) * 0.6 + psiQuery.r * Math.cos(qRad) * 0.4;
        const my   = X.psi.r * Math.sin(xRad) * 0.6 + psiQuery.r * Math.sin(qRad) * 0.4;
        const mz   = X.psi.z * 0.6 + psiQuery.z * 0.4;
        const r     = Math.sqrt(mx*mx + my*my);
        const theta = ((Math.atan2(my, mx) * 180 / Math.PI) + 360) % 360;
        const combinedPsi = { r: Math.min(1, r), theta, z: Math.max(0, mz) };
        return _origRecall(combinedPsi, n);
      }
    }
    return _origRecall(psiQuery, n);
  };

  console.log('[Orchestration] L6: XTracker.X → EpisodicRecall query');
})();

// ============================================================================
// LIGAÇÃO 7 — SpeechAct → ResponseSynthesizer forma da resposta
// O synthesize passa a moldar directamente a forma textual baseado no speechAct.
// Questões recebem proposições informativas.
// Pedidos recebem proposições de acção.
// Contradições recebem reconhecimento da tensão.
// ============================================================================
(function patchResponseSynthesizerForm() {
  const _origSynthesize = ResponseSynthesizer.synthesize;

  ResponseSynthesizer.synthesize = function(opts) {
    const result     = _origSynthesize.call(this, opts);
    const speechAct  = self._currentSpeechAct;
    if (!speechAct || !result) return result;

    const lang = result.lang || 'pt';
    let   text = result.text || '';

    // Molda a forma do texto baseado no acto de fala
    // Só actua se o planner produziu texto (não em fallback de erro)
    if (result.plannerUsed && text && text.length > 3) {
      switch(speechAct.act) {

        case 'question':
          // Questões de definição: prefixo informativo
          if (speechAct.subtype === 'definition') {
            const prefix = lang === 'pt' ? '' : '';
            // Não adiciona prefixo — a proposição já deve ser informativa
            // Mas garante que termina com ponto, não com reticências
            text = text.replace(/\.\.\.$/, '.').replace(/\s*\.$/, '.');
          }
          // Questões yes/no: adiciona confirmação/negação baseada na verificação
          if (speechAct.subtype === 'yes_no' && result.verificationScore >= 0.7) {
            const affirm = lang === 'pt' ? 'Sim. ' : 'Yes. ';
            if (!text.startsWith(affirm)) text = affirm + text;
          }
          break;

        case 'contradiction':
          // Reconhece a tensão antes de responder
          if (result.tension > 20) {
            const tension = lang === 'pt'
              ? `Detecto tensão (${result.tension}%). `
              : `Tension detected (${result.tension}%). `;
            text = tension + text;
          }
          break;

        case 'acknowledgement':
          // Respostas a acks são breves — trunca se muito longa
          const words = text.split(/\s+/);
          if (words.length > 12) {
            text = words.slice(0, 10).join(' ') + '.';
          }
          break;

        case 'clarification':
          // Clarificação: repete o X se definido
          if (typeof XTracker !== 'undefined') {
            const X = XTracker.getX();
            if (X && X.form && !text.toLowerCase().includes(X.form.toLowerCase())) {
              const clarPrefix = lang === 'pt'
                ? `Sobre ${X.form}: `
                : `Regarding ${X.form}: `;
              text = clarPrefix + text;
            }
          }
          break;
      }
    }

    return { ...result, text, speechActApplied: speechAct.act };
  };

  console.log('[Orchestration] L7: SpeechAct → ResponseSynthesizer forma');
})();

// ============================================================================
// LIGAÇÃO 8 — ActivationSources — decomposição da activação por origem
// Cada nó regista de onde veio a sua activação neste ciclo.
// Permite calcular topicPurity e dominanceRatio com precisão.
// ============================================================================
(function patchActivationSources() {
  // Estende brain.activate para registar fontes
  const _origActivate = brain.activate.bind(brain);

  brain.activate = function(sensorialInput, depth) {
    const result = _origActivate(sensorialInput, depth);

    // Inicializa activationSources nos nós activados
    for (const node of (result.activated || [])) {
      if (!node) continue;
      // resonance = activação que veio da ressonância com o input
      // (os outros são preenchidos pelos patches respectivos)
      node.activationSources = {
        resonance:  +(node.activation || 0).toFixed(3),
        context:    0,  // preenchido por ContextualInertia
        episodic:   0,  // preenchido por EpisodicRecall
        autonomous: 0,  // preenchido por AutonomousLoop
      };
    }

    return result;
  };

  // Patch EpisodicRecall.injectIntoGraph para registar fonte
  if (typeof EpisodicRecall !== 'undefined') {
    const _origInject = EpisodicRecall.injectIntoGraph.bind(EpisodicRecall);

    EpisodicRecall.injectIntoGraph = function(recalled, brainRef) {
      const boosted = _origInject(recalled, brainRef);

      // Regista a fonte episódica nos nós boosted
      if (recalled && recalled.length > 0) {
        for (const ep of recalled) {
          for (const concept of (ep.concepts || [])) {
            brainRef.nodes.forEach(node => {
              if (node.activationSources &&
                  node.signature?.lexical?.toLowerCase().includes(concept.toLowerCase())) {
                node.activationSources.episodic += CFG.EPISODE_BOOST;
                node.activationSources.resonance = Math.max(0,
                  node.activationSources.resonance - CFG.EPISODE_BOOST * 0.5
                );
              }
            });
          }
        }
      }

      // Armazena para TopicChangeDetector
      self._lastEpisodicBoost = boosted;
      return boosted;
    };
  }

  // Patch AutonomousLoop para registar fonte autónoma
  if (typeof AutonomousLoop !== 'undefined') {
    const _origStep = AutonomousLoop._step.bind(AutonomousLoop);
    AutonomousLoop._step = async function() {
      await _origStep();
      // Marca nós reforçados autonomamente
      brain.nodes.forEach(node => {
        if (node.activationSources && node.activation > 0.1 &&
            (Date.now() - (node.lastFired || 0)) < CFG.AUTONOMOUS_TICK_MS * 2) {
          if (node.activationSources.resonance === 0 &&
              node.activationSources.episodic === 0) {
            node.activationSources.autonomous = +(node.activation * 0.3).toFixed(3);
          }
        }
      });
    };
  }

  console.log('[Orchestration] L8: ActivationSources registadas por origem');
})();

// ============================================================================
// topicPurity — calculável agora que activationSources existe
// Exposta como função global para uso pelo TopicTracker e TopicChangeDetector
// ============================================================================
function calculateTopicPurity(activeNodes) {
  if (!activeNodes || activeNodes.length === 0) return 0;
  let totalResonance = 0, totalActivation = 0;

  for (const node of activeNodes) {
    const total = node.activation || 0;
    totalActivation += total;
    if (node.activationSources) {
      totalResonance += node.activationSources.resonance || 0;
    } else {
      totalResonance += total; // fallback: assume tudo ressonância
    }
  }

  return totalActivation > 0
    ? Math.min(1, totalResonance / totalActivation)
    : 0;
}

// ── Comando de diagnóstico das orquestrações ──────────────────────────────────
(function addOrchestrationCommand() {
  const _orig = self.onmessage;

  self.onmessage = async function(e) {
    if (e.data.command === 'getOrchestration') {
      const activeNodes = Array.from(brain.nodes.values())
        .filter(n => (n.activation || 0) > 0.05);

      const purity = calculateTopicPurity(activeNodes);

      // Amostra de activationSources dos nós mais activos
      const sourceSample = activeNodes
        .sort((a, b) => (b.activation||0) - (a.activation||0))
        .slice(0, 8)
        .map(n => ({
          form:    n.signature?.lexical?.split(' ')[0] || n.id,
          activation: +(n.activation||0).toFixed(3),
          sources: n.activationSources || null,
        }));

      self.postMessage({
        type:          'orchestrationState',
        topicPurity:   +purity.toFixed(3),
        sourceSample,
        goals:         typeof GoalGenerator !== 'undefined'
          ? GoalGenerator.getActive().map(g => ({ type:g.type, urgency:+g.urgency.toFixed(2) }))
          : [],
        beliefs:       SelfModel.beliefs.length,
        emergentBeliefs: SelfModel.beliefs.filter(b => b.emergent).length,
        X:             typeof XTracker !== 'undefined' ? XTracker.getX() : null,
        attention:     thalamus.attentionWeights,
        surprise:      Metacognition.surprise || 0,
      });
      return;
    }

    return _orig.call(this, e);
  };
})();

console.log('[AIO-Patch] Orchestration complete. 8 ligações activas.');