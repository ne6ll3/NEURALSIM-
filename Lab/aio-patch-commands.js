// ============================================================================
// AIO-PATCH — COMMAND PARSER v2
// Comandos explícitos de controlo e correcção sobre o agente.
// Aplica-se SEMPRE em último lugar — intercepta input antes de qualquer
// outro patch processar (teach, synthesize, etc).
//
// v2: correcção via NegationGraph com peso real (não retracção silenciosa),
//     /mean com strength= configurável, /forget como deprecação gradual
//     decidida pelo Dream Cycle, /why aceita argumento.
//
// COMANDOS:
//
//  /incorrect:"texto errado"
//  /correct:"texto correcto"
//      Não apaga a crença antiga. Disputa-a estruturalmente via NegationGraph
//      com peso real, marca-a como 'disputed' (confiança reduzida, visível
//      para auditoria), e ensina a nova com prioridade.
//
//  //stop learn  /  //start learn
//      Pausa/retoma o ensino de proposições.
//
//  /mean:"token A" <relação> "token B" strength=0.9
//      Força uma conexão com peso explícito. strength é opcional, default 1.0.
//      <relação> = is|causes|has|enables|requires|opposes|part_of
//
//  /oppose:"token A" "token B"
//      Atalho para /mean com OPPOSES.
//
//  /forget:"token A" "token B"?
//      NÃO apaga imediatamente. Marca state='deprecated'. O Dream Cycle
//      decide, na próxima consolidação, se a remove de facto — só se não
//      tiver sido reforçada nesse intervalo.
//
//  /why
//  /why:"última resposta"
//  /why:"conceito"
//      Sem argumento ou com "última resposta": explica a última resposta.
//      Com um conceito: explica o que o agente sabe sobre esse conceito —
//      proposições, confiança, se está disputado ou deprecated.
//
//  //pause / //resume
//      Pausa/retoma o AutonomousLoop por completo.
// ============================================================================

const CommandParser = (() => {

  const RELATION_TRIGGER = {
    is:       'é',        'é':       'é',
    causes:   'causa',    causa:     'causa',
    has:      'tem',      tem:       'tem',
    enables:  'permite',  permite:   'permite',
    requires: 'requer',   requer:    'requer',
    opposes:  'opõe',     opõe:      'opõe', 'opoe': 'opõe',
    part_of:  'pertence', pertence:  'pertence',
    contains: 'contém',   contém:    'contém', 'contem': 'contém',
    similar:  'parece',   parece:    'parece',
  };

  // Mapa directo relation= → código de RelationTypes, usado pelo /catgmn
  const CATGMN_RELATION_MAP = {
    category: 'CATEGORY',
    contains: 'CONTAINS',
    causes:   'CAUSES',
    similar:  'SIMILAR',
  };

  function parse(inputStr) {
    const trimmed = (inputStr || '').trim();
    const lower   = trimmed.toLowerCase();

    if (!trimmed.startsWith('/')) return null;

    if (lower.startsWith('//') && lower.includes('stop') && lower.includes('lear'))
      return { cmd: 'stopLearn' };
    if (lower.startsWith('//') && (lower.includes('start') || lower.includes('resume'))
        && lower.includes('lear'))
      return { cmd: 'startLearn' };

    if (lower === '//pause')  return { cmd: 'pauseLoop' };
    if (lower === '//resume') return { cmd: 'resumeLoop' };

    // /why com ou sem argumento
    const whyM = trimmed.match(/^\/why\s*(?::\s*"([^"]+)")?\s*$/i);
    if (whyM) return { cmd: 'why', target: whyM[1] || null };

    const incM = trimmed.match(/\/incorrect\s*:\s*"([^"]+)"/i);
    const corM = trimmed.match(/\/correct\s*:\s*"([^"]+)"/i);
    if (incM || corM)
      return { cmd: 'correction', incorrect: incM?.[1] || null, correct: corM?.[1] || null };

    // /mean com strength= opcional
    const meanM = trimmed.match(/\/mean\s*:\s*"([^"]+)"\s+(\S+)\s+"([^"]+)"(?:\s+strength\s*=\s*([\d.]+))?/i);
    if (meanM) return {
      cmd: 'mean', a: meanM[1], rel: meanM[2].toLowerCase(), b: meanM[3],
      strength: meanM[4] ? Math.max(0, Math.min(1, parseFloat(meanM[4]))) : 1.0,
    };

    const oppM = trimmed.match(/\/oppose\s*:\s*"([^"]+)"\s+"([^"]+)"/i);
    if (oppM) return { cmd: 'oppose', a: oppM[1], b: oppM[2] };

    const forgM = trimmed.match(/\/forget\s*:\s*"([^"]+)"(?:\s+"([^"]+)")?/i);
    if (forgM) return { cmd: 'forget', a: forgM[1], b: forgM[2] || null };

    // /name:"palavra" — ensina que uma forma é nome próprio, não substantivo comum.
    // Resolve o bug de PROPER_RE demasiado restritivo: se um nome real não
    // estiver na lista curada nativa, ensina-o aqui em vez de esperar por
    // uma actualização do código.
    const nameM = trimmed.match(/\/name\s*:\s*"([^"]+)"/i);
    if (nameM) return { cmd: 'name', word: nameM[1] };

    // /catgmn:"A" relation=category|contains|causes|similar "B" strength=0.8
    const catM = trimmed.match(/\/catgmn\s*:\s*"([^"]+)"\s+relation\s*=\s*(\w+)\s+"([^"]+)"(?:\s+strength\s*=\s*([\d.]+))?/i);
    if (catM) {
      const relWord = catM[2].toLowerCase();
      if (!CATGMN_RELATION_MAP[relWord]) {
        return { cmd: 'catgmn_invalid', relWord, valid: Object.keys(CATGMN_RELATION_MAP) };
      }
      return {
        cmd: 'catgmn', a: catM[1], relationCode: CATGMN_RELATION_MAP[relWord], b: catM[3],
        strength: catM[4] ? Math.max(0, Math.min(1, parseFloat(catM[4]))) : 0.8,
      };
    }

    return { cmd: 'unknown', raw: trimmed };
  }

  function buildFakeTokens(a, relWord, b) {
    const mk = (form, morphClass, extraRoles = {}) => {
      const roles = { isStop: false, isNeg: false, isCausal: false, ...extraRoles };
      return {
        form: form.toLowerCase(),
        roles,
        semanticWeight: 0.85,
        psi: anchorPsi({ form: form.toLowerCase(), roles, semanticWeight: 0.85 }),
      };
    };
    const trigger = RELATION_TRIGGER[relWord] || 'é';
    return [
      mk(a, 'SUBSTANTIVO'),
      mk(trigger, 'VERBO_PRESENTE', { isCausal: trigger === 'causa' }),
      mk(b, 'SUBSTANTIVO'),
    ];
  }

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleStopLearn() {
    self._learningPaused = true;
    return 'Aprendizagem pausada. Continuo a responder, mas não vou guardar novas proposições até //start learn.';
  }

  function handleStartLearn() {
    self._learningPaused = false;
    return 'Aprendizagem retomada.';
  }

  function handlePauseLoop() {
    if (typeof AutonomousLoop !== 'undefined') AutonomousLoop.stop();
    return 'Loop autónomo pausado.';
  }

  function handleResumeLoop() {
    if (typeof AutonomousLoop !== 'undefined') AutonomousLoop.start();
    return 'Loop autónomo retomado.';
  }

  // ── Correcção via NegationGraph — substitui a retracção silenciosa ─────────
  // A crença antiga não é apagada. É disputada estruturalmente: ambas as
  // proposições (antiga e nova) entram no NegationGraph, que já tem o
  // mecanismo de tensão ponderada. A antiga fica 'disputed' com confiança
  // reduzida, visível para /why — não "flutuante", mas pesada e rastreável.
  function handleCorrection(parsed) {
    if (!parsed.incorrect && self._pendingIncorrect) parsed.incorrect = self._pendingIncorrect;
    if (!parsed.correct && self._pendingCorrect)     parsed.correct   = self._pendingCorrect;

    if (parsed.incorrect && !parsed.correct) {
      self._pendingIncorrect = parsed.incorrect;
      return `Registado como errado: "${parsed.incorrect}". Aguardo /correct:"...".`;
    }
    if (parsed.correct && !parsed.incorrect) {
      self._pendingCorrect = parsed.correct;
      return `Registado como correcto: "${parsed.correct}". Se houver versão errada, envia /incorrect:"...".`;
    }

    const incTokens = SemanticTokenizer.extract(parsed.incorrect);
    const corTokens = SemanticTokenizer.extract(parsed.correct);

    // Ingere AMBAS as frases no NegationGraph — ganham peso estrutural real
    // através do mecanismo de tensão já existente (polaridade + co-ocorrência)
    negationGraph.ingest(incTokens);
    negationGraph.ingest(corTokens);

    // Localiza a proposição existente mais relevante ao texto errado
    // (busca real via queryRelevant, não heurística de primeiro/último token)
    const relevant   = PropositionStore.queryRelevant(incTokens, 3);
    const oldProp    = relevant.find(p => p.source === 'taught' || p.source === 'inferred');

    // Ensina a proposição correcta com prioridade de correcção
    const corEnriched = typeof CompositionalWeight !== 'undefined'
      ? CompositionalWeight.compute(corTokens).tokens
      : corTokens;

    let taught = PropositionStore.teach(corTokens, corEnriched, {
      confidence:  1.0,
      cycle:       brain.cycle,
      supersedes:  oldProp ? oldProp.id : null,
    });

    // Se a nova entrou em conflito directo com a antiga (mesma SPO, polaridade
    // oposta), o teach() já devolveu {conflict:true}. Nesse caso, disputamos
    // explicitamente a antiga em vez de bloquear a correcção.
    if (taught && taught.conflict) {
      PropositionStore.disputeProp(taught.existingProp, null);
      // Re-tenta ensinar removendo o bloqueio: a correcção tem prioridade
      // sobre o conflito automático porque é uma instrução humana explícita
      const ids = PropositionStore.queryBySubject(taught.subject, 0, true);
      const stillBlocking = ids.find(p => p.object?.toLowerCase() === taught.object?.toLowerCase()
        && !p.disputed);
      if (stillBlocking) PropositionStore.disputeProp(stillBlocking, null);

      taught = PropositionStore.teach(corTokens, corEnriched, {
        confidence: 1.0, cycle: brain.cycle, supersedes: oldProp ? oldProp.id : null,
      });
    }

    // Disputa explicitamente a proposição antiga encontrada por relevância
    if (oldProp && taught && !taught.conflict) {
      PropositionStore.disputeProp(oldProp, taught.id);
    }

    // Impacto real no SelfModel e Metacognition — uma correcção É um evento
    // epistémico, não deve ser invisível ao estado interno do agente
    Metacognition.update({ frustration: 0.06, confidence: -0.03 });
    SelfModel.update({
      action:  'corrected_by_user',
      from:    parsed.incorrect,
      to:      parsed.correct,
    });
    SelfModel.updateCompetency('contradiction_detection', 0.01);

    self._pendingIncorrect = null;
    self._pendingCorrect   = null;

    const disputedNote = oldProp
      ? ` A crença anterior ("${oldProp.subject} ${oldProp.relationLabel} ${oldProp.object}") fica disputada (conf: ${Math.round(oldProp.confidence*100)}%), não apagada.`
      : '';
    return `Corrigido: "${parsed.correct}".${disputedNote}`;
  }

  // ── /mean com peso explícito ──────────────────────────────────────────────
  function handleMean(parsed) {
    const tokens = buildFakeTokens(parsed.a, parsed.rel, parsed.b);
    const prop   = PropositionStore.teach(tokens, tokens, {
      confidence: parsed.strength,
      cycle:      brain.cycle,
    });

    if (prop && prop.conflict) {
      return `Conexão "${parsed.a}" ${parsed.rel} "${parsed.b}" (força ${parsed.strength}) conflitua com crença existente (conf ${Math.round(prop.existingProp.confidence*100)}%). Antiga marcada como disputada.`;
    }
    if (prop) {
      return `Conexão estabelecida: "${parsed.a}" ${prop.relationLabel} "${parsed.b}" — força ${Math.round(parsed.strength*100)}%.`;
    }
    return `Não consegui estabelecer a conexão entre "${parsed.a}" e "${parsed.b}".`;
  }

  function handleOppose(parsed) {
    const tokens = buildFakeTokens(parsed.a, 'opposes', parsed.b);
    const prop   = PropositionStore.teach(tokens, tokens, { confidence: 1.0, cycle: brain.cycle });
    if (prop && !prop.conflict) {
      return `Oposição registada: "${parsed.a}" opõe-se a "${parsed.b}".`;
    }
    return `Oposição entre "${parsed.a}" e "${parsed.b}" já existia ou houve conflito.`;
  }

  // ── /catgmn: relação tipada explícita com peso configurável ─────────────────
  // Distingue CATEGORY (pertença assimétrica, "X é-um-tipo-de Y") de
  // IS (equivalência simétrica), CONTAINS (composição transitiva) e
  // SIMILAR (analogia que nunca se encadeia). Resolve directamente o
  // problema de poluição que identificaste: "fogo é fenómeno" a 100%
  // via /mean fazia o sistema tratar fogo e fenómeno como equivalentes
  // totais. CATEGORY mantém a assimetria — fogo PERTENCE à classe
  // fenómeno, sem implicar que fenómeno SEJA fogo.
  function handleCatgmn(parsed) {
    // Usa 'is' apenas como andaime gramatical para a extracção SPO —
    // a relação real é forçada via forceRelation, ignorando detectRelationType
    const tokens = buildFakeTokens(parsed.a, 'is', parsed.b);
    const prop   = PropositionStore.teach(tokens, tokens, {
      confidence:    parsed.strength,
      cycle:         brain.cycle,
      forceRelation: parsed.relationCode,
    });

    if (prop && prop.conflict) {
      return `"${parsed.a}" ${parsed.relationCode} "${parsed.b}" (força ${parsed.strength}) conflitua com crença existente (conf ${Math.round(prop.existingProp.confidence*100)}%). Antiga marcada como disputada.`;
    }
    if (prop && prop.relationLabel) {
      return `Relação tipada estabelecida: "${parsed.a}" ${prop.relationLabel} "${parsed.b}" — força ${Math.round(parsed.strength*100)}%. (${parsed.relationCode}, não simétrica salvo indicação contrária)`;
    }
    return `Não consegui estabelecer a relação ${parsed.relationCode} entre "${parsed.a}" e "${parsed.b}".`;
  }

  function handleCatgmnInvalid(parsed) {
    return `Relação "${parsed.relWord}" desconhecida para /catgmn. Válidas: ${parsed.valid.join(', ')}.`;
  }

  // ── /forget como deprecação gradual ───────────────────────────────────────
  function handleName(parsed) {
    // Regista directamente no Set global do worker — sem isto o word nunca
    // seria reconhecido como PROPRIO pelo MorphClassifier.classify()
    if (typeof KNOWN_PROPER_NAMES !== 'undefined') {
      KNOWN_PROPER_NAMES.add(parsed.word.toLowerCase());
      return `"${parsed.word}" registado como nome próprio. Passa a ser reconhecido como PROPRIO em frases futuras.`;
    }
    return `Não consegui registar "${parsed.word}" — a lista de nomes próprios não está acessível.`;
  }

  function handleForget(parsed) {
    const marked = PropositionStore.deprecate(parsed.a, parsed.b);
    if (marked > 0) {
      return `${marked} proposição(ões) sobre "${parsed.a}"${parsed.b ? ' / "'+parsed.b+'"' : ''} marcada(s) para esquecimento gradual. O Dream Cycle decide se remove, a menos que sejam reforçadas antes disso.`;
    }
    return `Não encontrei proposições activas sobre "${parsed.a}"${parsed.b ? ' / "'+parsed.b+'"' : ''}.`;
  }

  // ── /why com argumento opcional ───────────────────────────────────────────
  function handleWhy(target) {
    if (!target || target.toLowerCase() === 'última resposta' || target.toLowerCase() === 'ultima resposta') {
      const last = self._lastBuildResult;
      if (!last) {
        return 'A última resposta não veio de proposições — veio do percurso geométrico (KD-Tree/Planner), que ainda não tem instrumentação de explicação tão detalhada.';
      }
      const parts = [];
      if (last.isConflict) parts.push('Reconheci um CONFLITO com uma crença existente.');
      if (last.props?.length > 0) {
        parts.push('Proposições usadas: ' + last.props.map(p =>
          `"${p.subject}${p.qualifier?' de '+p.qualifier:''} ${p.polarity===-1?'não ':''}${p.relationLabel} ${p.object}"${p.context?' [contexto: '+p.context+']':''} (${p.source}, conf:${Math.round(p.confidence*100)}%${p.disputed?', DISPUTADA':''})`
        ).join(' | '));
      }
      if (last.source) parts.push('Fonte: ' + last.source);
      return parts.join(' ') || 'Sem detalhes adicionais.';
    }

    // Explica o que o agente sabe sobre um conceito específico
    const bySubj = PropositionStore.queryBySubject(target, 0, true);
    const byObj  = PropositionStore.queryByObject(target, 0, true);
    // FIX: dedup por id — sem isto, uma proposição onde subject===object
    // (ex: um caso auto-referencial que tenha escapado à guarda de escrita,
    // ou legitimamente qualquer prop cujo target apareça em ambos os
    // papéis) aparecia duplicada na listagem, porque é encontrada tanto
    // por queryBySubject como por queryByObject.
    const seenIds = new Set();
    const all = [...bySubj, ...byObj].filter(p => {
      if (seenIds.has(p.id)) return false;
      seenIds.add(p.id);
      return true;
    });

    if (all.length === 0) return `Não tenho proposições sobre "${target}".`;

    const lines = all.slice(0, 6).map(p => {
      const neg   = p.polarity === -1 ? 'não ' : '';
      const flags = [
        p.disputed ? 'disputada' : null,
        p.state === 'deprecated' ? 'deprecated' : null,
        p.source === 'inferred' ? 'inferida' : null,
      ].filter(Boolean).join(', ');
      const ctxNote  = p.context   ? ` [contexto: ${p.context}]`     : '';
      const qualNote = p.qualifier ? ` de ${p.qualifier}` : '';
      return `"${p.subject}${qualNote} ${neg}${p.relationLabel} ${p.object}"${ctxNote} conf:${Math.round(p.confidence*100)}%${flags ? ' ['+flags+']' : ''}`;
    });

    return `Sobre "${target}": ` + lines.join(' | ');
  }

  return { parse, buildFakeTokens, handleStopLearn, handleStartLearn, handlePauseLoop,
           handleResumeLoop, handleCorrection, handleMean, handleOppose, handleForget, handleWhy,
           handleCatgmn, handleCatgmnInvalid, handleName };
})();

// ============================================================================
// PATCH: PropositionStore.teach respeita pausa de aprendizagem
// ============================================================================
(function patchTeachForPause() {
  const _origTeach = PropositionStore.teach;
  PropositionStore.teach = function(tokens, enrichedTokens, opts) {
    if (self._learningPaused) return null;
    return _origTeach.call(this, tokens, enrichedTokens, opts);
  };
})();

// ============================================================================
// PATCH: captura o resultado do build() para /why
// ============================================================================
(function patchBuildForWhy() {
  if (typeof PropResponseBuilder === 'undefined') return;
  const _origBuild = PropResponseBuilder.build;
  PropResponseBuilder.build = function(tokens, enrichedTokens, speechAct, lang, cycle) {
    const result = _origBuild.call(this, tokens, enrichedTokens, speechAct, lang, cycle);
    self._lastBuildResult = result;
    return result;
  };
})();

// ============================================================================
// PATCH: liga purgeDeprecated() ao Dream Cycle existente
// O Dream Cycle já corre periodicamente (MemoryManager.prototype.dream).
// Agora também decide sobre proposições marcadas para esquecimento.
// ============================================================================
(function patchDreamForDeprecation() {
  if (typeof MemoryManager === 'undefined' || !MemoryManager.prototype.dream) return;
  const _origDream = MemoryManager.prototype.dream;

  MemoryManager.prototype.dream = async function() {
    await _origDream.call(this);
    // Purga proposições deprecated há mais de 5 minutos sem reforço
    const purged = PropositionStore.purgeDeprecated(300000, 1);
    if (purged > 0) {
      console.log('[Dream+Props] Purgou', purged, 'proposições deprecated durante a consolidação.');
    }
  };

  console.log('[AIO-Patch] Dream Cycle agora decide sobre proposições deprecated.');
})();

// ============================================================================
// PATCH DE INTEGRAÇÃO — intercepta comandos antes de qualquer processamento
// ============================================================================
// ============================================================================
// GUARDA CONTRA COMANDOS QUEBRADOS — texto que tem a FORMA de um comando
// (palavra-chave conhecida + ":" + aspas) mas sem a barra inicial. Sem isto,
// "Reconcile:"fogo" Em um casa..." caía silenciosamente no fluxo normal de
// teach(), sendo ensinado como se fosse uma frase factual — confirmado em
// log real do utilizador. Intercepta ANTES do parser de comandos normal,
// dando feedback accionável em vez de poluir o PropositionStore.
// ============================================================================
const KNOWN_COMMAND_VERBS = new Set([
  'incorrect','correct','mean','oppose','forget','why','catgmn',
  'reconcile','walk','patterns','antipattern','synaptic','name',
]);

function looksLikeBrokenCommand(text) {
  const trimmed = (text || '').trim();
  if (trimmed.startsWith('/')) return null; // comando válido — não é "quebrado"
  const match = trimmed.match(/^([A-Za-zÀ-ú]+)\s*:\s*"/);
  if (!match) return null;
  const verb = match[1].toLowerCase();
  return KNOWN_COMMAND_VERBS.has(verb) ? { verb, suggested: '/' + verb } : null;
}

(function applyCommandPatch() {
  const _orig = self.onmessage;

  self.onmessage = async function(e) {
    const { command, payload } = e.data;

    if (command === 'perceive' || command === 'chat') {
      const inputStr = typeof payload === 'string' ? payload : '';

      // Intercepta ANTES de qualquer outra coisa — nunca deixa chegar a teach()
      const broken = looksLikeBrokenCommand(inputStr);
      if (broken) {
        self.postMessage({
          type: 'chatResponse', cycle: brain.cycle, input: inputStr,
          response: {
            text: `Isto parece um comando "${broken.verb}" sem a barra inicial. Faltou o "/"? Tenta "${broken.suggested}:..." — não vou ensinar isto como se fosse uma frase normal.`,
            intent: 'command', regime: 'STABLE', resonance: 100,
            plannerUsed: false, propUsed: false, isCommand: true, commandType: 'broken_command_guard',
          },
          decision: { action: 'command', confidence: 1.0 },
          metacognition: serializeMeta(), stats: brain.getStats(),
          semantic: { tokens: [], clusters: [], causalPairs: [] },
          negation: { contradictions: [], summary: negationGraph.summarize() },
        });
        return;
      }

      const parsed = CommandParser.parse(inputStr);

      if (parsed) {
        let responseText;

        switch(parsed.cmd) {
          case 'stopLearn':  responseText = CommandParser.handleStopLearn();  break;
          case 'startLearn': responseText = CommandParser.handleStartLearn(); break;
          case 'pauseLoop':  responseText = CommandParser.handlePauseLoop();  break;
          case 'resumeLoop': responseText = CommandParser.handleResumeLoop(); break;
          case 'correction': responseText = CommandParser.handleCorrection(parsed);  break;
          case 'mean':       responseText = CommandParser.handleMean(parsed);        break;
          case 'oppose':     responseText = CommandParser.handleOppose(parsed);      break;
          case 'name':       responseText = CommandParser.handleName(parsed);        break;
          case 'forget':     responseText = CommandParser.handleForget(parsed);      break;
          case 'catgmn':     responseText = CommandParser.handleCatgmn(parsed);      break;
          case 'catgmn_invalid': responseText = CommandParser.handleCatgmnInvalid(parsed); break;
          case 'why':        responseText = CommandParser.handleWhy(parsed.target);  break;
          default:
            responseText = 'Comando não reconhecido: "' + parsed.raw + '". Disponíveis: /incorrect, /correct, //stop learn, //start learn, /mean, /oppose, /forget, /why, //pause, //resume.';
        }

        self.postMessage({
          type:     'chatResponse',
          cycle:    brain.cycle,
          input:    inputStr,
          response: {
            text: responseText, intent: 'command', regime: 'STABLE',
            resonance: 100, plannerUsed: false, propUsed: false,
            isCommand: true, commandType: parsed.cmd,
          },
          decision:      { action: 'command', confidence: 1.0 },
          metacognition: serializeMeta(),
          stats:         brain.getStats(),
          semantic:      { tokens: [], clusters: [], causalPairs: [] },
          negation:      { contradictions: [], summary: negationGraph.summarize() },
        });

        return;
      }
    }

    return _orig.call(this, e);
  };

  console.log('[AIO-Patch] CommandParser v2 activo.');
})();