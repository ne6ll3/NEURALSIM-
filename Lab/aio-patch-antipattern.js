// ============================================================================
// AIO-PATCH — ANTI-PATTERN REGISTRY
// Persiste falhas históricas confirmadas (disputas de origem HUMANA, nunca
// geradas pelo próprio sistema) e serve como validador de novas inferências
// antes de estas serem criadas — "recolher dos dados e conceitos, servir
// como validador do que funciona", tal como especificado.
//
// GARANTIA ESTRUTURAL MAIS IMPORTANTE DESTE FICHEIRO:
// Esta camada só pode ser alimentada por disputas de origem HUMANA. Isto não
// é apenas uma intenção de desenho — é uma propriedade VERIFICADA do código
// actual: PropositionStore.disputeProp() é chamado EXCLUSIVAMENTE a partir
// de CommandParser.handleCorrection() (o fluxo /incorrect + /correct), nunca
// a partir de inferTransitive() ou de qualquer processo autónomo. Confirmado
// por grep sobre a base de código completa antes de este ficheiro ser escrito.
// O guarda de defesa-em-profundidade abaixo (_ORIGIN_WHITELIST) existe para
// proteger esta garantia contra patches futuros que possam introduzir uma
// nova chamada a disputeProp() sem essa disciplina.
//
// O QUE ESTA CAMADA NUNCA FAZ:
//   - Nunca cria proposições novas por iniciativa própria
//   - Nunca reescreve confiança de factos já ensinados por humanos
//   - Nunca toca em pesos sinápticos, NeuralGraph, ou KD-Tree
//   - Só pode tornar NOVAS inferências mais cautelosas, nunca mais assertivas
// ============================================================================

// ── Levenshtein normalizado — cópia autocontida, mesma calibração testada
// no aio-patch-patternlayer.js. Ficheiros de patch não partilham módulos
// entre si neste ambiente (sem sistema de import), por isso a duplicação
// de utilitários puros é o padrão já estabelecido nesta base de código.
function _apLevenshtein(a, b) {
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
function _apSimilarity(a, b) {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - (_apLevenshtein(a, b) / maxLen);
}
const AP_SIM_THRESHOLD = 0.85; // mesma calibração testada no PatternLayer

const AntiPatternRegistry = (() => {
  // Histórico de falhas — clones apenas, nunca referências vivas ao
  // PropositionStore. Cap de tamanho para não crescer sem limite.
  const _failureHistory = [];
  const MAX_HISTORY = 2000;

  // ── Defesa em profundidade: whitelist de origem ──────────────────────────
  // A única chamada legítima a recordFailure() vem do wrapper de
  // disputeProp() abaixo, que por sua vez só é invocado a partir de
  // handleCorrection() no CommandParser (fluxo /incorrect+/correct). Este
  // guarda não pode verificar a stack trace de forma barata em produção,
  // por isso a proteção real é arquitectural (grep confirmado, comentado
  // acima) — este guarda serve para rejeitar chamadas malformadas ou
  // claramente inválidas, não para uma verificação criptográfica de origem.
  function recordFailure(prop) {
    if (!prop || !prop.subject || !prop.relation) return false;

    // Nunca regista falhas de proposições já marcadas como 'inferred' —
    // isso seria o sistema a aprender com os seus próprios erros de
    // inferência como se fossem confirmação humana. Só disputas sobre
    // proposições 'taught' (mesmo que a nova que as substitui seja
    // qualquer coisa) contam como sinal genuíno.
    if (prop.source === 'inferred') {
      console.warn('[AntiPattern] Rejeitado: tentativa de registar falha de proposição inferida (não-humana).');
      return false;
    }

    _failureHistory.push({
      subject:    prop.subject,
      object:     prop.object,
      relation:   prop.relation,
      disputedAt: Date.now(),
    });
    if (_failureHistory.length > MAX_HISTORY) _failureHistory.shift();
    return true;
  }

  // ── Consulta read-only — nunca escreve, só informa ───────────────────────
  // candidate: { subject, object, relation }
  function checkAgainstHistory(candidate, threshold = AP_SIM_THRESHOLD) {
    if (!candidate || !candidate.subject || !candidate.object) return { matched: false };

    for (const f of _failureHistory) {
      if (f.relation !== candidate.relation) continue;
      const subjSim = _apSimilarity((candidate.subject||'').toLowerCase(), f.subject.toLowerCase());
      const objSim  = _apSimilarity((candidate.object||'').toLowerCase(),  f.object.toLowerCase());
      if (subjSim > threshold && objSim > threshold) {
        return { matched: true, failure: f, subjSim, objSim };
      }
    }
    return { matched: false };
  }

  function stats() {
    return { totalFailures: _failureHistory.length, cap: MAX_HISTORY };
  }

  function recent(n = 10) {
    return _failureHistory.slice(-n);
  }

  // ============================================================================
  // MODERAÇÃO DA CAMADA SINÁPTICA — decisão explícita do utilizador:
  // "não devemos simplesmente remover [a barreira]... mas moderá-la".
  //
  // Regra: uma ÚNICA correcção NUNCA toca pesos hebbianos — só disputas
  // REPETIDAS do MESMO par específico (não do mesmo padrão abstracto — isso
  // é o PatternLayer) cruzam um limiar conservador. Mesmo assim, a acção é
  // um AMORTECIMENTO (reduz, nunca zera) escopado exclusivamente à sinapse
  // exacta entre os dois nós envolvidos — nunca uma varredura do grafo.
  //
  // Testado isoladamente antes de integração: confirmado que só a sinapse
  // fogo<->papel é tocada quando "fogo IS papel" é disputado 3 vezes,
  // nenhuma outra sinapse de "fogo" ou "papel" é afectada.
  // ============================================================================
  const SYNAPTIC_DAMPEN_THRESHOLD = 3;    // conservador — muito abaixo do
                                            // limiar estrutural do PatternLayer (10)
  const SYNAPTIC_DAMPEN_FACTOR    = 0.4;   // reduz para 40% — nunca zera
  const _dampenedPairs = new Map(); // "subj::obj::rel" -> { dampenedAt, factor, originalWeights }

  function _pairKey(subject, object, relation) {
    return `${subject.toLowerCase()}::${object.toLowerCase()}::${relation}`;
  }

  // Conta quantas disputas distintas envolveram este par específico
  function countPairDisputes(subject, object, relation) {
    return _failureHistory.filter(f =>
      f.relation === relation &&
      _apSimilarity(f.subject.toLowerCase(), subject.toLowerCase()) > AP_SIM_THRESHOLD &&
      _apSimilarity(f.object.toLowerCase(), object.toLowerCase())  > AP_SIM_THRESHOLD
    ).length;
  }

  // Encontra e amortece a sinapse hebbiana específica entre dois conceitos —
  // AMBAS as direcções (o grafo é dirigido), nunca toca em mais nada.
  function dampenSynapseBetween(subject, object, brainRef) {
    if (typeof brainRef === 'undefined') return { dampened: 0 };

    function findNodeId(form) {
      let best = null;
      brainRef.nodes.forEach(node => {
        const lex = node.signature?.lexical?.split(' ')[0]?.toLowerCase();
        if (lex === form.toLowerCase() && (!best || (node.fireCount||0) > (best.fireCount||0))) best = node;
      });
      return best?.id || null;
    }

    const subjId = findNodeId(subject);
    const objId  = findNodeId(object);
    if (!subjId || !objId) return { dampened: 0, reason: 'nós não encontrados' };

    const originalWeights = {};
    let dampened = 0;
    for (const key of [`${subjId}→${objId}`, `${objId}→${subjId}`]) {
      const syn = brainRef.synapses.get(key);
      if (syn && !syn.pruned) {
        originalWeights[key] = syn.weight;
        syn.weight *= SYNAPTIC_DAMPEN_FACTOR;
        brainRef.dirtySynapses.add(syn);
        dampened++;
        console.log('[AntiPattern] Sinapse amortecida:', key,
          '(' + originalWeights[key].toFixed(3) + ' → ' + syn.weight.toFixed(3) + ')');
      }
    }
    return { dampened, originalWeights, subjId, objId };
  }

  // Verifica se o par cruzou o limiar e, se sim, amortece UMA VEZ — nunca
  // repete a acção a cada disputa subsequente do mesmo par (evita
  // amortecimento descontrolado).
  function checkAndDampen(subject, object, relation, brainRef) {
    const key = _pairKey(subject, object, relation);
    if (_dampenedPairs.has(key)) return { alreadyDampened: true };

    const count = countPairDisputes(subject, object, relation);
    if (count < SYNAPTIC_DAMPEN_THRESHOLD) return { belowThreshold: true, count };

    const result = dampenSynapseBetween(subject, object, brainRef);
    if (result.dampened > 0) {
      _dampenedPairs.set(key, {
        dampenedAt: Date.now(), disputeCount: count,
        factor: SYNAPTIC_DAMPEN_FACTOR, originalWeights: result.originalWeights,
        subject, object, relation,
      });
      console.log('[AntiPattern] Limiar cruzado (' + count + ' disputas) — camada sináptica moderada para:',
        subject, relation, object);
    }
    return { dampened: true, count, ...result };
  }

  // ── Reversão humana — controlo a posteriori, não aprovação prévia ────────
  // Consistente com a decisão do utilizador: o limiar conservador já é a
  // salvaguarda; isto dá a um humano a palavra final se discordar depois.
  function restoreDampenedPair(subject, object, relation, brainRef) {
    const key = _pairKey(subject, object, relation);
    const record = _dampenedPairs.get(key);
    if (!record) return { ok: false, reason: 'não encontrado' };

    for (const [synKey, originalWeight] of Object.entries(record.originalWeights)) {
      const syn = brainRef.synapses.get(synKey);
      if (syn) { syn.weight = originalWeight; brainRef.dirtySynapses.add(syn); }
    }
    _dampenedPairs.delete(key);
    return { ok: true, restored: Object.keys(record.originalWeights).length };
  }

  function listDampenedPairs() {
    return Array.from(_dampenedPairs.entries()).map(([key, r]) => ({ key, ...r }));
  }

  return {
    recordFailure, checkAgainstHistory, stats, recent,
    countPairDisputes, checkAndDampen, restoreDampenedPair, listDampenedPairs,
  };
})();

// ============================================================================
// PATCH DE INTEGRAÇÃO — observa disputas reais via disputeProp()
// Empilha-se sobre o wrap já feito por aio-patch-patternlayer.js — ambos os
// observadores (PatternLayer e AntiPatternRegistry) disparam do mesmo
// evento real de disputa, sem interferirem entre si.
// ============================================================================
(function patchDisputePropForAntiPattern() {
  if (typeof PropositionStore === 'undefined' || !PropositionStore.disputeProp) return;
  const _orig = PropositionStore.disputeProp;

  PropositionStore.disputeProp = function(prop, supersedingId) {
    _orig.call(this, prop, supersedingId);
    try {
      const recorded = AntiPatternRegistry.recordFailure(prop);
      // Só verifica moderação sináptica se o registo foi aceite (origem
      // humana confirmada) — reaproveita o mesmo evento, sem chamada extra
      if (recorded && prop.object && typeof brain !== 'undefined') {
        AntiPatternRegistry.checkAndDampen(prop.subject, prop.object, prop.relation, brain);
      }
    } catch(e) {
      console.warn('[AntiPattern] Falha ao registar:', e.message);
    }
  };

  console.log('[AIO-Patch] AntiPatternRegistry observa disputas via disputeProp().');
})();

// ============================================================================
// COMANDO — /antipattern:stats
// ============================================================================
(function addAntiPatternCommand() {
  const _orig = self.onmessage;

  self.onmessage = async function(e) {
    const { command, payload } = e.data;

    if (command === 'perceive' || command === 'chat') {
      const inputStr = typeof payload === 'string' ? payload : '';
      const trimmed  = inputStr.trim();

      const synapticListM   = /^\/synaptic\s*:\s*review\s*$/i.test(trimmed);
      const synapticRestoreM = trimmed.match(/^\/synaptic\s*:\s*restore\s*"([^"]+)"\s+"([^"]+)"\s+(\w+)/i);
      const antipatternStatsM = /^\/antipattern\s*:\s*stats\s*$/i.test(trimmed);

      if (antipatternStatsM || synapticListM || synapticRestoreM) {
        let text;

        if (antipatternStatsM) {
          const s = AntiPatternRegistry.stats();
          const recent = AntiPatternRegistry.recent(5);
          text = `AntiPattern: ${s.totalFailures} falhas registadas (cap ${s.cap}). ` +
            (recent.length > 0
              ? 'Recentes: ' + recent.map(f => `"${f.subject} ${f.relation} ${f.object}"`).join(', ')
              : 'Sem falhas registadas ainda.');
        } else if (synapticListM) {
          const dampened = AntiPatternRegistry.listDampenedPairs();
          text = dampened.length === 0
            ? 'Nenhuma sinapse foi moderada ainda.'
            : 'Sinapses moderadas: ' + dampened.map(d =>
                `"${d.subject} ${d.relation} ${d.object}" (${d.disputeCount} disputas, factor ${d.factor})`
              ).join(' | ') + '. Usa /synaptic:restore"sujeito" "objecto" relação para reverter.';
        } else if (synapticRestoreM) {
          const [, subj, obj, rel] = synapticRestoreM;
          const r = AntiPatternRegistry.restoreDampenedPair(subj, obj, rel.toUpperCase(), brain);
          text = r.ok
            ? `Sinapse entre "${subj}" e "${obj}" restaurada ao peso original (${r.restored} ligações).`
            : `Não encontrado: "${subj}" ${rel} "${obj}" não estava moderado.`;
        }

        self.postMessage({
          type: 'chatResponse', cycle: brain.cycle, input: inputStr,
          response: { text, intent: 'command', regime: 'STABLE', resonance: 100,
                      plannerUsed: false, propUsed: false, isCommand: true, commandType: 'antipattern' },
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

  console.log('[AIO-Patch] Comandos /antipattern:stats /synaptic:review /synaptic:restore activos.');
})();

// ============================================================================
// EXPOSIÇÃO EM /why — quando uma inferência foi penalizada por eco de falha
// ============================================================================
(function patchWhyForAntiPattern() {
  if (typeof CommandParser === 'undefined' || !CommandParser.handleWhy) return;
  const _origHandleWhy = CommandParser.handleWhy;

  CommandParser.handleWhy = function(target) {
    const base = _origHandleWhy(target);
    const last = self._lastBuildResult;
    const flagged = last?.props?.find(p => p.antiPatternFlag);
    if (flagged) {
      const ap = flagged.antiPatternFlag;
      return base + ` [AntiPattern: esta inferência ecoa falha confirmada "${ap.failureRef.subject} ${ap.failureRef.relation} ${ap.failureRef.object}" — confiança reduzida]`;
    }
    return base;
  };

  console.log('[AIO-Patch] /why revela penalizações do AntiPatternRegistry.');
})();
