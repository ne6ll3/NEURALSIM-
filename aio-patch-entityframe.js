// ============================================================================
// AIO-PATCH — ENTITY FRAME
// Resolve pronomes pessoais e nomes próprios para identidades fixas antes
// da extracção SPO normal. Sem isto, "eu", "tu", "ele" caem em DESCONHECIDO
// e qualquer frase com pronome pessoal perde o sujeito real.
//
// Estrutura:
//   SELF   — o próprio agente (resolve de "tu/você", quando o utilizador
//            fala COM o agente sobre o agente: "Tu sabes muito")
//   USER   — quem está a interagir nesta sessão (resolve de "eu/nós")
//   PERSON(nome) — terceiros nomeados explicitamente ("João é professor")
//   OBJECT — qualquer entidade não-pessoa (comportamento actual, inalterado)
//
// Aplica-se SEMPRE antes de aio-patch-propositions.js no carregamento,
// porque intercepta _extractSPO antes da extracção normal correr.
// ============================================================================

const EntityFrame = (() => {
  const SELF_ID = 'ENTITY_SELF';
  const USER_ID = 'ENTITY_USER';
  const _persons = new Map(); // nome normalizado → id estável

  const FIRST_PERSON  = new Set(['eu','me','mim','meu','minha','meus','minhas',
                                  'nós','nos','nosso','nossa','nossos','nossas']);
  const SECOND_PERSON = new Set(['tu','te','ti','teu','tua','teus','tuas',
                                  'você','voce','vocês','voces','seu','sua']);
  const THIRD_PRONOUN = new Set(['ele','ela','eles','elas','lhe','lhes','seu','sua']);

  function isFirstPerson(form)  { return FIRST_PERSON.has((form||'').toLowerCase()); }
  function isSecondPerson(form) { return SECOND_PERSON.has((form||'').toLowerCase()); }
  function isThirdPronoun(form) { return THIRD_PRONOUN.has((form||'').toLowerCase()); }

  // Regista (ou recupera) um id estável para um nome próprio
  function resolvePersonId(name) {
    const key = (name || '').toLowerCase();
    if (!key) return null;
    if (!_persons.has(key)) {
      _persons.set(key, 'ENTITY_PERSON_' + key.replace(/\s+/g, '_'));
    }
    return _persons.get(key);
  }

  // Resolve um token para uma identidade do EntityFrame, ou null se não aplicável
  // (nesse caso o token segue o caminho normal de extracção, sem alteração)
  function resolve(token) {
    if (!token || !token.form) return null;
    const form = token.form;

    if (isFirstPerson(form))  return USER_ID;
    if (isSecondPerson(form)) return SELF_ID;
    // Pronomes de 3ª pessoa SEM nome associado não resolvem sozinhos —
    // precisam de contexto anafórico que ainda não existe (gap conhecido,
    // ver nota no fim do ficheiro)
    if (isThirdPronoun(form)) return null;

    const mc = token.psi?.morphClass || token.morphClass || '';
    if (mc === 'PROPRIO') return resolvePersonId(form);

    return null;
  }

  // Converte um id do EntityFrame de volta para texto legível na resposta
  function displayLabel(id, lang = 'pt') {
    if (id === SELF_ID) return lang === 'pt' ? 'Eu' : 'I';
    if (id === USER_ID) return lang === 'pt' ? 'tu' : 'you';
    if (typeof id === 'string' && id.startsWith('ENTITY_PERSON_')) {
      const name = id.replace('ENTITY_PERSON_', '').replace(/_/g, ' ');
      return name.charAt(0).toUpperCase() + name.slice(1);
    }
    return id;
  }

  // Verifica se uma forma textual é qualquer tipo de referência de identidade
  // (usado para decidir se um token deve passar pelo EntityFrame antes do
  // pipeline normal de classificação morfológica)
  function isIdentityReference(form) {
    return isFirstPerson(form) || isSecondPerson(form) || isThirdPronoun(form);
  }

  function listPersons() {
    return Array.from(_persons.entries()).map(([name, id]) => ({ name, id }));
  }

  function stats() {
    return { knownPersons: _persons.size, selfId: SELF_ID, userId: USER_ID };
  }

  return {
    SELF_ID, USER_ID,
    resolve, resolvePersonId, displayLabel, isIdentityReference,
    isFirstPerson, isSecondPerson, isThirdPronoun,
    listPersons, stats,
  };
})();

// ============================================================================
// PATCH 1 — intercepta _extractSPO via wrapping de PropositionStore.teach
// Não consigo aceder directamente à função privada _extractSPO (está fechada
// no closure do PropositionStore), então a resolução de entidade acontece
// numa camada ANTES: pré-processa os tokens, substituindo a forma do
// pronome pela identidade resolvida antes de chegarem ao teach().
// ============================================================================
(function patchTeachWithEntityResolution() {
  const _origTeach = PropositionStore.teach;

  PropositionStore.teach = function(tokens, enrichedTokens, opts = {}) {
    const sourceTokens = enrichedTokens || tokens;

    // Pré-resolve qualquer token de identidade ANTES da extracção SPO normal.
    // Substitui .form pela label de display do EntityFrame, mantendo o
    // resto da estrutura do token intacta (psi, roles, etc).
    const resolvedTokens = sourceTokens.map(t => {
      if (!EntityFrame.isIdentityReference(t.form) && t.psi?.morphClass !== 'PROPRIO') {
        return t; // não é referência de identidade — passa inalterado
      }
      const entityId = EntityFrame.resolve(t);
      if (!entityId) return t; // 3ª pessoa sem nome — gap conhecido, passa inalterado

      return {
        ...t,
        form:        entityId,       // o STORE guarda o id estável (ENTITY_SELF, etc)
        displayForm: EntityFrame.displayLabel(entityId), // para reconstrução textual
        isEntity:    true,
      };
    });

    const result = _origTeach.call(this, tokens, resolvedTokens, opts);
    return result;
  };

  console.log('[AIO-Patch] EntityFrame: resolução de identidade activa antes do teach().');
})();

// ============================================================================
// PATCH 2 — propToSentence reconstrói com displayLabel em vez do id bruto
// Sem isto, uma proposição como {subject: ENTITY_SELF, ...} apareceria
// literalmente como "ENTITY_SELF é..." na resposta — ilegível.
// ============================================================================
(function patchSentenceWithDisplayLabels() {
  if (typeof PropResponseBuilder === 'undefined') return;
  const _origPropToSentence = PropResponseBuilder.propToSentence;

  PropResponseBuilder.propToSentence = function(prop, lang) {
    if (!prop) return null;

    // Substitui ids de entidade por labels legíveis antes de montar a frase
    const displaySubject = prop.subject?.startsWith('ENTITY_')
      ? EntityFrame.displayLabel(prop.subject, lang)
      : prop.subject;
    const displayObject = prop.object?.startsWith('ENTITY_')
      ? EntityFrame.displayLabel(prop.object, lang)
      : prop.object;

    if (displaySubject === prop.subject && displayObject === prop.object) {
      // Nenhuma entidade envolvida — comportamento original inalterado
      return _origPropToSentence(prop, lang);
    }

    // Reconstrói a frase com os labels resolvidos
    const fakeProp = { ...prop, subject: displaySubject, object: displayObject };
    return _origPropToSentence(fakeProp, lang);
  };

  console.log('[AIO-Patch] EntityFrame: respostas usam labels legíveis (Eu/tu/Nome).');
})();

// ============================================================================
// PATCH 3 — isInputKnown reconhece entidades como sempre "conhecidas"
// SELF e USER existem por definição — nunca devem disparar o portão de
// honestidade ("não sei") só porque o pronome em si não tem fireCount.
// ============================================================================
(function patchIsInputKnownForEntities() {
  if (typeof isInputKnown === 'undefined') return;
  const _origIsKnown = isInputKnown;

  // Sobrepõe globalmente — isInputKnown é uma function declaration no
  // patch de proposições, acessível neste scope porque ambos correm no
  // mesmo worker global
  isInputKnown = function(tokens) {
    const hasEntityRef = (tokens || []).some(t =>
      EntityFrame.isIdentityReference(t.form) || t.psi?.morphClass === 'PROPRIO'
    );
    if (hasEntityRef) return true; // referências de identidade são sempre "conhecidas"
    return _origIsKnown(tokens);
  };

  console.log('[AIO-Patch] EntityFrame: portão de honestidade reconhece pronomes.');
})();

// ============================================================================
// COMANDO DE DIAGNÓSTICO — lista pessoas conhecidas e estado do frame
// ============================================================================
(function addEntityFrameCommand() {
  const _orig = self.onmessage;

  self.onmessage = async function(e) {
    if (e.data.command === 'getEntityFrame') {
      self.postMessage({
        type:    'entityFrameState',
        stats:   EntityFrame.stats(),
        persons: EntityFrame.listPersons(),
      });
      return;
    }
    return _orig.call(this, e);
  };
})();

// ============================================================================
// NOTA SOBRE GAPS CONHECIDOS — honestidade técnica
//
// 1. Pronomes de 3ª pessoa sem antecedente ("Ele é professor" dito isolado,
//    sem "João" ter sido mencionado antes) não resolvem para nenhum PERSON
//    específico — ficam null e seguem o caminho normal (sem identidade).
//    Resolver isto exigiria rastreamento anafórico (qual foi o último
//    PROPRIO mencionado na conversa) — não implementado aqui por ser uma
//    funcionalidade distinta e mais complexa que merece o seu próprio patch.
//
// 2. "Tu" resolve sempre para SELF (o agente), assumindo que o utilizador
//    fala SOBRE o agente quando usa a 2ª pessoa. Isto é uma escolha de
//    design razoável para esta arquitectura conversacional (utilizador
//    ↔ agente), mas seria errado num cenário com 3+ participantes.
//
// 3. Não há ainda noção de SELF/USER ao longo de MÚLTIPLAS sessões — se
//    fechares e abrires o browser, o USER_ID continua a ser o mesmo
//    (é uma constante), mas não há diferenciação entre "o treinador A"
//    e "o treinador B" caso duas pessoas diferentes usem o mesmo agente.
//    Isso exigiria um conceito de sessão/utilizador autenticado, fora do
//    âmbito desta arquitectura local-first.
// ============================================================================
