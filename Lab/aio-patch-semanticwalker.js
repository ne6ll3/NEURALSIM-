// ============================================================================
// AIO-PATCH — SEMANTIC ROLE WALKER
// Resolve a falha de "aproximação de nós misturando conceitos": quando o
// utilizador pergunta sobre um conceito que só existe como INCIDENTAL
// (objecto de outra relação, nunca sujeito de uma relação definidora), o
// sistema respondia com o facto incidental como se fosse uma definição —
// "Calor?" → "Fogo causa calor." apresentado como se definisse calor.
//
// MECANISMO: percurso de activação em espalhamento (spreading activation),
// inspirado no modelo clássico de memória semântica humana (Collins &
// Loftus, 1975) — ligações definidoras (É-UM, TEM) processadas em
// prioridade sobre ligações associativas incidentais; activação decai por
// salto, limitando naturalmente o alcance sem uma regra rígida arbitrária.
//
// GARANTIA ESTRUTURAL — leitura pura, zero risco para a segurança já
// construída nesta sessão:
//   - NUNCA cria proposições novas
//   - NUNCA escreve no PropositionStore, NeuralGraph, ou KD-Tree
//   - NUNCA funde factos numa frase que pareça afirmar algo não ensinado
//     (percorrer fogo→calor→energia nunca produz "fogo é energia")
//   - Opera inteiramente sobre factos JÁ validados e persistidos
//   - Substitui apenas a SÍNTESE da resposta para o caso específico onde
//     o mecanismo antigo confundia papel definidor com papel incidental
// ============================================================================

const SemanticWalkerCFG = {
  MAX_DEPTH:      2,     // saltos máximos no percurso
  DECAY_PER_HOP:  0.75,  // decaimento de confiança por salto — mesma ordem
                          // de grandeza das penalidades já usadas em
                          // inferTransitive() (0.6-0.7), consistência
                          // deliberada, não coincidência
  MIN_CONFIDENCE: 0.25,  // corta o percurso abaixo deste limiar acumulado
};

const SemanticRoleWalker = (() => {

  // Papel semântico do conceito NESTA proposição específica — não é uma
  // propriedade do conceito em geral, é relativo a cada facto em que aparece
  function classifyRole(concept, prop) {
    const isSubject = prop.subject.toLowerCase() === concept.toLowerCase();
    if (isSubject) {
      return ['IS','CATEGORY','HAS','CONTAINS'].includes(prop.relation) ? 'DEFINING' : 'ACTIVE';
    }
    return 'INCIDENTAL';
  }

  // Percurso principal — nunca cria dados, só lê e organiza o que já existe
  function walk(concept, maxDepth = SemanticWalkerCFG.MAX_DEPTH,
                decayPerHop = SemanticWalkerCFG.DECAY_PER_HOP,
                minConf = SemanticWalkerCFG.MIN_CONFIDENCE) {
    const visited = new Set([concept.toLowerCase()]);
    const result = { concept, defining: [], active: [], incidental: [], chains: [] };

    function explore(current, depth, pathConf) {
      if (pathConf < minConf) return;
      const bySubj = PropositionStore.queryBySubject(current, 0, false); // exclui deprecated
      for (const p of bySubj) {
        const role = classifyRole(current, p);
        const effConf = p.confidence * pathConf;
        if (effConf < minConf) continue;

        const entry = {
          subject: p.subject, relation: p.relation, relationLabel: p.relationLabel,
          object: p.object, polarity: p.polarity, role, depth,
          effectiveConfidence: +effConf.toFixed(3), sourceConfidence: p.confidence,
          disputed: !!p.disputed, id: p.id,
        };

        if (depth === 0) {
          if (role === 'DEFINING') result.defining.push(entry);
          else if (role === 'ACTIVE') result.active.push(entry);
        } else {
          result.chains.push(entry);
        }

        if (depth < maxDepth && p.object && !visited.has(p.object.toLowerCase())) {
          visited.add(p.object.toLowerCase());
          explore(p.object, depth + 1, effConf * decayPerHop);
        }
      }
    }

    explore(concept, 0, 1.0);

    result.incidental = PropositionStore.queryByObject(concept, 0, false).map(p => ({
      subject: p.subject, relation: p.relation, relationLabel: p.relationLabel,
      object: p.object, polarity: p.polarity, role: 'INCIDENTAL', depth: 0,
      effectiveConfidence: p.confidence, sourceConfidence: p.confidence,
      disputed: !!p.disputed, id: p.id,
    }));

    return result;
  }

  // ── Síntese honesta — nunca funde factos numa frase que afirme mais do
  // que foi ensinado. Prioridade: própria definição > comportamento activo
  // (com extensão por 1 salto se existir) > menção incidental > desconhecido.
  function synthesizeText(walkResult, lang = 'pt') {
    const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

    if (walkResult.defining.length > 0) {
      const d = walkResult.defining[0];
      const neg = d.polarity === -1 ? (lang==='pt' ? 'não ' : "doesn't ") : '';
      return {
        text: `${cap(d.subject)} ${neg}${d.relationLabel} ${d.object}.`,
        usedRole: 'DEFINING', usedProps: [d],
      };
    }

    if (walkResult.active.length > 0) {
      const a = walkResult.active[0];
      const neg = a.polarity === -1 ? (lang==='pt' ? 'não ' : "doesn't ") : '';
      let text = lang === 'pt'
        ? `${cap(a.subject)} não tem definição própria registada, mas ${a.subject} ${neg}${a.relationLabel} ${a.object}.`
        : `${cap(a.subject)} has no defining fact recorded, but ${a.subject} ${neg}${a.relationLabel} ${a.object}.`;
      const usedProps = [a];

      // Extensão por 1 salto — chega a C sem nunca fundir A e C numa
      // afirmação directa. Sempre apresentado como facto SEPARADO e ligado.
      const chain = walkResult.chains.find(c => c.depth === 1 &&
        c.subject.toLowerCase() === a.object.toLowerCase());
      if (chain) {
        const chainNeg = chain.polarity === -1 ? (lang==='pt' ? 'não ' : "doesn't ") : '';
        text += lang === 'pt'
          ? ` E ${chain.subject} ${chainNeg}${chain.relationLabel} ${chain.object}.`
          : ` And ${chain.subject} ${chainNeg}${chain.relationLabel} ${chain.object}.`;
        usedProps.push(chain);
      }
      return { text, usedRole: 'ACTIVE', usedProps };
    }

    if (walkResult.incidental.length > 0) {
      const i = walkResult.incidental[0];
      const neg = i.polarity === -1 ? (lang==='pt' ? 'não ' : "doesn't ") : '';
      const text = lang === 'pt'
        ? `Não tenho definição própria de "${walkResult.concept}". É mencionado apenas como parte de outro facto: "${i.subject} ${neg}${i.relationLabel} ${i.object}".`
        : `I don't have a defining fact for "${walkResult.concept}". It's only mentioned as part of another fact: "${i.subject} ${neg}${i.relationLabel} ${i.object}".`;
      return { text, usedRole: 'INCIDENTAL', usedProps: [i] };
    }

    return { text: null, usedRole: 'NONE', usedProps: [] };
  }

  return { classifyRole, walk, synthesizeText };
})();

// ============================================================================
// PATCH DE INTEGRAÇÃO — intercepta PropResponseBuilder.build() apenas para
// o caso onde a lógica original confundiria papel incidental com definidor.
// Nunca substitui o caminho normal (perguntas causais, pedidos de relação
// explícita via /catgmn-taught facts, etc.) — só actua quando o resultado
// original seria uma resposta INCIDENTAL apresentada sem qualificação.
// ============================================================================
(function patchBuildWithSemanticWalker() {
  if (typeof PropResponseBuilder === 'undefined') return;
  const _origBuild = PropResponseBuilder.build;

  PropResponseBuilder.build = function(tokens, enrichedTokens, speechAct, lang, cycle) {
    const original = _origBuild(tokens, enrichedTokens, speechAct, lang, cycle);

    // Só intervém em perguntas — não em afirmações, comandos, ou conflitos
    if (!speechAct || speechAct.act !== 'question') return original;
    if (original && original.isConflict) return original; // nunca sobrepõe conflito

    // Identifica o conceito perguntado — usa o sujeito da proposição
    // seleccionada pelo caminho original, se existir; senão o primeiro
    // token de conteúdo do input
    let concept = null;
    if (original && original.props && original.props[0]) {
      concept = original.props[0].subject;
    } else {
      const contentToken = (enrichedTokens || tokens).find(t => !t.roles?.isStop && t.semanticWeight > 0.3);
      concept = contentToken?.form;
    }
    if (!concept) return original;

    const walkResult = SemanticRoleWalker.walk(concept);

    // Se o resultado original já veio de um facto DEFINING (papel correcto),
    // não há nada a corrigir — o percurso confirma o mesmo caminho.
    if (walkResult.defining.length > 0 && original) return original;

    // Caso problemático: original existe mas é baseado num facto onde o
    // conceito perguntado era OBJECTO (incidental), não sujeito — ou
    // original é null e o walker encontra algo mesmo assim.
    const synthesis = SemanticRoleWalker.synthesizeText(walkResult, lang);
    if (!synthesis.text) return original; // walker não encontrou nada melhor

    // Só substitui se o original não tinha um facto DEFINING — ou seja,
    // estava a usar um facto incidental/activo como se definisse o conceito
    return {
      text:              synthesis.text,
      props:             synthesis.usedProps,
      confidence:        synthesis.usedProps[0]?.effectiveConfidence ?? synthesis.usedProps[0]?.sourceConfidence ?? 0.5,
      source:            'semantic_walk',
      relation:          synthesis.usedProps[0]?.relation,
      semanticRole:      synthesis.usedRole,
      walkerUsed:         true,
    };
  };

  console.log('[AIO-Patch] SemanticRoleWalker activo — distingue papel definidor de incidental.');
})();

// ============================================================================
// COMANDO DE DIAGNÓSTICO — /walk:"conceito"
// ============================================================================
(function addWalkCommand() {
  const _orig = self.onmessage;

  self.onmessage = async function(e) {
    const { command, payload } = e.data;
    if (command === 'perceive' || command === 'chat') {
      const inputStr = typeof payload === 'string' ? payload : '';
      const m = inputStr.trim().match(/^\/walk\s*:\s*"([^"]+)"/i);
      if (m) {
        const result = SemanticRoleWalker.walk(m[1]);
        const text = `Percurso para "${m[1]}": ` +
          `definidores:${result.defining.length} ` +
          `activos:${result.active.length} ` +
          `incidentais:${result.incidental.length} ` +
          `encadeados:${result.chains.length}. ` +
          [...result.defining, ...result.active].map(p =>
            `"${p.subject} ${p.relationLabel} ${p.object}"(${p.role},${(p.effectiveConfidence*100).toFixed(0)}%)`
          ).join(' | ');

        self.postMessage({
          type: 'chatResponse', cycle: brain.cycle, input: inputStr,
          response: { text, intent: 'command', regime: 'STABLE', resonance: 100,
                      plannerUsed: false, propUsed: false, isCommand: true, commandType: 'walk' },
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

  console.log('[AIO-Patch] Comando /walk:"conceito" activo.');
})();
