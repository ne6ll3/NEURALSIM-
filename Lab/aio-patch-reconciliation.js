// ============================================================================
// AIO-PATCH — RECONCILIATION LAYER
// Torna VISÍVEL a divergência entre os dois sistemas de memória do
// NeuralSim, que hoje operam em paralelo e largamente desligados:
//
//   (a) Grafo hebbiano (NeuralGraph.synapses) — geométrico, reforçado por
//       co-ocorrência textual, decai naturalmente, poda por grau.
//   (b) PropositionStore — factual, tipado, verificado, auditável.
//
// PRINCÍPIO DE DESENHO — puramente diagnóstico, nunca reconciliador de
// facto: esta camada NUNCA resolve a divergência a favor de um sistema
// nem escreve em nenhum dos dois. Só reporta. A decisão sobre o que fazer
// com uma divergência (ensinar formalmente uma associação geométrica forte,
// ou ignorá-la) continua a ser humana, via os comandos já existentes
// (/mean, /catgmn, /oppose).
//
// Isto NÃO é o "Anti-Pattern" discutido para a adaptação AUN — esse
// continua por implementar, com risco maior (toca correcção→estrutura) e
// requer a mesma disciplina de análise-antes-de-implementar.
// ============================================================================

const ReconciliationLayer = (() => {

  // Extrai os N vizinhos hebbianos mais fortes de um nó, a partir das
  // sinapses reais do grafo (não da KD-Tree, não do PropositionStore).
  function topHebbianNeighbors(nodeId, brainRef, topN = 5) {
    const neighbors = [];
    brainRef.synapses.forEach((syn, key) => {
      if (syn.pruned) return;
      if (syn.source === nodeId) {
        const targetNode = brainRef.nodes.get(syn.target);
        if (targetNode?.signature?.lexical) {
          neighbors.push({
            form:   targetNode.signature.lexical.split(' ')[0],
            weight: syn.weight,
            nodeId: syn.target,
          });
        }
      }
    });
    return neighbors.sort((a, b) => b.weight - a.weight).slice(0, topN);
  }

  // Encontra o(s) nó(s) do grafo geométrico cuja forma lexical corresponde
  // ao conceito pedido — pode haver mais que um por causa de merges/duplicação
  // histórica; usa o de maior fireCount como representativo.
  function findNodeByForm(form, brainRef) {
    let best = null;
    brainRef.nodes.forEach(node => {
      const lex = node.signature?.lexical?.split(' ')[0]?.toLowerCase();
      if (lex === form.toLowerCase()) {
        if (!best || (node.fireCount || 0) > (best.fireCount || 0)) best = node;
      }
    });
    return best;
  }

  // ── Núcleo: compara vizinhança hebbiana vs relações factuais ────────────
  // Devolve um relatório com três conjuntos: só-geométrico, só-factual,
  // concordância — e um score de divergência [0,1].
  function checkDivergence(conceptForm, topN = 5) {
    if (typeof brain === 'undefined' || typeof PropositionStore === 'undefined') {
      return { ok: false, reason: 'dependências indisponíveis' };
    }

    const node = findNodeByForm(conceptForm, brain);
    const hebbian = node ? topHebbianNeighbors(node.id, brain, topN) : [];

    const bySubj = PropositionStore.queryBySubject(conceptForm, 0, true);
    const byObj  = PropositionStore.queryByObject(conceptForm, 0, true);
    const propositions = [...bySubj, ...byObj].map(p => ({
      relation:   p.relation,
      object:     p.subject.toLowerCase() === conceptForm.toLowerCase() ? p.object : p.subject,
      confidence: p.confidence,
      source:     p.source,
      disputed:   !!p.disputed,
    })).filter(p => p.object);

    const propObjects  = new Set(propositions.map(p => p.object.toLowerCase()));
    const hebbianForms  = new Set(hebbian.map(h => h.form.toLowerCase()));

    const hebbianOnly     = hebbian.filter(h => !propObjects.has(h.form.toLowerCase()));
    const propositionOnly = propositions.filter(p => !hebbianForms.has(p.object.toLowerCase()));
    const agreement       = hebbian.filter(h => propObjects.has(h.form.toLowerCase()));

    const divergenceScore = hebbian.length > 0
      ? +(hebbianOnly.length / hebbian.length).toFixed(3)
      : (propositions.length > 0 ? 1.0 : 0);

    return {
      ok: true,
      concept:  conceptForm,
      hasNode:  !!node,
      hebbianOnly, propositionOnly, agreement,
      divergenceScore,
      nodeFireCount: node?.fireCount || 0,
    };
  }

  return { checkDivergence, topHebbianNeighbors, findNodeByForm };
})();

// ============================================================================
// COMANDO — /reconcile:"conceito"
// Diagnóstico sob demanda, coerente com o resto da linguagem de comandos.
// ============================================================================
(function addReconcileCommand() {
  const _orig = self.onmessage;

  self.onmessage = async function(e) {
    const { command, payload } = e.data;

    if (command === 'perceive' || command === 'chat') {
      const inputStr = typeof payload === 'string' ? payload : '';
      const m = inputStr.trim().match(/^\/reconcile\s*:\s*"([^"]+)"/i);

      if (m) {
        const report = ReconciliationLayer.checkDivergence(m[1]);
        let text;

        if (!report.ok) {
          text = 'Não consegui verificar: ' + report.reason;
        } else if (!report.hasNode && report.propositionOnly.length === 0) {
          text = `Sem dados suficientes sobre "${report.concept}" em nenhum dos dois sistemas.`;
        } else {
          const parts = [`Divergência para "${report.concept}": ${(report.divergenceScore*100).toFixed(0)}%.`];
          if (report.agreement.length > 0) {
            parts.push('Concordância: ' + report.agreement.map(a => a.form + '(' + a.weight.toFixed(2) + ')').join(', ') + '.');
          }
          if (report.hebbianOnly.length > 0) {
            parts.push('Só geométrico (sem facto ensinado): ' + report.hebbianOnly.map(h => h.form + '(' + h.weight.toFixed(2) + ')').join(', ') + '.');
          }
          if (report.propositionOnly.length > 0) {
            parts.push('Só factual (sem reforço de co-ocorrência): ' + report.propositionOnly.map(p => p.object + '[' + p.relation + ']').join(', ') + '.');
          }
          text = parts.join(' ');
        }

        self.postMessage({
          type: 'chatResponse', cycle: brain.cycle, input: inputStr,
          response: { text, intent: 'command', regime: 'STABLE', resonance: 100,
                      plannerUsed: false, propUsed: false, isCommand: true, commandType: 'reconcile' },
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

  console.log('[AIO-Patch] Comando /reconcile:"conceito" activo.');
})();

// ============================================================================
// EXPOSIÇÃO EM /why — anexa divergência quando /why é usado sobre um conceito
// ============================================================================
(function patchWhyForReconciliation() {
  if (typeof CommandParser === 'undefined' || !CommandParser.handleWhy) return;
  const _origHandleWhy = CommandParser.handleWhy;

  CommandParser.handleWhy = function(target) {
    const base = _origHandleWhy(target);
    if (!target || target.toLowerCase().includes('última resposta') || target.toLowerCase().includes('ultima resposta')) {
      return base; // /why sem alvo específico não faz sentido reconciliar
    }
    try {
      const report = ReconciliationLayer.checkDivergence(target);
      if (report.ok && report.divergenceScore > 0.4) {
        return base + ` [Divergência geométrico/factual: ${(report.divergenceScore*100).toFixed(0)}% — usa /reconcile:"${target}" para detalhe]`;
      }
    } catch(e) { /* silencioso — não deve quebrar /why normal */ }
    return base;
  };

  console.log('[AIO-Patch] /why alerta sobre divergência significativa (>40%).');
})();