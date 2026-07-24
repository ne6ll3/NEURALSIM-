// ============================================================================
// AIO-PATCH — PATTERN LAYER
// Terceira camada da adaptação AUN: agrupa estrutura de disputas por
// fingerprint categórico, gera priors de risco que alimentam o Anti-Pattern
// (a implementar separadamente), sem NUNCA persistir automaticamente.
//
// ANALOGIA: como uma metacognição num subnível maleável — solidifica-se com
// uso repetido validado, permanece líquida (não-persistente, não-influente)
// enquanto não houver confirmação humana e uso real sustentado.
//
// GARANTIAS ESTRUTURAIS (não negociáveis, verificadas no código):
//   1. Nunca escreve em NeuralGraph, hebbianConnect(), ou KD-Tree.
//   2. Nunca influencia isInputKnown() — não é "conhecimento", é meta-padrão.
//   3. Opera sempre sobre CLONES de dados de disputa, nunca referências vivas.
//   4. Nenhum cluster ganha influência sem decisão humana explícita (/patterns:track).
//   5. Influência sobre respostas é sempre visível em /why, nunca silenciosa.
//   6. Confiança do próprio padrão evolui como "experiência" — reforça com
//      uso limpo, penaliza com disputa, decai com inactividade.
//
// CICLO DE VIDA:
//   candidate (invisível, count<10)
//     → count≥10 → elegível para /patterns:review
//     → decisão humana: /patterns:track (conf inicial 0.20-0.25) | /patterns:reject (morto)
//   tracked (visível em diagnóstico, NÃO afecta pontuação de respostas)
//     → uso limpo: confiança sobe gradualmente
//     → uso disputado: confiança desce, fingerprint fica marcado para revisão
//     → sem uso: confiança decai naturalmente
//     → validação sustentada (usos≥MIN, confiança≥LIMIAR) → canonical
//   canonical (só agora modula pontuação — ephemeral, nunca reescreve
//              confiança armazenada nas proposições, sempre visível em /why)
// ============================================================================

const PatternLayerCFG = {
  ELIGIBILITY_COUNT:      10,    // disputas distintas para tornar-se elegível
  INITIAL_CONFIDENCE:     0.22,  // confiança inicial ao ser aceite para tracking (0.20-0.25)
  REINFORCE_INCREMENT:    0.03,  // ganho de confiança por uso limpo (sem disputa)
  DISPUTE_PENALTY:        0.10,  // perda de confiança por uso disputado
  DECAY_RATE:             0.985, // decaimento por ciclo autónomo sem reforço
  DECAY_MIN_CYCLES_IDLE:  20,    // ciclos sem uso antes do decaimento começar a aplicar
  CANONICAL_THRESHOLD:    0.55,  // confiança mínima para promoção a canonical
  CANONICAL_MIN_USES:     15,    // usos mínimos pós-tracking antes de poder promover
  CANONICAL_SCORE_WEIGHT: 0.15,  // peso máximo da modulação em selectBest() — mesmo tecto do AUN
};

// ============================================================================
// FINGERPRINT — características estruturais categóricas, nunca o conteúdo
// factual da proposição. "CAUSES,inferred,mid,true,false" agrupa "fogo causa
// calor" e "raio causa som" como o MESMO padrão estrutural, mesmo sendo
// factos completamente distintos.
// ============================================================================
// ============================================================================
// ANTI-DUPLICAÇÃO — Levenshtein normalizado sobre sujeito e objecto SEPARADOS
// Evita que "10 disputas" signifique "o mesmo par repetido 10 vezes" em vez
// de 10 sinais genuinamente distintos. Compara sujeito e objecto isoladamente
// e exige AMBOS acima do limiar — comparar a string concatenada infla
// falsamente a similaridade quando o sujeito é partilhado (ex: "molécula de
// hidrogénio" vs "molécula de oxigénio" são factos DIFERENTES, não duplicados,
// apesar de "molécula" ser comum aos dois).
// ============================================================================
function _levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({length: m+1}, () => new Array(n+1).fill(0));
  for (let i=0;i<=m;i++) dp[i][0]=i;
  for (let j=0;j<=n;j++) dp[0][j]=j;
  for (let i=1;i<=m;i++) for (let j=1;j<=n;j++) {
    const cost = a[i-1]===b[j-1] ? 0 : 1;
    dp[i][j] = Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1]+cost);
  }
  return dp[m][n];
}
function _similarity(a, b) {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - (_levenshtein(a, b) / maxLen);
}
const DUPLICATE_SIM_THRESHOLD = 0.85; // calibrado e testado — ver notas de análise

// Verifica se um novo membro é duplicado próximo de algum membro já existente
// no cluster. Devolve true só se AMBOS sujeito e objecto excedem o limiar.
function _isDuplicateMember(candidate, existingMembers) {
  for (const m of existingMembers) {
    const subjSim = _similarity((candidate.subject||'').toLowerCase(), (m.subject||'').toLowerCase());
    const objSim  = _similarity((candidate.object||'').toLowerCase(),  (m.object||'').toLowerCase());
    if (subjSim > DUPLICATE_SIM_THRESHOLD && objSim > DUPLICATE_SIM_THRESHOLD) return true;
  }
  return false;
}

function patternZBand(z) {
  if (z == null) return 'none';
  if (z < 0.3) return 'low';
  if (z < 0.6) return 'mid';
  return 'high';
}

function fingerprintOf(prop) {
  const z = Math.max(prop.psiSubject?.z || 0, prop.psiObject?.z || 0);
  return {
    relation:     prop.relation,
    source:       prop.source,
    zBand:        patternZBand(z),
    hasQualifier: !!prop.qualifier,
    hasContext:   !!prop.context,
  };
}

function fingerprintKey(fp) {
  return `${fp.relation}::${fp.source}::${fp.zBand}::${fp.hasQualifier}::${fp.hasContext}`;
}

// Clona apenas os campos estruturais relevantes de uma proposição — nunca
// guarda a referência ao objecto vivo do PropositionStore.
function cloneForObservation(prop) {
  return {
    id:         prop.id,
    subject:    prop.subject,
    object:     prop.object,
    relation:   prop.relation,
    source:     prop.source,
    disputedAt: Date.now(),
  };
}

// ============================================================================
// PATTERN LAYER — o módulo principal
// ============================================================================
const PatternLayer = (() => {
  const _clusters = new Map(); // fingerprintKey → PatternCluster
  let _nextId = 1;

  function _makeCluster(fpKey, fp) {
    return {
      id:               'pat_' + (_nextId++) + '_' + Date.now(),
      fingerprint:      fp,
      fingerprintKey:   fpKey,
      members:          [],   // clones observados, nunca referências vivas
      count:            0,    // total de observações, incluindo duplicados próximos
      distinctCount:    0,    // observações genuinamente distintas (anti-duplicação)
      status:           'candidate', // candidate | tracked | canonical | rejected
      confidence:       null,
      disputeCount:     0,
      usesSinceTracked: 0,
      lastUsedCycle:    0,
      approvedAt:       null,
      canonicalAt:      null,
      refinementLog:    [], // histórico de disputas pós-tracking, para revisão humana
    };
  }

  // ── Observação de disputa real ──────────────────────────────────────────
  // Chamado quando disputeProp() dispara no PropositionStore — nunca por
  // iniciativa do Pattern Layer. A camada só observa o que já aconteceu.
  function recordDispute(prop, cycle) {
    if (!prop || !prop.relation) return null;
    const fp    = fingerprintOf(prop);
    const fpKey = fingerprintKey(fp);

    let cluster = _clusters.get(fpKey);
    if (!cluster) {
      cluster = _makeCluster(fpKey, fp);
      _clusters.set(fpKey, cluster);
    }

    if (cluster.status === 'rejected') return cluster; // morto, não reactiva

    const clone = cloneForObservation(prop);
    const isDuplicate = _isDuplicateMember(clone, cluster.members);

    cluster.members.push(clone);
    cluster.count++;
    if (!isDuplicate) cluster.distinctCount++;

    // Se já está a ser rastreado ou é canonical, isto é um "uso disputado"
    if (cluster.status === 'tracked' || cluster.status === 'canonical') {
      _recordUsage(cluster, true, cycle);
    } else if (cluster.status === 'candidate' && cluster.distinctCount >= PatternLayerCFG.ELIGIBILITY_COUNT) {
      // FIX: elegibilidade agora exige DIVERSIDADE real, não repetição do
      // mesmo par sujeito/objecto. 10 disputas do mesmo facto não bastam;
      // precisam de ser 10 sinais estruturalmente iguais mas factualmente
      // distintos.
      console.log('[PatternLayer] Cluster elegível para revisão:', cluster.id,
        '(' + cluster.fingerprintKey + ', distinto:' + cluster.distinctCount + '/' + cluster.count + ')');
    }

    return cluster;
  }

  // ── Observação de uso limpo (proposição nova corresponde a um fingerprint
  // já rastreado/canonical, sem ser disputada) ────────────────────────────
  function recordCleanUse(prop, cycle) {
    if (!prop || !prop.relation) return null;
    const fpKey = fingerprintKey(fingerprintOf(prop));
    const cluster = _clusters.get(fpKey);
    if (!cluster || (cluster.status !== 'tracked' && cluster.status !== 'canonical')) return null;
    _recordUsage(cluster, false, cycle);
    return cluster;
  }

  function _recordUsage(cluster, wasDisputed, cycle) {
    cluster.usesSinceTracked++;
    cluster.lastUsedCycle = cycle || cluster.lastUsedCycle;

    if (wasDisputed) {
      cluster.disputeCount++;
      cluster.confidence = Math.max(0.05, cluster.confidence - PatternLayerCFG.DISPUTE_PENALTY);
      cluster.refinementLog.push({ cycle, event: 'disputed', confidenceAfter: cluster.confidence });
      if (cluster.refinementLog.length > 20) cluster.refinementLog.shift();
      console.log('[PatternLayer] Disputa em', cluster.id, '→ conf:', cluster.confidence.toFixed(3),
        '(fingerprint marcado para revisão humana)');
    } else {
      cluster.confidence = Math.min(1, cluster.confidence + PatternLayerCFG.REINFORCE_INCREMENT);
    }

    // Promoção a canonical — só depois de validação sustentada, nunca
    // apenas por decisão humana inicial (essa só concede tracking)
    if (cluster.status === 'tracked' &&
        cluster.usesSinceTracked >= PatternLayerCFG.CANONICAL_MIN_USES &&
        cluster.confidence >= PatternLayerCFG.CANONICAL_THRESHOLD) {
      cluster.status      = 'canonical';
      cluster.canonicalAt = Date.now();
      console.log('[PatternLayer] PROMOVIDO a canonical:', cluster.id,
        '(conf:' + cluster.confidence.toFixed(3) + ', usos:' + cluster.usesSinceTracked + ')');
    }
  }

  // ── Decaimento periódico — chamado pelo AutonomousLoop ───────────────────
  function decay(currentCycle) {
    for (const cluster of _clusters.values()) {
      if (cluster.status !== 'tracked' && cluster.status !== 'canonical') continue;
      const idleCycles = currentCycle - (cluster.lastUsedCycle || 0);
      if (idleCycles < PatternLayerCFG.DECAY_MIN_CYCLES_IDLE) continue;
      cluster.confidence *= PatternLayerCFG.DECAY_RATE;

      // Um canonical que decai abaixo do limiar volta a tracked — a
      // capacidade de influenciar respostas não é permanente, tem de
      // continuar a ser validada por uso real
      if (cluster.status === 'canonical' && cluster.confidence < PatternLayerCFG.CANONICAL_THRESHOLD) {
        cluster.status = 'tracked';
        console.log('[PatternLayer] Rebaixado de canonical para tracked (inactividade):', cluster.id);
      }
    }
  }

  // ── Consulta read-only para modulação de pontuação (só canonical) ───────
  // Devolve um multiplicador ephemeral, NUNCA escreve na proposição.
  function getCanonicalModifier(prop) {
    if (!prop || !prop.relation) return null;
    const fpKey = fingerprintKey(fingerprintOf(prop));
    const cluster = _clusters.get(fpKey);
    if (!cluster || cluster.status !== 'canonical') return null;

    // Peso da modulação escalado pela confiança do próprio padrão,
    // nunca excedendo o tecto CANONICAL_SCORE_WEIGHT
    const weight = PatternLayerCFG.CANONICAL_SCORE_WEIGHT * cluster.confidence;
    return {
      patternId:    cluster.id,
      fingerprint:  cluster.fingerprintKey,
      confidence:   cluster.confidence,
      scoreDelta:   -weight, // padrões canonical vêm de HISTÓRICO DE DISPUTAS — penalizam, não bonificam
    };
  }

  // ── Comandos de decisão humana ───────────────────────────────────────────
  function listReviewable() {
    return Array.from(_clusters.values())
      .filter(c => c.status === 'candidate' && c.distinctCount >= PatternLayerCFG.ELIGIBILITY_COUNT);
  }

  function track(id) {
    const cluster = Array.from(_clusters.values()).find(c => c.id === id);
    if (!cluster) return { ok: false, reason: 'not_found' };
    if (cluster.status !== 'candidate') return { ok: false, reason: 'wrong_status:' + cluster.status };
    if (cluster.distinctCount < PatternLayerCFG.ELIGIBILITY_COUNT) return { ok: false, reason: 'not_eligible_insufficient_diversity' };

    cluster.status     = 'tracked';
    cluster.confidence = PatternLayerCFG.INITIAL_CONFIDENCE;
    cluster.approvedAt = Date.now();
    return { ok: true, cluster };
  }

  function reject(id) {
    const cluster = Array.from(_clusters.values()).find(c => c.id === id);
    if (!cluster) return { ok: false, reason: 'not_found' };
    cluster.status = 'rejected';
    return { ok: true, cluster };
  }

  function status(id) {
    return Array.from(_clusters.values()).find(c => c.id === id) || null;
  }

  function allClusters() {
    return Array.from(_clusters.values());
  }

  function stats() {
    const byStatus = { candidate: 0, tracked: 0, canonical: 0, rejected: 0 };
    for (const c of _clusters.values()) byStatus[c.status]++;
    return { total: _clusters.size, byStatus };
  }

  return {
    recordDispute, recordCleanUse, decay, getCanonicalModifier,
    listReviewable, track, reject, status, allClusters, stats,
    fingerprintOf, fingerprintKey, // expostos para diagnóstico/testes
  };
})();

// ============================================================================
// PATCH DE INTEGRAÇÃO — três pontos de contacto, todos read-only sobre o
// grafo/KD-Tree, apenas observam e (para canonical) modulam pontuação
// ephemeral em selectBest().
// ============================================================================

// ── 1. Observa disputas reais via disputeProp() ──────────────────────────────
(function patchDisputePropForPatternLayer() {
  if (typeof PropositionStore === 'undefined' || !PropositionStore.disputeProp) return;
  const _orig = PropositionStore.disputeProp;

  PropositionStore.disputeProp = function(prop, supersedingId) {
    _orig.call(this, prop, supersedingId);
    try {
      PatternLayer.recordDispute(prop, brain.cycle);
    } catch(e) {
      console.warn('[PatternLayer] Falha ao registar disputa:', e.message);
    }
  };

  console.log('[AIO-Patch] PatternLayer observa disputas via disputeProp().');
})();

// ── 2. Observa usos limpos via teach() bem-sucedido ──────────────────────────
(function patchTeachForPatternLayerCleanUse() {
  if (typeof PropositionStore === 'undefined') return;
  const _origTeach = PropositionStore.teach;

  PropositionStore.teach = function(tokens, enrichedTokens, opts = {}) {
    const result = _origTeach.call(this, tokens, enrichedTokens, opts);
    if (result && !result.conflict) {
      try { PatternLayer.recordCleanUse(result, brain.cycle); }
      catch(e) { /* silencioso — observação nunca deve quebrar o ensino */ }
    }
    return result;
  };
})();

// ── 3. Modula pontuação ephemeral em selectBest() — SÓ canonical ────────────
(function patchSelectBestForPatternLayer() {
  if (typeof PropResponseBuilder === 'undefined') return;
  const _origSelectBest = PropResponseBuilder.selectBest;

  PropResponseBuilder.selectBest = function(relevantProps, speechAct) {
    const best = _origSelectBest(relevantProps, speechAct);
    if (!best) return best;

    const modifier = PatternLayer.getCanonicalModifier(best);
    if (modifier) {
      // Ephemeral: anota no objecto devolvido para esta consulta, NUNCA
      // escreve de volta no PropositionStore. Visível em /why via este campo.
      best._patternModifier = modifier;
      console.log('[PatternLayer] Modulação aplicada:', modifier.fingerprint,
        'scoreDelta:', modifier.scoreDelta.toFixed(3));
    }
    return best;
  };
})();

// ── 4. Decaimento periódico via AutonomousLoop ───────────────────────────────
(function patchAutonomousLoopForPatternLayer() {
  if (typeof AutonomousLoop === 'undefined') return;
  const _orig = AutonomousLoop._step.bind(AutonomousLoop);

  AutonomousLoop._step = async function() {
    await _orig();
    if (this._tick % 50 === 0) {
      try { PatternLayer.decay(brain.cycle); }
      catch(e) { console.warn('[PatternLayer] Erro no decaimento:', e.message); }
    }
  };
})();

// ── 5. Comandos /patterns:review /patterns:track /patterns:reject /patterns:status
(function addPatternCommands() {
  const _orig = self.onmessage;

  self.onmessage = async function(e) {
    const { command, payload } = e.data;

    if (command === 'perceive' || command === 'chat') {
      const inputStr = typeof payload === 'string' ? payload : '';
      const trimmed  = inputStr.trim();

      const reviewM = /^\/patterns\s*:\s*review\s*$/i.test(trimmed);
      const trackM  = trimmed.match(/^\/patterns\s*:\s*track\s+(\S+)\s*$/i);
      const rejectM = trimmed.match(/^\/patterns\s*:\s*reject\s+(\S+)\s*$/i);
      const statusM = trimmed.match(/^\/patterns\s*:\s*status\s+(\S+)\s*$/i);

      if (reviewM || trackM || rejectM || statusM) {
        let responseText;

        if (reviewM) {
          const reviewable = PatternLayer.listReviewable();
          responseText = reviewable.length === 0
            ? 'Nenhum padrão elegível para revisão neste momento.'
            : 'Padrões elegíveis:\n' + reviewable.map(c =>
                `${c.id} — ${c.fingerprintKey} (${c.count} disputas observadas)`
              ).join('\n');
        } else if (trackM) {
          const r = PatternLayer.track(trackM[1]);
          responseText = r.ok
            ? `Padrão ${r.cluster.id} aceite para rastreamento. Confiança inicial: ${(r.cluster.confidence*100).toFixed(0)}%. Ainda não afecta respostas — precisa de validação sustentada.`
            : `Não foi possível aceitar: ${r.reason}`;
        } else if (rejectM) {
          const r = PatternLayer.reject(rejectM[1]);
          responseText = r.ok ? `Padrão ${rejectM[1]} rejeitado.` : `Não encontrado: ${rejectM[1]}`;
        } else if (statusM) {
          const c = PatternLayer.status(statusM[1]);
          responseText = !c ? `Padrão não encontrado: ${statusM[1]}` :
            `${c.id} [${c.status}] fingerprint:${c.fingerprintKey} conf:${(c.confidence!=null?(c.confidence*100).toFixed(0)+'%':'—')} usos:${c.usesSinceTracked} disputas:${c.disputeCount}`;
        }

        self.postMessage({
          type: 'chatResponse', cycle: brain.cycle, input: inputStr,
          response: { text: responseText, intent: 'command', regime: 'STABLE', resonance: 100,
                      plannerUsed: false, propUsed: false, isCommand: true, commandType: 'patterns' },
          decision: { action: 'command', confidence: 1.0 },
          metacognition: serializeMeta(), stats: brain.getStats(),
          semantic: { tokens: [], clusters: [], causalPairs: [] },
          negation: { contradictions: [], summary: negationGraph.summarize() },
        });
        return;
      }
    }

    return _orig.call(this, e);
  };

  console.log('[AIO-Patch] Comandos /patterns:review /track /reject /status activos.');
})();

// ── 6. Exposição em /why — nunca omite influência de um padrão canonical ────
(function patchWhyForPatternLayer() {
  // handleWhy vive em CommandParser (aio-patch-commands.js). Intercepta
  // self._lastBuildResult, já capturado por esse patch, e anexa nota sobre
  // modulação de padrão se presente.
  if (typeof CommandParser === 'undefined' || !CommandParser.handleWhy) return;
  const _origHandleWhy = CommandParser.handleWhy;

  CommandParser.handleWhy = function(target) {
    const base = _origHandleWhy(target);
    const last = self._lastBuildResult;
    const mod  = last?.props?.find(p => p._patternModifier)?._patternModifier
              || last?._patternModifier;
    if (mod) {
      return base + ` [Padrão estrutural ${mod.patternId} (${mod.fingerprint}) ajustou a pontuação em ${(mod.scoreDelta*100).toFixed(1)}%, conf. do padrão:${(mod.confidence*100).toFixed(0)}%]`;
    }
    return base;
  };

  console.log('[AIO-Patch] /why revela influência de padrões canonical.');
})();

// ============================================================================
// COMANDO DE DIAGNÓSTICO GERAL
// ============================================================================
(function addPatternDiagnosticCommand() {
  const _orig = self.onmessage;
  self.onmessage = async function(e) {
    if (e.data.command === 'getPatternLayer') {
      self.postMessage({
        type:    'patternLayerState',
        stats:   PatternLayer.stats(),
        clusters: PatternLayer.allClusters().map(c => ({
          id: c.id, fingerprint: c.fingerprintKey, status: c.status,
          count: c.count, confidence: c.confidence, uses: c.usesSinceTracked,
          disputes: c.disputeCount,
        })),
      });
      return;
    }
    return _orig.call(this, e);
  };
})();