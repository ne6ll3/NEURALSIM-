// ============================================================================
// AIO-PATCH — CURRICULUM IMPORT
// Camada de import de conhecimento estruturado via JSON, para acelerar o
// ensino e servir como fixture reproduzível de teste de regressão.
//
// Formato esperado:
// {
//   "version": "1.0",
//   "propositions": [
//     { "subject":"fogo", "relation":"CATEGORY", "object":"fenómeno", "strength":0.8 },
//     { "subject":"fogo", "relation":"CAUSES",   "object":"calor" },
//     { "subject":"aplicação", "relation":"CAUSES", "object":"gelo",
//       "qualifier":"calor", "context":"Em casa" }
//   ]
// }
//
// Cada entrada usa source:'taught' — obedece às MESMAS regras de conflito,
// verificação e persistência que qualquer facto ensinado interactivamente.
// Nenhum atalho de validação. Isto significa que um import mal-formado ou
// contraditório se comporta EXACTAMENTE como ensino humano incorrecto teria
// — disputas reais, entradas rejeitadas, tudo auditável via /why depois.
//
// Carregado por ÚLTIMO na cadeia (depois de aio-patch-patternlayer.js),
// para poder notificar o PatternLayer de usos limpos tal como o ensino
// normal já faz — dados importados exercitam as mesmas camadas.
// ============================================================================

const CurriculumImport = (() => {

  // Processa uma lista de entradas, devolvendo um relatório detalhado.
  // Não faz bulk-write prematuro: cada entrada passa pelo pipeline real
  // de teachStructured() (validação, conflito, persistência individual).
  // Correcção primeiro, optimização de performance só se vier a ser
  // necessária com volumes que a comprovem.
  function processEntries(entries, cycle) {
    const report = {
      total:      entries.length,
      accepted:   [],
      reinforced: [],
      conflicted: [],
      rejected:   [],
    };

    for (const entry of entries) {
      if (typeof PropositionStore === 'undefined' || !PropositionStore.teachStructured) {
        report.rejected.push({ entry, reason: 'PropositionStore.teachStructured indisponível' });
        continue;
      }

      const result = PropositionStore.teachStructured(entry, { cycle });

      if (result.ok && result.reinforced) {
        report.reinforced.push({ entry, prop: result.prop });
      } else if (result.ok) {
        report.accepted.push({ entry, prop: result.prop });
        // Notifica o PatternLayer, se carregado — dados importados
        // exercitam a mesma camada de observação que ensino normal
        if (typeof PatternLayer !== 'undefined' && PatternLayer.recordCleanUse) {
          try { PatternLayer.recordCleanUse(result.prop, cycle); } catch(e) {}
        }
      } else if (result.conflict) {
        report.conflicted.push({ entry, existingProp: result.existingProp });
      } else {
        report.rejected.push({ entry, reason: result.reason });
      }
    }

    return report;
  }

  // Valida a estrutura do próprio ficheiro antes de processar qualquer
  // entrada — falha cedo e com clareza se o formato estiver errado.
  function validateCurriculumShape(data) {
    if (!data || typeof data !== 'object') return { valid: false, reason: 'não é um objecto JSON' };
    if (!Array.isArray(data.propositions)) return { valid: false, reason: 'campo "propositions" ausente ou não é array' };
    if (data.propositions.length === 0) return { valid: false, reason: '"propositions" está vazio' };
    return { valid: true };
  }

  // Executa o import completo: valida forma, processa entradas, corre
  // inferência transitiva uma vez no fim (as novas proposições podem
  // formar cadeias combináveis entre si), devolve relatório final.
  async function run(data, cycle) {
    const shapeCheck = validateCurriculumShape(data);
    if (!shapeCheck.valid) {
      return { ok: false, reason: shapeCheck.reason };
    }

    const report = processEntries(data.propositions, cycle);

    // Inferência transitiva sobre o conjunto recém-importado — mesma
    // lógica que o AutonomousLoop já corre periodicamente, aqui disparada
    // uma vez explicitamente porque um lote grande de factos novos tem
    // maior probabilidade de conter cadeias combináveis imediatas
    let newInferences = 0;
    if (typeof PropositionStore !== 'undefined' && PropositionStore.runInference) {
      try { newInferences = PropositionStore.runInference(); } catch(e) {}
    }

    return {
      ok: true,
      version:       data.version || 'unknown',
      total:         report.total,
      acceptedCount: report.accepted.length,
      reinforcedCount: report.reinforced.length,
      conflictedCount: report.conflicted.length,
      rejectedCount: report.rejected.length,
      newInferences,
      // Amostras para diagnóstico — não a lista completa se for muito grande
      conflictedSample: report.conflicted.slice(0, 5).map(c => ({
        entry: c.entry,
        existing: c.existingProp ? `${c.existingProp.subject} ${c.existingProp.relationLabel} ${c.existingProp.object}` : null,
      })),
      rejectedSample: report.rejected.slice(0, 5),
    };
  }

  return { run, processEntries, validateCurriculumShape };
})();

// ============================================================================
// PATCH DE INTEGRAÇÃO — comando importCurriculum
// Usa payload como OBJECTO (não string), diferente dos comandos /texto
// habituais — um currículo pode ser grande demais para o parser de
// comandos de uma linha. A interface deve enviar:
//   { command: 'importCurriculum', payload: { version, propositions: [...] } }
// ============================================================================
(function addImportCommand() {
  const _orig = self.onmessage;

  self.onmessage = async function(e) {
    const { command, payload } = e.data;

    if (command === 'importCurriculum') {
      try {
        const result = await CurriculumImport.run(payload, brain.cycle);
        self.postMessage({ type: 'curriculumImportResult', result });
      } catch(err) {
        self.postMessage({
          type: 'curriculumImportResult',
          result: { ok: false, reason: 'Erro inesperado: ' + err.message },
        });
      }
      return;
    }

    return _orig.call(this, e);
  };

  console.log('[AIO-Patch] Comando importCurriculum activo.');
})();

// ============================================================================
// COMANDO DE TEXTO CURTO — /import:review para inspeccionar antes de aplicar
// (dry-run: valida e reporta SEM persistir nada)
// ============================================================================
(function addDryRunSupport() {
  const _origRun = CurriculumImport.run;

  // Estende run() com um modo dryRun opcional — não escreve, só simula
  // a contagem de aceites/conflitos usando queryBySubject para prever
  // conflitos sem chamar teachStructured (que já persiste).
  CurriculumImport.dryRun = function(data) {
    const shapeCheck = CurriculumImport.validateCurriculumShape(data);
    if (!shapeCheck.valid) return { ok: false, reason: shapeCheck.reason };

    let wouldConflict = 0, wouldAccept = 0, invalid = 0;
    for (const entry of data.propositions) {
      if (!entry.subject || !entry.relation || !RelationTypes[entry.relation]) { invalid++; continue; }
      const existing = PropositionStore.queryBySubject(entry.subject.toLowerCase(), 0, true)
        .find(p => p.relation === entry.relation &&
                    p.object?.toLowerCase() === (entry.object||'').toLowerCase());
      if (existing && existing.polarity !== (entry.polarity != null ? entry.polarity : 1)) wouldConflict++;
      else wouldAccept++;
    }

    return {
      ok: true, dryRun: true, total: data.propositions.length,
      wouldAccept, wouldConflict, invalid,
    };
  };
})();
