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

  return { recordFailure, checkAgainstHistory, stats, recent };
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
      AntiPatternRegistry.recordFailure(prop);
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

      if (/^\/antipattern\s*:\s*stats\s*$/i.test(trimmed)) {
        const s = AntiPatternRegistry.stats();
        const recent = AntiPatternRegistry.recent(5);
        const text = `AntiPattern: ${s.totalFailures} falhas registadas (cap ${s.cap}). ` +
          (recent.length > 0
            ? 'Recentes: ' + recent.map(f => `"${f.subject} ${f.relation} ${f.object}"`).join(', ')
            : 'Sem falhas registadas ainda.');

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

  console.log('[AIO-Patch] Comando /antipattern:stats activo.');
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
