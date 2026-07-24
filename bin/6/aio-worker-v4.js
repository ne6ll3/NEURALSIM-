// ============================================================================
// AIO-WORKER v4.0 — PERSISTÊNCIA EMERGENTE GEOMÉTRICA
// Manifesto Geométrico integrado como fundação ontológica real.
// v4: Inércia Contextual (λ), Recuperação Episódica Activa,
//     Continuidade Conversacional Geométrica.
// Zero funções simuladas. Zero atomicidades falsas.
// ============================================================================

// ── Diagnóstico: primeiro sinal de vida do Worker ────────────────────────────
self.addEventListener('error', function(evt) {
    try {
        self.postMessage({
            type: '__worker_error__',
            message: evt.message || '(sem mensagem)',
            filename: evt.filename || '',
            lineno: evt.lineno || 0,
            colno: evt.colno || 0,
        });
    } catch(e) {}
});
self.addEventListener('unhandledrejection', function(evt) {
    try {
        self.postMessage({
            type: '__worker_error__',
            message: 'UnhandledRejection: ' + (evt.reason && evt.reason.message ? evt.reason.message : String(evt.reason)),
            stack: evt.reason && evt.reason.stack ? evt.reason.stack : ''
        });
    } catch(e) {}
});
self.postMessage({ type: '__worker_alive__' });

// ── Dexie embutido — zero CDN, funciona offline ───────────────────────────────
const Dexie = (function(){
'use strict';
class _T{
  constructor(db,n){this._db=db;this._n=n;}
  _s(m='readonly'){return this._db._tx([this._n],m).objectStore(this._n);}
  _p(r){return new Promise((ok,ko)=>{r.onsuccess=()=>ok(r.result);r.onerror=()=>ko(r.error);});}
  put(o){return this._p(this._s('readwrite').put(o));}
  add(o){return this._p(this._s('readwrite').add(o));}
  get(k){return this._p(this._s().get(k));}
  delete(k){return this._p(this._s('readwrite').delete(k));}
  count(){return this._p(this._s().count());}
  toArray(){return this._p(this._s().getAll());}
  bulkDelete(ks){const s=this._s('readwrite');return Promise.all(ks.map(k=>this._p(s.delete(k))));}
  bulkPut(items){const s=this._s('readwrite');return Promise.all(items.map(i=>this._p(s.put(i))));}
  where(idx){return new _Q(this,idx);}
  orderBy(idx){return new _Q(this,idx,true);}
  update(key,ch){return this.get(key).then(o=>{if(!o)return 0;Object.assign(o,ch);return this.put(o).then(()=>1);});}
}
class _Q{
  constructor(t,idx){this._t=t;this._i=idx;this._r=null;this._l=Infinity;this._rv=false;}
  equals(v){this._r=IDBKeyRange.only(v);return this;}
  above(v){this._r=IDBKeyRange.lowerBound(v,true);return this;}
  anyOf(a){this._r=a;return this;}
  limit(n){this._l=n;return this;}
  first(){return this.toArray().then(a=>a[0]||undefined);}
  primaryKeys(){return this.toArray().then(a=>a.map(o=>o.id));}
  reverse(){this._rv=true;return this;}
  toArray(){
    const s=this._t._s();
    return new Promise((ok,ko)=>{
      let req;
      if(Array.isArray(this._r)){
        req=s.getAll();req.onsuccess=()=>{const set=new Set(this._r);ok(req.result.filter(o=>{const v=o[this._i];return Array.isArray(v)?v.some(x=>set.has(x)):set.has(v);}).slice(0,this._l));};
      }else{
        const src=this._i&&s.indexNames.contains(this._i)?s.index(this._i):s;
        req=this._r?src.getAll(this._r,this._l):src.getAll(null,this._l);
        req.onsuccess=()=>{let r=req.result;if(this._rv)r=r.reverse();ok(r);};
      }
      req.onerror=()=>ko(req.error);
    });
  }
}
class Dexie{
  constructor(name){this._name=name;this._schema={};this._idb=null;this._tables={};}
  version(n){this._ver=n;return{stores:(s)=>{this._schema=s;return this;}};}
  _open(){
    if(this._idb)return Promise.resolve(this._idb);
    return new Promise((ok,ko)=>{
      const req=indexedDB.open(this._name,this._ver||1);
      req.onupgradeneeded=e=>{
        const db=e.target.result;
        for(const[name,def]of Object.entries(this._schema)){
          if(!db.objectStoreNames.contains(name)){
            const parts=def.split(',').map(s=>s.trim());
            const keyPath=parts[0].replace(/^\+\+/,'');
            const autoInc=parts[0].startsWith('++');
            const store=db.createObjectStore(name,{keyPath,autoIncrement:autoInc});
            parts.slice(1).forEach(idx=>{const multi=idx.startsWith('*');const iname=idx.replace(/^\*/,'');if(iname)store.createIndex(iname,iname,{multiEntry:multi});});
          }
        }
      };
      req.onsuccess=()=>{this._idb=req.result;ok(req.result);};
      req.onerror=()=>ko(req.error);
    });
  }
  _tx(stores,mode){if(!this._idb)throw new Error('DB not open');return this._idb.transaction(stores,mode);}
  _tbl(n){if(!this._tables[n])this._tables[n]=new _T(this,n);return this._tables[n];}
  get nodes(){return this._tbl('nodes');}
  get synapses(){return this._tbl('synapses');}
  get episodes(){return this._tbl('episodes');}
  get patterns(){return this._tbl('patterns');}
  get metacognition(){return this._tbl('metacognition');}
  get stats(){return this._tbl('stats');}
  delete(){return new Promise((ok,ko)=>{const r=indexedDB.deleteDatabase(this._name);r.onsuccess=ok;r.onerror=ko;});}
  async open(){await this._open();return this;}
  async transaction(mode,tables,fn){await this._open();return fn();}
}
return Dexie;
})();

// ============================================================================
// CFG — fonte única de verdade
// ============================================================================
const CFG = Object.freeze({
  DECAY_STABLE: 0.005, DECAY_MILD: 0.01, DECAY_DYNAMIC: 0.05, DECAY_CRITICAL: 0.15,
  FRUSTRATION_MILD: 0.25, FRUSTRATION_HIGH: 0.50, FRUSTRATION_CRISIS: 0.75,
  OVERFIT_CONF_THRESH: 0.85, OVERFIT_ACTION_WINDOW: 20, OVERFIT_REPEAT_RATIO: 0.75,
  OVERFIT_DECAY_MULT: 3.0, OVERFIT_SIGNAL_TTL: 30,
  DORMANT_FIRE_MAX: 3, DORMANT_BOOST: 0.4, DORMANT_SCAN_PCT: 0.05,
  MIN_RELEVANCE: 0.05, ACT_THRESHOLD: 0.1, MERGE_THRESHOLD: 0.85,
  MAX_NODES: 5000, MAX_SYNAPSES_NODE: 64, PROPAGATION_DEPTH: 4,
  RESONANCE_THRESH: 0.7, ATTENUATION: 0.3,
  SPATIAL_CELL: 120,
  DEAD_CYCLES: 100, MIN_SUBGRAPH_SIZE: 3, PATTERN_MIN_INST: 5,
  ABSTRACTION_LAYERS: 3, CLEANUP_INTERVAL: 50, MANAGE_INTERVAL: 10,
  BATCH_FLUSH_MS: 200, BATCH_MAX_SIZE: 100,
  ACTIVE_DECAY_WINDOW: 500,
  // ── Geométrico (Manifesto) ────────────────────────────────────────────────
  PSI_KD_MARGIN_THETA:        15,
  PSI_HOMEOSTASIS_R:          0.08,
  PSI_Z_SCALE:                100,
  PSI_SIMILARITY_SIGMA:       0.85,
  // Autonomous Loop
  AUTONOMOUS_TICK_MS:         500,
  DREAM_CYCLE_INTERVAL:       120,
  // Goal Generator
  GOAL_CONTRADICTION_URGENCY: 0.8,
  GOAL_NOVELTY_URGENCY:       0.5,
  GOAL_MAX_ACTIVE:            10,
  // Predictive Model
  PREDICTION_LEARNING_RATE:   0.12,
  PREDICTION_DECAY:           0.005,
  SURPRISE_WEIGHT:            0.4,
  NOVELTY_WEIGHT:             0.3,
  GOAL_URGENCY_WEIGHT:        0.3,
  // ── Inércia Contextual (λ) ────────────────────────────────────────────────
  CONTEXT_WINDOW_SIZE:        8,    // últimos N inputs da sessão
  CONTEXT_LAMBDA:             0.65, // fricção: peso do histórico vs input novo
  CONTEXT_BIAS_STRENGTH:      0.35, // quanto o contextPsi influencia a KD-Tree
  // ── Recuperação Episódica ─────────────────────────────────────────────────
  EPISODE_RECALL_N:           3,    // episódios a recuperar por input
  EPISODE_RECALL_THRESHOLD:   0.45, // similaridade mínima para recuperar
  EPISODE_BOOST:              0.18, // boost hebbian ao recuperar episódio
});

const MEMORY_CONFIG = {
  DECAY_STABLE: 0.005, DECAY_MILD: 0.01, DECAY_DYNAMIC: 0.05, DECAY_CRITICAL: 0.15,
  FRUSTRATION_MILD: 0.25, FRUSTRATION_HIGH: 0.50, FRUSTRATION_CRISIS: 0.75,
  OVERFIT_CONFIDENCE_THRESHOLD: 0.85, OVERFIT_ACTION_WINDOW: 20,
  OVERFIT_REPEAT_RATIO: 0.75, OVERFIT_DECAY_MULTIPLIER: 3.0,
  DORMANT_THRESHOLD: 3, DORMANT_BONUS: 0.4, DORMANT_SCAN_RATIO: 0.05,
  MIN_RELEVANCE: 0.05, ACTIVATION_THRESHOLD: 0.1, MERGE_THRESHOLD: 0.85,
  MAX_NODES: 5000, SUBGRAPH_DEAD_CYCLES: 100, MIN_SUBGRAPH_SIZE: 3,
  PATTERN_MIN_INSTANCES: 5, ABSTRACTION_LAYERS: 3
};

// ============================================================================
// DB
// ============================================================================
const DB = new Dexie('AIO_Brain_v4');
DB.version(2).stores({
    nodes:         '++id, type, layer, lastFired, fireCount, *signatureTokens',
    synapses:      '++id, source, target',
    episodes:      '++id, cycle, timestamp',
    patterns:      '++id, layer',
    metacognition: 'key',
    stats:         'key'
});

// ============================================================================
// EventContract
// ============================================================================
const EventContract = (() => {
  const SCHEMAS = {
    sync:        ['type','data','stats','metacognition'],
    decision:    ['type','cycle','decision','metacognition','stats'],
    initialized: ['type','data'],
    state:       ['type'],
    reset:       ['type'],
    perceive:     null,
    induceFrustration: null,
    getState:     null,
    init:         null,
  };
  function validate(msg) {
    const schema = SCHEMAS[msg.type || msg.command];
    if (!schema) return msg;
    for (const field of schema) {
      if (!(field in msg)) console.error('[EventContract] Campo ausente:', field, 'em', msg.type || msg.command);
    }
    return msg;
  }
  function wrap(postFn) { return (msg) => { validate(msg); postFn(msg); }; }
  return { validate, wrap };
})();

// ============================================================================
// MANIFESTO GEOMÉTRICO — ψ(w) = (r, θ, z)
// Esta é a fundação ontológica real. Substitui _embed() por âncoras cilíndricas.
// Cada palavra é um ponto-vetor num espaço tridimensional cilíndrico.
// ============================================================================

// ── Mapa de classes morfológicas → quadrante θ base ──────────────────────────
// O círculo de 360° dividido em zonas gramaticais funcionais
const MORPH_THETA = {
  // Sujeito / Entidade: 0°–90°
  SUBSTANTIVO: 45,  PRONOME: 22,  PROPRIO: 67,  ACRONIMO: 80,
  // Predicado / Acção: 90°–180°
  VERBO_PRESENTE: 135, VERBO_PASSADO: 100, VERBO_FUTURO: 170, VERBO_INF: 120,
  // Objecto / Complemento: 180°–270°
  ADJETIVO: 225, ADVERBIO: 200, NUMERICO: 250, COMPLEMENTO: 240,
  // Operadores / Conectores: 270°–360°
  CAUSAL: 290, NEGACAO: 315, INTENSIFICADOR: 330, HEDGE: 350, STOPWORD: 359,
  // Default
  DESCONHECIDO: 180,
};

// ── Mapa de classes → densidade semântica base (r) ───────────────────────────
const MORPH_R = {
  PROPRIO: 0.95, ACRONIMO: 0.92, CAUSAL: 0.90, VERBO_PRESENTE: 0.80,
  VERBO_PASSADO: 0.75, VERBO_FUTURO: 0.82, VERBO_INF: 0.70,
  SUBSTANTIVO: 0.72, NUMERICO: 0.70, ADJETIVO: 0.60,
  ADVERBIO: 0.55, PRONOME: 0.50, COMPLEMENTO: 0.55,
  NEGACAO: 0.65, INTENSIFICADOR: 0.85, HEDGE: 0.35, STOPWORD: 0.05,
  DESCONHECIDO: 0.40,
};

// ── Vectores de afinidade conceptual W_lex por classe ────────────────────────
const MORPH_WLEX = {
  SUBSTANTIVO:    { log: 0.4, emoc: 0.2, abs: 0.3, inf: 0.1 },
  VERBO_PRESENTE: { log: 0.3, emoc: 0.3, abs: 0.2, inf: 0.2 },
  VERBO_PASSADO:  { log: 0.4, emoc: 0.4, abs: 0.1, inf: 0.1 },
  VERBO_FUTURO:   { log: 0.2, emoc: 0.2, abs: 0.4, inf: 0.2 },
  ADJETIVO:       { log: 0.2, emoc: 0.5, abs: 0.2, inf: 0.1 },
  ADVERBIO:       { log: 0.3, emoc: 0.3, abs: 0.2, inf: 0.2 },
  CAUSAL:         { log: 0.7, emoc: 0.1, abs: 0.1, inf: 0.1 },
  NEGACAO:        { log: 0.5, emoc: 0.3, abs: 0.1, inf: 0.1 },
  INTENSIFICADOR: { log: 0.2, emoc: 0.6, abs: 0.1, inf: 0.1 },
  NUMERICO:       { log: 0.8, emoc: 0.0, abs: 0.1, inf: 0.1 },
  PROPRIO:        { log: 0.5, emoc: 0.2, abs: 0.2, inf: 0.1 },
  DESCONHECIDO:   { log: 0.25, emoc: 0.25, abs: 0.25, inf: 0.25 },
};

// ── Detector de classe morfológica (sem bibliotecas externas) ─────────────────
// Usa os léxicos já presentes no SemanticTokenizer mais padrões morfológicos PT
const MorphClassifier = (() => {
  const NEGATION_SET = new Set([
    'não','nem','nunca','jamais','nenhum','nenhuma','sem','impossível',
    'falso','errado','incorreto','no','not','never','none','without','false'
  ]);
  const INTENSIFIER_SET = new Set([
    'muito','bastante','extremamente','totalmente','completamente','sempre',
    'absolutamente','definitivamente','certamente','obviously','always','very'
  ]);
  const HEDGE_SET = new Set([
    'talvez','possivelmente','provavelmente','quase','cerca','aproximadamente',
    'às vezes','raramente','maybe','possibly','probably','sometimes','nearly'
  ]);
  const CAUSAL_SET = new Set([
    'porque','portanto','logo','então','consequentemente','assim','pois',
    'resulta','implica','causa','because','therefore','thus','hence','implies'
  ]);
  const STOPWORD_SET = new Set([
    'de','a','o','e','da','do','em','que','para','com','uma','um','os','as',
    'dos','das','no','na','por','se','ao','mais','mas','ou','é','são','foi',
    'ser','ter','esta','este','isso','aqui','ali','já','ainda','também',
    'the','of','and','to','in','is','that','for','on','are','with','as'
  ]);
  // Sufixos verbais PT — ordem importa (mais específico primeiro)
  const VERB_PAST_SUFFIX   = /(?:ei|aste|ou|amos|astes|aram|ia|ias|íamos|iam|era|eras|era|êramos|eram|i|iste|iu|imos|istes|iram|ira|iras|íra|íramos|iram)$/i;
  const VERB_FUTURE_SUFFIX = /(?:arei|arás|ará|aremos|areis|arão|erei|erás|erá|eremos|ereis|erão|irei|irás|irá|iremos|ireis|irão)$/i;
  const VERB_INF_SUFFIX    = /(?:ar|er|ir|or)$/i;
  const VERB_PRES_SUFFIX   = /(?:o|as|a|amos|ais|am|es|e|emos|eis|em|o|es|e|imos|is|em)$/i;
  const NOUN_SUFFIX        = /(?:ção|são|dade|ismo|ista|mento|eza|ura|agem|ência|ância|or|ador|ador)$/i;
  const ADJ_SUFFIX         = /(?:oso|osa|ável|ível|al|ar|oso|ivo|iva|ante|ente|vel)$/i;
  const ADV_SUFFIX         = /mente$/i;
  const NUMBER_RE          = /^-?\d+([.,]\d+)?(%|kg|km|m|s|ms)?$/;
  const ACRONYM_RE         = /^[A-ZÁÉÍÓÚÀÂÊÔ]{2,6}$/;
  const PROPER_RE          = /^[A-ZÁÉÍÓÚÀÂÊÔ][a-záéíóúàâêô]{2,}$/;

  function classify(form, raw) {
    if (!form) return 'DESCONHECIDO';
    if (STOPWORD_SET.has(form))    return 'STOPWORD';
    if (NEGATION_SET.has(form))    return 'NEGACAO';
    if (INTENSIFIER_SET.has(form)) return 'INTENSIFICADOR';
    if (HEDGE_SET.has(form))       return 'HEDGE';
    if (CAUSAL_SET.has(form))      return 'CAUSAL';
    if (NUMBER_RE.test(raw || form)) return 'NUMERICO';
    if (ACRONYM_RE.test(raw || '')) return 'ACRONIMO';
    if (PROPER_RE.test(raw || ''))  return 'PROPRIO';
    if (ADV_SUFFIX.test(form))      return 'ADVERBIO';
    if (ADJ_SUFFIX.test(form))      return 'ADJETIVO';
    if (VERB_FUTURE_SUFFIX.test(form)) return 'VERBO_FUTURO';
    if (VERB_PAST_SUFFIX.test(form))   return 'VERBO_PASSADO';
    if (VERB_INF_SUFFIX.test(form) && form.length > 3) return 'VERBO_INF';
    if (VERB_PRES_SUFFIX.test(form) && form.length > 2) return 'VERBO_PRESENTE';
    if (NOUN_SUFFIX.test(form))        return 'SUBSTANTIVO';
    return 'DESCONHECIDO';
  }

  return { classify };
})();

// ── Função central de ancoragem: ψ(w) ────────────────────────────────────────
// Recebe um token semântico (do SemanticTokenizer) e devolve a âncora geométrica
// REAL. z começa em 0 — será calculado emergentemente na operação entre âncoras.
function anchorPsi(token) {
  const morphClass = MorphClassifier.classify(token.form, token.raw);

  // θ base pela classe morfológica
  let theta = MORPH_THETA[morphClass] || MORPH_THETA.DESCONHECIDO;

  // Ajuste de θ pela negação: negação inverte o quadrante (rotação de 180°)
  if (token.roles && token.roles.underNegation) {
    theta = (theta + 180) % 360;
  }

  // r base pela classe + modulado pelo peso semântico já calculado
  const rBase  = MORPH_R[morphClass] || MORPH_R.DESCONHECIDO;
  const r      = Math.min(1, rBase * (0.5 + (token.semanticWeight || 0.5) * 0.5));

  // W_lex desta classe
  const W_lex  = MORPH_WLEX[morphClass] || MORPH_WLEX.DESCONHECIDO;

  // z emerge das relações — aqui é semente baseada na abstracção da classe
  // Classes mais abstractas têm z semente maior
  const zSeed  = morphClass === 'CAUSAL'    ? 0.4
               : morphClass === 'HEDGE'     ? 0.3
               : morphClass === 'NEGACAO'   ? 0.25
               : morphClass === 'ADJETIVO'  ? 0.15
               : morphClass === 'ADVERBIO'  ? 0.12
               : morphClass === 'STOPWORD'  ? 0.0
               : 0.1;

  return {
    r,
    theta,
    z: zSeed,
    morphClass,
    W_lex,
    form: token.form,
  };
}

// ── Operação de Convolução Geométrica entre duas âncoras ──────────────────────
// Aplica-se na interação Sujeito ⊗ Predicado.
// O verbo actua como operador de rotação e escala sobre o sujeito.
// contextoAgente: { W_estado: { log, emoc, abs, inf }, frustration }
function operateCylindrical(psiSujeito, psiVerbo, contextoAgente) {
  const s = psiSujeito;
  const v = psiVerbo;
  const W_estado = contextoAgente.W_estado || { log: 0.25, emoc: 0.25, abs: 0.25, inf: 0.25 };
  const frustration = contextoAgente.frustration || 0;

  // Ressonância contextual: produto escalar entre W_lex do verbo e W_estado do agente
  const ressonanciaInformal = v.W_lex.inf * W_estado.inf + v.W_lex.emoc * W_estado.emoc;

  // Se ressonância informal alta (humor/ironia/frustração), rotação de fase
  let deltaTheta = v.theta;
  if (ressonanciaInformal > 0.5 || frustration > CFG.FRUSTRATION_HIGH) {
    deltaTheta = (deltaTheta + 180) % 360; // busca o "absurdo" / oposto semântico
  }

  // θ resultante: combinação do sujeito com o operador verbal
  const theta_res = (s.theta + deltaTheta) % 360;

  // Afinidade semântica: cosseno da diferença angular
  const diffRad  = Math.abs(s.theta - v.theta) * Math.PI / 180;
  const afinidade = Math.cos(diffRad);

  // r resultante: escala do sujeito pelo raio do verbo × afinidade
  const r_res = Math.max(0, s.r * (v.r * afinidade));

  // z emergente: tensão gerada pela distância angular entre as duas âncoras
  // Quanto mais distantes θ, mais profunda a questão
  const z_res = (s.z + v.z) + Math.abs(s.theta - v.theta) / CFG.PSI_Z_SCALE;

  return { r: r_res, theta: theta_res, z: z_res };
}

// ── Interpolação SLERP cilíndrica: aplica modificadores (adj/adv) ─────────────
// O adjetivo não cria ponto novo — desloca a âncora do substantivo
function slerpCylindrical(psiBase, psiModificador, peso = 0.3) {
  // r: densifica em direcção ao modificador
  const r_new = psiBase.r + (psiModificador.r - psiBase.r) * peso;

  // θ: rotação parcial em direcção ao ângulo do modificador
  let dTheta = psiModificador.theta - psiBase.theta;
  if (dTheta > 180)  dTheta -= 360;
  if (dTheta < -180) dTheta += 360;
  const theta_new = (psiBase.theta + dTheta * peso + 360) % 360;

  // z: soma o z semente do modificador (aprofunda a questão se for hedge/causal)
  const z_new = psiBase.z + psiModificador.z * peso;

  return { r: r_new, theta: theta_new, z: z_new };
}

// ── KD-Tree cilíndrica simplificada (3D: r, θ, z) ─────────────────────────────
// Indexa pontos ψ(w) e responde a consultas de vizinho mais próximo em O(log n).
// Usa splitting por dimensão de maior variância.
class CylindricalKDTree {
  constructor() {
    this._points          = []; // { cart:[x,y,z], psi, nodeId, form }
    this._root            = null;
    this._dirty           = false;
    this._lastRebuildSize = 0;
  }

  // ψ cilíndrico → cartesiano [x,y,z].
  // Indexação e métrica são ambas cartesianas: 0°=360° é naturalmente correcto.
  _toCart(psi) {
    const rad = psi.theta * Math.PI / 180;
    return [psi.r * Math.cos(rad), psi.r * Math.sin(rad), psi.z];
  }

  _distSq(cartA, cartB) {
    return (cartA[0]-cartB[0])**2 + (cartA[1]-cartB[1])**2 + (cartA[2]-cartB[2])**2;
  }

  // Divide em eixo cartesiano — consistente com a métrica
  _buildNode(points, depth) {
    if (points.length === 0) return null;
    if (points.length === 1) return { point: points[0], left:null, right:null, axis: depth%3 };
    const axis = depth % 3; // x(0), y(1), z(2)
    points.sort((a, b) => a.cart[axis] - b.cart[axis]);
    const mid = Math.floor(points.length / 2);
    return {
      point: points[mid],
      left:  this._buildNode(points.slice(0, mid), depth + 1),
      right: this._buildNode(points.slice(mid + 1), depth + 1),
      axis,
    };
  }

  insert(psi, nodeId, form) {
    const cart = this._toCart(psi);
    this._points.push({ cart, psi, nodeId, form });
    this._dirty = true;
    // Rebuild incremental: evita rebuilds constantes em inserts isolados
    if (this._points.length > this._lastRebuildSize * 1.25 || this._points.length > 1200) {
      this.rebuild();
    }
  }

  rebuild() {
    this._root            = this._buildNode([...this._points], 0);
    this._dirty           = false;
    this._lastRebuildSize = this._points.length;
  }

  // Nearest neighbour com poda correcta de hiperplanos cartesianos
  nearest(queryPsi) {
    if (this._points.length === 0) return null;
    if (this._dirty) this.rebuild();
    const qCart = this._toCart(queryPsi);
    let best = { point: null, distSq: Infinity };

    const search = (node, depth) => {
      if (!node) return;
      const d = this._distSq(qCart, node.point.cart);
      if (d < best.distSq) best = { point: node.point, distSq: d };
      const axis = depth % 3;
      const diff = qCart[axis] - node.point.cart[axis];
      const first  = diff <= 0 ? node.left  : node.right;
      const second = diff <= 0 ? node.right : node.left;
      search(first, depth + 1);
      if (diff * diff < best.distSq) search(second, depth + 1);
    };

    search(this._root, 0);
    return best.point;
  }

  // nearestN com heap de tamanho n — evita ordenar o array inteiro
  nearestN(queryPsi, n = 5) {
    if (this._points.length === 0) return [];
    if (this._dirty) this.rebuild();
    const qCart = this._toCart(queryPsi);
    const heap  = []; // max-heap simulado

    const push = (item) => {
      heap.push(item);
      if (heap.length > n) {
        let maxIdx = 0;
        for (let i = 1; i < heap.length; i++)
          if (heap[i].distSq > heap[maxIdx].distSq) maxIdx = i;
        heap.splice(maxIdx, 1);
      }
    };

    const search = (node, depth) => {
      if (!node) return;
      const d = this._distSq(qCart, node.point.cart);
      const worstInHeap = heap.length < n ? Infinity
        : heap.reduce((m, h) => Math.max(m, h.distSq), 0);
      if (d < worstInHeap) push({ point: node.point, distSq: d });
      const axis = depth % 3;
      const diff = qCart[axis] - node.point.cart[axis];
      const first  = diff <= 0 ? node.left  : node.right;
      const second = diff <= 0 ? node.right : node.left;
      search(first, depth + 1);
      const worst2 = heap.length < n ? Infinity
        : heap.reduce((m, h) => Math.max(m, h.distSq), 0);
      if (diff * diff < worst2) search(second, depth + 1);
    };

    search(this._root, 0);
    return heap.sort((a, b) => a.distSq - b.distSq).map(h => h.point);
  }

  size() { return this._points.length; }
}

// ── KD-Tree global: indexa todos os nós ancorados geometricamente ─────────────
const globalKDTree = new CylindricalKDTree();

// ============================================================================
// BatchedPersistence
// ============================================================================
const Persistence = (() => {
  const queues = { nodes: new Map(), synapses: new Map(), episodes: [], stats: [] };
  let timer = null;

  async function _flush() {
    timer = null;
    try {
      await DB.open();
      if (queues.nodes.size > 0) {
        const items = Array.from(queues.nodes.values()).map(n => {
          if (n.signature && n.signature.lexical)
            n.signatureTokens = n.signature.lexical.toLowerCase().split(/\s+/);
          return n;
        });
        queues.nodes.clear();
        await DB.nodes.bulkPut(items);
      }
      if (queues.synapses.size > 0) {
        const items = Array.from(queues.synapses.values());
        queues.synapses.clear();
        await DB.synapses.bulkPut(items);
      }
      if (queues.episodes.length > 0) {
        const batch = queues.episodes.splice(0);
        for (const ep of batch) await DB.episodes.add(ep);
      }
      if (queues.stats.length > 0) {
        const batch = queues.stats.splice(0);
        for (const s of batch) await DB.stats.put(s);
      }
    } catch(e) { console.error('[BatchedPersistence] flush error:', e); }
  }

  function _schedule() {
    if (timer) return;
    const size = queues.nodes.size + queues.synapses.size + queues.episodes.length;
    if (size >= CFG.BATCH_MAX_SIZE) { _flush(); }
    else { timer = setTimeout(_flush, CFG.BATCH_FLUSH_MS); }
  }

  return {
    saveNode(node)     { queues.nodes.set(node.id, node); _schedule(); },
    saveSynapse(syn)   { queues.synapses.set(syn.source + '>' + syn.target, syn); _schedule(); },
    saveEpisode(ep)    { queues.episodes.push(ep); _schedule(); },
    saveMetacognition(meta) { queues.stats.push({ key: 'metacognition', ...meta }); _schedule(); },
    bulkDeleteNodes(ids)    { return DB.nodes.bulkDelete(ids); },
    bulkDeleteSynapses(ids) { return DB.synapses.bulkDelete(ids); },

    // Similaridade geométrica real: distância euclidiana cartesiana entre ψ
    calculateSimilarity(sig1, sig2) {
      // Se ambos têm psi, usa geometria
      if (sig1 && sig2 && sig1.psi && sig2.psi) {
        const thetaRad1 = sig1.psi.theta * Math.PI / 180;
        const thetaRad2 = sig2.psi.theta * Math.PI / 180;
        const dx = sig1.psi.r * Math.cos(thetaRad1) - sig2.psi.r * Math.cos(thetaRad2);
        const dy = sig1.psi.r * Math.sin(thetaRad1) - sig2.psi.r * Math.sin(thetaRad2);
        const dz = sig1.psi.z - sig2.psi.z;
        const distSq = dx*dx + dy*dy + dz*dz;
        const sigma = CFG.PSI_SIMILARITY_SIGMA;
        return Math.exp(-distSq / (2 * sigma * sigma));
      }
      // Fallback lexical se não há geometria ainda
      if (!sig1 || !sig2 || !sig1.lexical || !sig2.lexical) return 0;
      const t1 = new Set(sig1.lexical.toLowerCase().split(/\s+/));
      const t2 = new Set(sig2.lexical.toLowerCase().split(/\s+/));
      const inter = [...t1].filter(x => t2.has(x)).length;
      return inter / Math.max(t1.size, t2.size, 1);
    },

    async loadGraph() {
      await DB.open();
      const [nodes, synapses] = await Promise.all([DB.nodes.toArray(), DB.synapses.toArray()]);
      return { nodes, synapses };
    },
    async loadMetacognition() {
      await DB.open();
      const m = await DB.metacognition.get('metacognition');
      return m || { arousal: 0.5, frustration: 0, confidence: 0.5, age: 0 };
    },
    async saveMetacognitionAsync(meta) {
      await DB.open();
      await DB.metacognition.put({ key: 'metacognition', ...meta });
    },
    async getMemoryStats() {
      await DB.open();
      const [nodeCount, synapseCount, episodeCount] = await Promise.all([
        DB.nodes.count(), DB.synapses.count(), DB.episodes.count()
      ]);
      return { nodeCount, synapseCount, episodeCount };
    },
    async pruneOldEpisodes(keepCount = 500) {
      await DB.open();
      const count = await DB.episodes.count();
      if (count > keepCount) {
        const keys = await DB.episodes.orderBy('cycle').limit(count - keepCount).primaryKeys();
        await DB.episodes.bulkDelete(keys);
      }
    },
    flush: _flush,
  };
})();

// ============================================================================
// SpatialIndex — hash espacial O(1) para vizinhança no canvas
// ============================================================================
class SpatialIndex {
  constructor(cellSize = CFG.SPATIAL_CELL) { this._cell = cellSize; this._grid = new Map(); }
  _key(x, y) { return (Math.floor(x/this._cell)+','+Math.floor(y/this._cell)); }
  rebuild(nodes) {
    this._grid.clear();
    for (const node of nodes) {
      const k = this._key(node.x, node.y);
      if (!this._grid.has(k)) this._grid.set(k,[]);
      this._grid.get(k).push(node);
    }
  }
  neighbours(node) {
    const cx=Math.floor(node.x/this._cell), cy=Math.floor(node.y/this._cell);
    const result=[];
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){
      const k=(cx+dx)+','+(cy+dy);
      const b=this._grid.get(k);
      if(b)for(const n of b)if(n!==node)result.push(n);
    }
    return result;
  }
  move(node,oldX,oldY){
    const ok=this._key(oldX,oldY),nk=this._key(node.x,node.y);
    if(ok===nk)return;
    const o=this._grid.get(ok);
    if(o){const i=o.indexOf(node);if(i>-1)o.splice(i,1);}
    if(!this._grid.has(nk))this._grid.set(nk,[]);
    this._grid.get(nk).push(node);
  }
}

// ============================================================================
// MemoryManager — decay, anti-overfitting, nós dormentes
// ============================================================================
class MemoryManager {
  constructor(brain) {
    this.brain = brain;
    this.environmentStability = 0.5;
    this.cyclesSinceLastCleanup = 0;
    this.mergeHistory = [];
    this.abstractionQueue = [];
    this.decayRegime     = 'STABLE';
    this.lastDecayReport = 0;
    this.actionHistory    = [];
    this.overfitClusters  = new Set();
    this.lastOverfitCheck = 0;
    // Map key→lastTouchedCycle (substitui Set: permite limpeza por idade)
    this._activeSynapses  = new Map();
  }

  recordAction(action, confidence, dominantCluster, cycle) {
    this.actionHistory.push({ action, confidence, dominantCluster, cycle });
    if (this.actionHistory.length > 200) this.actionHistory.shift();
  }

  async manage() {
    this.cyclesSinceLastCleanup++;
    const sig = this.brain._overfitSignal;
    if (sig && this.brain.cycle >= sig.expiresAt) {
      delete this.brain._overfitSignal;
      this.overfitClusters.clear();
    }
    this.applyAdaptiveDecay();
    this.checkOverfitting();
    this.activateDormantNodes();
    if (this.cyclesSinceLastCleanup > 50) {
      await this.cleanup();
      this.cyclesSinceLastCleanup = 0;
    }
    if (this.brain.nodes.size > MEMORY_CONFIG.MAX_NODES * 0.8) {
      await this.mergeSimilarNodes();
    }
  }

  applyAdaptiveDecay() {
    const currentCycle = this.brain.cycle;
    // LEAK FIX: remove entradas não tocadas há mais de ACTIVE_DECAY_WINDOW ciclos
    for (const [key, lastCycle] of this._activeSynapses) {
      if (currentCycle - lastCycle > CFG.ACTIVE_DECAY_WINDOW) this._activeSynapses.delete(key);
    }
    const recentActivations = this.brain.activationHistory.slice(-100);
    if (recentActivations.length < 10) return;
    const variance = this.calculateVariance(recentActivations.map(a => a.activations ? a.activations.size : 0));
    this.environmentStability = Math.max(0, Math.min(1, 1-(variance/50)));
    const f = Metacognition.frustration;
    let baseDecay;
    if (f >= MEMORY_CONFIG.FRUSTRATION_CRISIS || this.brain.nodes.size > MEMORY_CONFIG.MAX_NODES * 0.9) {
      this.decayRegime='CRISIS'; baseDecay=CFG.DECAY_CRITICAL;
    } else if (f >= MEMORY_CONFIG.FRUSTRATION_HIGH) {
      this.decayRegime='HIGH'; baseDecay=CFG.DECAY_DYNAMIC;
    } else if (f >= MEMORY_CONFIG.FRUSTRATION_MILD) {
      this.decayRegime='MILD'; baseDecay=CFG.DECAY_MILD;
    } else {
      this.decayRegime='STABLE'; baseDecay=CFG.DECAY_STABLE;
    }
    const now = Date.now();
    const snap = this.brain.lastSnapshot;
    if (snap) {
      for (const nodeId of snap.activations.keys()) {
        this.brain.synapses.forEach((syn, key) => {
          if (syn.source===nodeId||syn.target===nodeId) this._activeSynapses.set(key, currentCycle);
        });
      }
    }
    for (const [key] of this._activeSynapses) {
      const synapse = this.brain.synapses.get(key);
      if (!synapse||synapse.pruned){this._activeSynapses.delete(key);continue;}
      const cyclesInactive=(now-synapse.lastReinforced)/100;
      if(cyclesInactive<0.5)continue;
      const isOverfit=this.overfitClusters.has(synapse.source)||this.overfitClusters.has(synapse.target);
      const multiplier=isOverfit?CFG.OVERFIT_DECAY_MULT:1.0;
      const effectiveRate=Math.min(0.99,baseDecay*multiplier);
      synapse.weight*=Math.pow(1-effectiveRate,cyclesInactive);
      if(synapse.weight<CFG.MIN_RELEVANCE){
        synapse.pruned=true; synapse.prunedAt=now; synapse.prunedBy='decay_'+this.decayRegime.toLowerCase();
        this.brain.dirtySynapses.add(synapse); this._activeSynapses.delete(key);
      } else if(synapse.weight<0.3){
        synapse.weak=true;
        if(cyclesInactive>10)this._activeSynapses.delete(key);
      }
    }
    if(Date.now()-this.lastDecayReport>5000){
      console.log('[Decay] Regime:'+this.decayRegime+' | f='+f.toFixed(2)+' | activas='+this._activeSynapses.size);
      this.lastDecayReport=Date.now();
    }
  }

  checkOverfitting() {
    if(this.actionHistory.length<MEMORY_CONFIG.OVERFIT_ACTION_WINDOW)return;
    if(Date.now()-this.lastOverfitCheck<500)return;
    this.lastOverfitCheck=Date.now();
    const window=this.actionHistory.slice(-MEMORY_CONFIG.OVERFIT_ACTION_WINDOW);
    const f=Metacognition.frustration;
    const freq={};
    for(const entry of window)freq[entry.action]=(freq[entry.action]||0)+1;
    const [topAction,topCount]=Object.entries(freq).reduce((a,b)=>b[1]>a[1]?b:a,['',0]);
    const repeatRatio=topCount/window.length;
    const avgConf=window.reduce((s,e)=>s+e.confidence,0)/window.length;
    const isOverfitting=repeatRatio>=MEMORY_CONFIG.OVERFIT_REPEAT_RATIO&&avgConf>=MEMORY_CONFIG.OVERFIT_CONFIDENCE_THRESHOLD&&f>=MEMORY_CONFIG.FRUSTRATION_MILD;
    if(!isOverfitting){
      if(this.overfitClusters.size>0){const toRelease=[...this.overfitClusters].slice(0,2);toRelease.forEach(id=>this.overfitClusters.delete(id));}
      return;
    }
    const dominantNodes=Array.from(this.brain.nodes.values()).filter(n=>n.activation>0.5&&n.type!=='innate').sort((a,b)=>b.fireCount-a.fireCount).slice(0,10);
    dominantNodes.forEach(n=>this.overfitClusters.add(n.id));
    this.brain.synapses.forEach(syn=>{
      if(syn.pruned)return;
      if(this.overfitClusters.has(syn.source)||this.overfitClusters.has(syn.target)){
        syn.weight*=(1-MEMORY_CONFIG.DECAY_DYNAMIC*MEMORY_CONFIG.OVERFIT_DECAY_MULTIPLIER);
        if(syn.weight<MEMORY_CONFIG.MIN_RELEVANCE){syn.pruned=true;syn.prunedBy='anti_overfitting';this.brain.dirtySynapses.add(syn);}
      }
    });
    Metacognition.update({frustration:0.15,arousal:0.3});
    this.brain._overfitSignal={action:topAction,ratio:repeatRatio,cycle:this.brain.cycle,expiresAt:this.brain.cycle+CFG.OVERFIT_SIGNAL_TTL};
  }

  activateDormantNodes() {
    const f=Metacognition.frustration;
    if(f<MEMORY_CONFIG.FRUSTRATION_MILD)return;
    const allNodes=Array.from(this.brain.nodes.values());
    const dormant=allNodes.filter(n=>n.fireCount<=MEMORY_CONFIG.DORMANT_THRESHOLD&&n.type!=='innate'&&n.activation<0.1);
    if(dormant.length===0)return;
    const maxToActivate=Math.max(1,Math.floor(allNodes.length*MEMORY_CONFIG.DORMANT_SCAN_RATIO));
    const candidates=dormant.sort(()=>Math.random()-0.5).slice(0,maxToActivate);
    const boost=MEMORY_CONFIG.DORMANT_BONUS*f;
    candidates.forEach(node=>{node.activation=Math.min(1,node.activation+boost);node.lastFired=Date.now();this.brain.dirtyNodes.add(node);});
  }

  calculateVariance(values){
    const mean=values.reduce((a,b)=>a+b,0)/values.length;
    return values.reduce((sum,v)=>sum+Math.pow(v-mean,2),0)/values.length;
  }

  async cleanup(){
    const now=Date.now();
    const deadNodes=[];
    this.brain.nodes.forEach((node,id)=>{
      const cyclesSinceFire=(now-node.lastFired)/100;
      const connections=this.countConnections(id);
      if(cyclesSinceFire>MEMORY_CONFIG.SUBGRAPH_DEAD_CYCLES&&connections<MEMORY_CONFIG.MIN_SUBGRAPH_SIZE&&node.fireCount<5)deadNodes.push(id);
    });
    if(deadNodes.length>0){
      deadNodes.forEach(nodeId=>{
        this.brain.synapses.forEach((syn,key)=>{if(syn.source===nodeId||syn.target===nodeId)syn.pruned=true;});
      });
      deadNodes.forEach(id=>this.brain.nodes.delete(id));
    }
    const dirtySynapses=Array.from(this.brain.dirtySynapses).filter(s=>s.pruned);
    if(dirtySynapses.length>0)await Persistence.bulkDeleteSynapses(dirtySynapses.map(s=>s.id));
  }

  countConnections(nodeId){
    let count=0;
    this.brain.synapses.forEach(syn=>{if(!syn.pruned&&(syn.source===nodeId||syn.target===nodeId))count++;});
    return count;
  }

  async mergeSimilarNodes(){
    const merged=[];
    const groups=new Map();
    // PATCH: limita candidatos por grupo para evitar explosão O(n²)
    this.brain.nodes.forEach((node,id)=>{
      if(node.type==='innate')return;
      const hash=this.quickHash(node.signature.lexical||'');
      if(!groups.has(hash))groups.set(hash,[]);
      groups.get(hash).push({id,node});
    });
    for(const[hash,candidates]of groups){
      if(candidates.length<2)continue;
      if(candidates.length>8)candidates.length=8; // máx 8 por grupo
      for(let i=0;i<candidates.length;i++){
        for(let j=i+1;j<candidates.length;j++){
          const a=candidates[i],b=candidates[j];
          if(merged.includes(a.id)||merged.includes(b.id))continue;
          const similarity=this.calculateNodeSimilarity(a.node,b.node);
          if(similarity>MEMORY_CONFIG.MERGE_THRESHOLD){await this.mergeNodes(a.id,b.id,similarity);merged.push(a.id,b.id);}
        }
      }
    }
  }

  calculateNodeSimilarity(nodeA,nodeB){
    let score=0,factors=0;
    // Geometria: usa a similaridade ψ se disponível
    if(nodeA.signature.psi&&nodeB.signature.psi){
      score+=Persistence.calculateSimilarity(nodeA.signature,nodeB.signature);factors++;
    } else if(nodeA.signature.lexical&&nodeB.signature.lexical){
      const tA=new Set(nodeA.signature.lexical.toLowerCase().split(/\s+/));
      const tB=new Set(nodeB.signature.lexical.toLowerCase().split(/\s+/));
      score+=[...tA].filter(t=>tB.has(t)).length/Math.max(tA.size,tB.size);factors++;
    }
    const timeDiff=Math.abs(nodeA.lastFired-nodeB.lastFired);
    score+=Math.max(0,1-(timeDiff/10000));factors++;
    return score/factors;
  }

  async mergeNodes(idA,idB,similarity){
    const nodeA=this.brain.nodes.get(idA),nodeB=this.brain.nodes.get(idB);
    const dominant=nodeA.fireCount>nodeB.fireCount?nodeA:nodeB;
    const recessive=dominant===nodeA?nodeB:nodeA;
    // Merge das âncoras ψ (média ponderada pelo fireCount)
    if(dominant.signature.psi&&recessive.signature.psi){
      const wA=dominant.fireCount/(dominant.fireCount+recessive.fireCount);
      const wB=1-wA;
      const dTheta=recessive.signature.psi.theta-dominant.signature.psi.theta;
      const adjTheta=dTheta>180?dTheta-360:dTheta<-180?dTheta+360:dTheta;
      dominant.signature.psi={
        r:     dominant.signature.psi.r*wA+recessive.signature.psi.r*wB,
        theta: (dominant.signature.psi.theta+adjTheta*wB+360)%360,
        z:     dominant.signature.psi.z*wA+recessive.signature.psi.z*wB,
        morphClass: dominant.signature.psi.morphClass,
        W_lex: dominant.signature.psi.W_lex,
        form:  dominant.signature.psi.form,
      };
      // Re-indexa na KD-Tree
      globalKDTree.insert(dominant.signature.psi, dominant.id, dominant.signature.lexical||'');
      globalKDTree._dirty=true;
    }
    // Reaponta sinapses do recessivo para o dominante
    this.brain.synapses.forEach((syn,key)=>{
      if(syn.source===recessive.id){syn.source=dominant.id;this.brain.dirtySynapses.add(syn);}
      if(syn.target===recessive.id){syn.target=dominant.id;this.brain.dirtySynapses.add(syn);}
    });
    this.brain.nodes.delete(recessive.id);
    this.brain.dirtyNodes.add(dominant);
    Persistence.saveNode(dominant);
  }

  quickHash(str){return str.split('').reduce((a,b)=>((a<<5)-a)+b.charCodeAt(0),0)%1000;}
}

// ============================================================================
// EXTRACTOR DE TOKENS SEMÂNTICOS v1.0 — estende o original com classificação ψ
// ============================================================================
const SemanticTokenizer = (() => {
  const STOPWORDS = new Set([
    'de','a','o','e','da','do','em','que','para','com','uma','um','os','as',
    'dos','das','no','na','por','se','ao','mais','mas','ou','é','são','foi',
    'ser','ter','esta','este','isso','aqui','ali','já','ainda','também',
    'the','of','and','to','in','is','that','for','on','are','with','as'
  ]);
  const NEGATION_TRIGGERS = new Set([
    'não','nem','nunca','jamais','nenhum','nenhuma','sem','impossível',
    'falso','errado','incorreto','no','not','never','none','without','false'
  ]);
  const INTENSIFIERS = new Set([
    'muito','bastante','extremamente','totalmente','completamente','sempre',
    'absolutamente','definitivamente','certamente','obviously','always','very'
  ]);
  const HEDGES = new Set([
    'talvez','possivelmente','provavelmente','quase','cerca','aproximadamente',
    'às vezes','raramente','maybe','possibly','probably','sometimes','nearly'
  ]);
  const CAUSALITY_MARKERS = new Set([
    'porque','portanto','logo','então','consequentemente','assim','pois',
    'resulta','implica','causa','because','therefore','thus','hence','implies'
  ]);
  const ENTITY_PATTERNS = [
    { type: 'NUMBER',  regex: /^-?\d+([.,]\d+)?(%|kg|km|m|s|ms)?$/ },
    { type: 'ACRONYM', regex: /^[A-Z]{2,6}$/ },
    { type: 'PROPER',  regex: /^[A-ZÁÉÍÓÚÀÂÊÔ][a-záéíóúàâêô]{2,}$/ },
    { type: 'URL',     regex: /^https?:\/\/.+|^\S+@\S+\.\S+$/ }
  ];

  function extract(text) {
    if (typeof text !== 'string' || !text.trim()) return [];
    const rawTokens = text.normalize('NFD').split(/[\s,;.!?()\[\]{}"]+/).filter(t=>t.length>0);
    const tokens = [];
    let positionInNegation = -1;

    for (let i = 0; i < rawTokens.length; i++) {
      const raw  = rawTokens[i];
      const form = raw.toLowerCase().replace(/[^a-záéíóúàâêôãõüç0-9%]/g,'');
      if (!form) continue;

      const isStop   = STOPWORDS.has(form);
      const isNeg    = NEGATION_TRIGGERS.has(form);
      const isIntens = INTENSIFIERS.has(form);
      const isHedge  = HEDGES.has(form);
      const isCausal = CAUSALITY_MARKERS.has(form);

      let entityType = null;
      for (const p of ENTITY_PATTERNS) { if(p.regex.test(raw)){entityType=p.type;break;} }

      let semanticWeight = isStop ? 0.05 : 0.5;
      if (!isStop && !isNeg) {
        if (isIntens)      semanticWeight = 0.85;
        else if (isHedge)  semanticWeight = 0.35;
        else if (isCausal) semanticWeight = 0.90;
        else if (entityType==='PROPER'||entityType==='ACRONYM') semanticWeight = 0.95;
        else if (entityType==='NUMBER') semanticWeight = 0.70;
        else semanticWeight = 0.60;
      }

      if (isNeg) positionInNegation = 3;
      const underNegation = positionInNegation > 0 && !isNeg;
      if (underNegation) positionInNegation--;

      const token = {
        raw, form, position: i,
        roles: { isStop, isNeg, isIntens, isHedge, isCausal, underNegation, entityType },
        semanticWeight,
        negationChain: null,
        psi: null, // será preenchido abaixo
      };

      // ── ÂNCORA GEOMÉTRICA REAL ψ(w) ───────────────────────────────────────
      token.psi = anchorPsi(token);

      tokens.push(token);
    }

    return tokens;
  }

  function cluster(tokens, threshold = 0.88) {
    const meaningful = tokens.filter(t => !t.roles.isStop && t.semanticWeight > 0.4);
    const clusters = [];
    const assigned = new Set();

    for (let i = 0; i < meaningful.length; i++) {
      if (assigned.has(i)) continue;
      const group = [meaningful[i]];
      assigned.add(i);
      for (let j = i+1; j < meaningful.length; j++) {
        if (assigned.has(j)) continue;
        // Similaridade geométrica entre âncoras ψ
        if (meaningful[i].psi && meaningful[j].psi) {
          const sim = Persistence.calculateSimilarity(
            { psi: meaningful[i].psi },
            { psi: meaningful[j].psi }
          );
          if (sim >= threshold) { group.push(meaningful[j]); assigned.add(j); }
        }
      }
      clusters.push({
        centroid: group[0].form,
        members:  group.map(t=>t.form),
        weight:   group.reduce((s,t)=>s+t.semanticWeight,0)/group.length,
        hasNegation: group.some(t=>t.roles.underNegation||t.roles.isNeg),
        psi:      group[0].psi, // âncora do centróide
      });
    }
    return clusters;
  }

  function extractCausalPairs(tokens) {
    const pairs = [];
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].roles.isCausal && i > 0 && i < tokens.length-1) {
        const cause  = tokens.slice(Math.max(0,i-3),i).filter(t=>!t.roles.isStop).map(t=>t.form);
        const effect = tokens.slice(i+1,Math.min(tokens.length,i+4)).filter(t=>!t.roles.isStop).map(t=>t.form);
        if (cause.length && effect.length) pairs.push({ cause, marker: tokens[i].form, effect, position: i });
      }
    }
    return pairs;
  }

  // ── Síntese geométrica de uma frase completa ─────────────────────────────
  // Aplica as operações do manifesto sobre a sequência de tokens:
  // Sujeito ⊗ Verbo → ponto resultante
  // Modificadores aplicam SLERP sobre o ponto base
  // Devolve o ponto ψ da frase inteira
  function synthesizePhraseGeometry(tokens, contextoAgente) {
    const meaningful = tokens.filter(t => !t.roles.isStop && t.psi && t.psi.r > 0.05);
    if (meaningful.length === 0) return null;
    if (meaningful.length === 1) return meaningful[0].psi;

    // Identifica sujeito (quadrante 0°–90°) e predicado (90°–180°)
    let sujeito    = meaningful.find(t => t.psi.theta >= 0   && t.psi.theta < 90);
    let predicado  = meaningful.find(t => t.psi.theta >= 90  && t.psi.theta < 180);
    const mods     = meaningful.filter(t => t.psi.theta >= 180 && t.psi.theta < 360);

    // Fallback: se não há sujeito/predicado claros, usa o token de maior r e o segundo
    if (!sujeito)   sujeito   = meaningful.reduce((a,b) => a.psi.r > b.psi.r ? a : b);
    if (!predicado) predicado = meaningful.find(t => t !== sujeito) || sujeito;

    // Convolução Sujeito ⊗ Predicado
    let psiResultante = operateCylindrical(sujeito.psi, predicado.psi, contextoAgente);

    // Aplica SLERP para cada modificador
    for (const mod of mods) {
      const peso = mod.psi.r * 0.3; // peso do modificador proporcional à sua densidade
      psiResultante = slerpCylindrical(psiResultante, mod.psi, peso);
    }

    return psiResultante;
  }

  return { extract, cluster, extractCausalPairs, synthesizePhraseGeometry };
})();

// ============================================================================
// GRAFO DE NEGAÇÃO v0.5 — inalterado, funciona sobre os tokens com psi
// ============================================================================
class NegationGraph {
  constructor() {
    this.nodes = new Map();
    this.edges = new Map();
    this.cycle = 0;
    this._contradictionLog = [];
  }

  ingest(semanticTokens) {
    this.cycle++;
    const created = [], negated = [];
    for (const tok of semanticTokens) {
      if (tok.roles.isStop) continue;
      const polarity = tok.roles.underNegation ? -1 : 1;
      const nodeId   = this._nodeId(tok.form, polarity);
      if (!this.nodes.has(nodeId)) {
        this.nodes.set(nodeId, {
          id: nodeId, concept: tok.form, polarity,
          weight: tok.semanticWeight,
          psi: tok.psi,   // preserva a âncora geométrica
          sources: new Set([this.cycle]),
          contradicts: new Set(),
          firstSeen: this.cycle, lastSeen: this.cycle, fireCount: 1
        });
        created.push(nodeId);
      } else {
        const n = this.nodes.get(nodeId);
        n.weight = Math.min(1, n.weight + tok.semanticWeight * 0.1);
        n.sources.add(this.cycle); n.lastSeen = this.cycle; n.fireCount++;
        // Actualiza psi se o novo peso semântico for maior
        if (tok.psi && tok.semanticWeight > (n.psi ? n.psi.r : 0)) n.psi = tok.psi;
      }
      tok.negationChain = nodeId;
      if (polarity === -1) negated.push(nodeId);
    }
    for (const negId of negated) {
      const negNode = this.nodes.get(negId);
      const posId   = this._nodeId(negNode.concept, +1);
      if (this.nodes.has(posId)) {
        this._addEdge(negId, posId, 'contradicts', 1.0);
        this._addEdge(posId, negId, 'contradicts', 1.0);
        negNode.contradicts.add(posId);
        this.nodes.get(posId).contradicts.add(negId);
        this._logContradiction(negNode.concept, this.cycle);
      }
    }
    const causalPairs = SemanticTokenizer.extractCausalPairs(semanticTokens);
    for (const pair of causalPairs) {
      for (const c of pair.cause) for (const e of pair.effect) {
        const srcId = this._nodeId(c,+1), tgtId = this._nodeId(e,+1);
        if (this.nodes.has(srcId)&&this.nodes.has(tgtId)) this._addEdge(srcId,tgtId,'implies',0.8);
      }
    }
    for (const tok of semanticTokens) {
      if (tok.roles.isIntens && tok.position < semanticTokens.length-1) {
        const nextTok = semanticTokens[tok.position+1];
        if (nextTok) {
          const src = this._nodeId(tok.form,+1);
          const tgt = this._nodeId(nextTok.form, nextTok.roles.underNegation ? -1 : +1);
          if (this.nodes.has(src)&&this.nodes.has(tgt)) this._addEdge(src,tgt,'amplifies',0.7);
        }
      }
    }
    return { created, contradictionsFound: this._contradictionLog.slice(-5) };
  }

  getContradictions() {
    const contradictions = [];
    for (const node of this.nodes.values()) {
      if (node.polarity===-1&&node.contradicts.size>0) {
        const posNode = this.nodes.get(this._nodeId(node.concept,+1));
        if (posNode) contradictions.push({
          concept: node.concept,
          positiveWeight: posNode.weight, negativeWeight: node.weight,
          tension: Math.min(posNode.weight,node.weight),
          firstContradiction: node.firstSeen
        });
      }
    }
    return contradictions.sort((a,b)=>b.tension-a.tension);
  }

  summarize() {
    const pos=[...this.nodes.values()].filter(n=>n.polarity===+1).length;
    const neg=[...this.nodes.values()].filter(n=>n.polarity===-1).length;
    const contradictions=this.getContradictions();
    return { totalNodes:this.nodes.size, affirmations:pos, negations:neg, contradictions:contradictions.length, topContradictions:contradictions.slice(0,3), edgeCount:this.edges.size, cycle:this.cycle };
  }

  decay(currentCycle, halfLife=200) {
    const toDelete=[];
    for(const [id,node] of this.nodes){
      if(node.polarity===-1||node.fireCount<3){
        const age=currentCycle-node.lastSeen;
        node.weight*=Math.pow(0.5,age/halfLife);
        if(node.weight<0.02)toDelete.push(id);
      }
    }
    for(const id of toDelete){
      this.nodes.delete(id);
      for(const key of this.edges.keys()){const[s,t]=key.split('::');if(s===id||t===id)this.edges.delete(key);}
    }
    return toDelete.length;
  }

  subgraphFor(concepts) {
    const result={nodes:[],edges:[]};
    const conceptSet=new Set(concepts.map(c=>c.toLowerCase()));
    for(const node of this.nodes.values())if(conceptSet.has(node.concept))result.nodes.push({...node,sources:[...node.sources],contradicts:[...node.contradicts]});
    const nodeIds=new Set(result.nodes.map(n=>n.id));
    for(const [key,edge] of this.edges){const[src,tgt]=key.split('::');if(nodeIds.has(src)&&nodeIds.has(tgt))result.edges.push({src,tgt,...edge});}
    return result;
  }

  _nodeId(concept,polarity){return(polarity===-1?'NEG::':'POS::')+concept;}
  _addEdge(srcId,tgtId,type,weight){
    const key=srcId+'::'+tgtId, existing=this.edges.get(key);
    if(existing){existing.weight=Math.min(1,existing.weight+weight*0.05);existing.reinforced=(existing.reinforced||1)+1;}
    else this.edges.set(key,{type,weight,reinforced:1,created:this.cycle});
  }
  _logContradiction(concept,cycle){
    this._contradictionLog.push({concept,cycle,ts:Date.now()});
    if(this._contradictionLog.length>50)this._contradictionLog.shift();
  }
}

const negationGraph = new NegationGraph();

// ============================================================================
// NEURAL GRAPH — fundação geométrica real
// createNode agora calcula e persiste ψ(w) para cada nó
// findSimilarLocal usa distância euclidiana no espaço cilíndrico
// activate usa ressonância geométrica
// ============================================================================
class NeuralGraph {
  constructor() {
    this.nodes = new Map();
    this.synapses = new Map();
    this.activationHistory = [];
    this.lastSnapshot = null;
    this.dirtyNodes = new Set();
    this.dirtySynapses = new Set();
    this.memoryManager = new MemoryManager(this);
    this.cycle = 0;
  }

  async loadFromDB() {
    const { nodes, synapses } = await Persistence.loadGraph();
    nodes.forEach(n => {
      n.x = n.x || Math.random() * 800;
      n.y = n.y || Math.random() * 600;
      // Re-indexa nós com ψ na KD-Tree ao carregar
      if (n.signature && n.signature.psi) {
        globalKDTree.insert(n.signature.psi, n.id, n.signature.lexical || '');
      }
      this.nodes.set(n.id, n);
    });
    synapses.forEach(s => this.synapses.set(s.source + '→' + s.target, s));
    globalKDTree._dirty = true;
    await this.memoryManager.manage();
    return { nodeCount: nodes.length, synapseCount: synapses.length };
  }

  // Cria nó com identidade geométrica real
  // signature deve conter: { lexical, tokens, psiTokens? }
  // psiTokens: array de tokens com .psi já calculado pelo SemanticTokenizer
  createNode(signature, type = 'emergent', layer = 0) {
    if (signature.lexical && this.nodes.size > 100) {
      const similar = this.findSimilarLocal(signature);
      if (similar && similar.similarity > 0.9) {
        const existing = this.nodes.get(similar.id);
        existing.fireCount++;
        existing.lastFired = Date.now();
        return existing;
      }
    }

    // Calcula o ψ representativo do nó: ψ da frase inteira se houver tokens
    let nodePsi = null;
    if (signature.psiTokens && signature.psiTokens.length > 0) {
      // Usa o token de maior peso semântico como âncora primária do nó
      const primary = signature.psiTokens.reduce((a,b) =>
        (a.semanticWeight||0) > (b.semanticWeight||0) ? a : b
      );
      nodePsi = primary.psi || null;
    } else if (signature.psi) {
      nodePsi = signature.psi;
    }

    const id = 'n_' + Date.now() + '_' + Math.random().toString(36).substr(2,9);
    const node = {
      id, type, layer,
      signature: { ...signature, psi: nodePsi },
      weight: type === 'innate' ? 1.0 : 0.1,
      activation: 0, lastFired: 0, fireCount: 0,
      x: Math.random() * 800, y: Math.random() * 600,
      created: Date.now(),
    };

    // Indexa na KD-Tree geométrica
    if (nodePsi) {
      globalKDTree.insert(nodePsi, id, signature.lexical || '');
      globalKDTree._dirty = true;
    }

    this.nodes.set(id, node);
    this.dirtyNodes.add(node);
    Persistence.saveNode(node);
    this._outIdx = null;
    return node;
  }

  _buildOutIdx() {
    this._outIdx = new Map();
    for (const [key, syn] of this.synapses) {
      if (syn.pruned) continue;
      if (!this._outIdx.has(syn.source)) this._outIdx.set(syn.source, new Set());
      this._outIdx.get(syn.source).add(key);
    }
  }

  // Busca por vizinhança geométrica real — O(log n) via KD-Tree
  findSimilarLocal(signature) {
    // Se temos geometria, usa KD-Tree
    if (signature.psi && globalKDTree.size() > 0) {
      const nearest = globalKDTree.nearest(signature.psi);
      if (nearest) {
        const node = this.nodes.get(nearest.nodeId);
        if (node && node.signature && node.signature.psi) {
          const similarity = Persistence.calculateSimilarity(signature, node.signature);
          return { id: nearest.nodeId, similarity };
        }
      }
    }
    // Fallback: scan com similaridade geométrica ou lexical
    let best = null, bestSim = 0;
    this.nodes.forEach((node, id) => {
      if (node.type === 'innate') return;
      const sim = Persistence.calculateSimilarity(signature, node.signature);
      if (sim > bestSim) { bestSim = sim; best = { id, similarity: sim }; }
    });
    return best;
  }

  // Ressonância geométrica: quão próximo o input está do nó no espaço ψ
  calculateResonance(input, signature) {
    if (typeof input === 'string' && signature && signature.psi) {
      // Extrai tokens do input e calcula ψ da frase
      const tokens = SemanticTokenizer.extract(input);
      if (tokens.length > 0) {
        const phraseGeom = SemanticTokenizer.synthesizePhraseGeometry(tokens, {
          W_estado: { log: 0.25, emoc: 0.25, abs: 0.25, inf: 0.25 },
          frustration: Metacognition.frustration,
        });
        if (phraseGeom) {
          return Persistence.calculateSimilarity(
            { psi: phraseGeom },
            { psi: signature.psi }
          );
        }
      }
    }
    // Fallback lexical
    if (typeof input === 'string' && signature && signature.lexical) {
      const inputTokens = new Set(input.toLowerCase().split(/\s+/));
      const sigTokens   = new Set(signature.lexical.toLowerCase().split(/\s+/));
      const inter = [...inputTokens].filter(t=>sigTokens.has(t)).length;
      return inter / Math.max(inputTokens.size, sigTokens.size, 1);
    }
    return 0;
  }

  activate(sensorialInput, depth = 4) {
    this.cycle++;
    const activated = new Set();
    const queue = [];
    const snapshot = { timestamp: Date.now(), activations: new Map() };

    this.nodes.forEach(node => {
      if (node.weight < MEMORY_CONFIG.MIN_RELEVANCE && node.type !== 'innate') return;
      const resonance = this.calculateResonance(sensorialInput, node.signature);
      if (resonance > CFG.RESONANCE_THRESH) {
        node.activation = resonance * node.weight;
        node.lastFired = Date.now(); node.fireCount++;
        activated.add(node.id);
        queue.push({ node, level: 0, intensity: node.activation });
        snapshot.activations.set(node.id, node.activation);
        this.dirtyNodes.add(node);
      }
    });

    if (!this._outIdx) this._buildOutIdx();

    const propagations = [];
    while (queue.length > 0) {
      const current = queue.shift();
      if (current.level >= CFG.PROPAGATION_DEPTH) continue;
      const outKeys = this._outIdx.get(current.node.id);
      if (!outKeys) continue;
      const attenuation = Math.exp(-current.level * CFG.ATTENUATION);
      for (const key of outKeys) {
        const synapse = this.synapses.get(key);
        if (!synapse||synapse.pruned||synapse.weight<CFG.MIN_RELEVANCE) continue;
        const target = this.nodes.get(synapse.target);
        if (!target||target.activation>0.9) continue;
        const propagated = current.intensity * synapse.weight * attenuation;
        if (propagated > CFG.ACT_THRESHOLD) {
          target.activation = Math.min(1, target.activation + propagated * 0.5);
          if (!activated.has(target.id)) {
            activated.add(target.id);
            queue.push({ node: target, level: current.level+1, intensity: propagated });
            this.dirtyNodes.add(target);
          }
          propagations.push({ from: synapse.source, to: synapse.target, intensity: propagated });
          synapse.activationCount = (synapse.activationCount||0)+1;
        }
      }
    }

    this.lastSnapshot = snapshot;
    this.activationHistory.push({ cycle: this.cycle, snapshot, propagations, timestamp: Date.now(), inputSize: typeof sensorialInput==='string'?sensorialInput.length:0 });
    if (this.activationHistory.length > 50) this.activationHistory.shift();
    if (this.cycle % 10 === 0) this.memoryManager.manage();

    return {
      activated: Array.from(activated).map(id => this.nodes.get(id)),
      propagations,
      dominant: this.findDominant(activated),
      stats: { totalNodes: this.nodes.size, activeNodes: activated.size, prunedSynapses: Array.from(this.synapses.values()).filter(s=>s.pruned).length }
    };
  }

  findDominant(activatedIds) {
    let max = null;
    activatedIds.forEach(id => {
      const node = this.nodes.get(id);
      if (!max || node.activation > max.activation) max = node;
    });
    return max;
  }

  pruneLastConnections(intensity = 0.9) {
    if (!this.lastSnapshot) return 0;
    let pruned = 0;
    this.synapses.forEach((synapse, key) => {
      if (this.lastSnapshot.activations.has(synapse.source)||this.lastSnapshot.activations.has(synapse.target)) {
        synapse.weight *= (1-intensity);
        if (synapse.weight < 0.05) { synapse.pruned=true; synapse.prunedAt=Date.now(); pruned++; this.dirtySynapses.add(synapse); }
      }
    });
    return pruned;
  }

  hebbianConnect(sourceId, targetId, intensity = 0.1) {
    if (sourceId===targetId) return;
    const key = sourceId + '→' + targetId;
    const existing = this.synapses.get(key);
    if (existing) {
      existing.weight = Math.min(1, existing.weight + intensity * (1-existing.weight));
      existing.lastReinforced = Date.now();
      if (this.memoryManager._activeSynapses) this.memoryManager._activeSynapses.set(key, this.cycle);
      return;
    }
    let outDegree = 0;
    for (const [k] of this.synapses) {
      if (k.startsWith(sourceId+'→') && !this.synapses.get(k).pruned) outDegree++;
    }
    if (outDegree >= CFG.MAX_SYNAPSES_NODE) {
      let weakestKey=null, weakestW=Infinity;
      for (const [k,s] of this.synapses) {
        if (k.startsWith(sourceId+'→')&&!s.pruned&&s.weight<weakestW){weakestW=s.weight;weakestKey=k;}
      }
      if (weakestKey) {
        const ws=this.synapses.get(weakestKey);
        ws.pruned=true; ws.prunedBy='degree_limit'; ws.prunedAt=Date.now();
        this.dirtySynapses.add(ws);
        if (this.memoryManager._activeSynapses) this.memoryManager._activeSynapses.delete(weakestKey);  // Map.delete ok
      }
    }
    const synapse = { source: sourceId, target: targetId, weight: intensity, created: Date.now(), lastReinforced: Date.now(), pruned: false };
    this.synapses.set(key, synapse);
    this.dirtySynapses.add(synapse);
    Persistence.saveSynapse(synapse);
    if (this.memoryManager._activeSynapses) this.memoryManager._activeSynapses.set(key, this.cycle);
  }

  getSyncData() {
    const data = {
      nodes:    Array.from(this.dirtyNodes),
      synapses: Array.from(this.dirtySynapses).filter(s=>!s.pruned),
      pruned:   Array.from(this.dirtySynapses).filter(s=>s.pruned)
    };
    this.dirtyNodes.clear(); this.dirtySynapses.clear();
    return data;
  }

  getStats() {
    const active = Array.from(this.synapses.values()).filter(s=>!s.pruned);
    const byType = { innate:0, emergent:0, abstract:0 };
    this.nodes.forEach(n=>{byType[n.type]=(byType[n.type]||0)+1;});
    const now = Date.now();
    const activeNodes = Array.from(this.nodes.values()).filter(n=>(now-n.lastFired)<2000).length;
    return { nodes:this.nodes.size, synapses:active.length, pruned:this.synapses.size-active.length, density:active.length/Math.max(1,this.nodes.size), byType, activeNodes, kdTreeSize: globalKDTree.size() };
  }
}

// ============================================================================
// METACOGNIÇÃO E LOBOS — inalterados, funcionam correctamente
// ============================================================================
const Metacognition = {
  arousal: 0.5, frustration: 0.0, confidence: 0.5, age: 0, surprise: 0.0,
  // W_estado: tensor de estado emocional do agente (usado nas operações geométricas)
  W_estado: { log: 0.4, emoc: 0.2, abs: 0.2, inf: 0.2 },

  update(delta) {
    this.age++;
    this.arousal     = Math.max(0, Math.min(1, this.arousal     + (delta.arousal     || 0)));
    this.frustration = Math.max(0, Math.min(1, this.frustration + (delta.frustration || 0))) * 0.95;
    this.confidence  = Math.max(0, Math.min(1, this.confidence  + (delta.confidence  || 0)));
    // Actualiza W_estado baseado na metacognição
    this.W_estado = {
      log:  Math.max(0.1, 0.4  - this.frustration * 0.2),
      emoc: Math.min(0.6, 0.2  + this.frustration * 0.4),
      abs:  Math.max(0.1, 0.2  - this.arousal     * 0.1),
      inf:  Math.min(0.5, 0.2  + (1-this.confidence) * 0.3),
    };
    Persistence.saveMetacognition(this);
    return this;
  },

  isMature()   { return this.age > 5000; },
  isPanicking() { return this.frustration > 0.7; },
};

function serializeMeta() {
  return {
    arousal:     Metacognition.arousal,
    frustration: Metacognition.frustration,
    confidence:  Metacognition.confidence,
    age:         Metacognition.age,
    W_estado:    Metacognition.W_estado,
    isMature:    Metacognition.isMature(),
    isPanicking: Metacognition.isPanicking(),
    surprise:    Metacognition.surprise || 0,
    contextPsi:  ContextualInertia.getContextPsi(),
  };
}

const LoboEmergente = {
  brain: null,
  init(brain) { this.brain = brain; },
  propose(sensoryInput) {
    const activation = this.brain.activate(sensoryInput);
    return {
      type: 'emergent',
      confidence: activation.dominant ? activation.dominant.activation : 0.1,
      action: activation.dominant?.fireCount > 10 ? 'exploit' : 'explore',
      vector: {
        explore:  activation.activated.length < 3 ? 0.7 : 0.2,
        exploit:  activation.dominant?.fireCount > 5 ? 0.8 : 0.3,
        wait:     activation.dominant ? 0.1 : 0.6,
        create:   activation.propagations.length > 10 ? 0.5 : 0.2
      }
    };
  },
  pruneLastConnections(intensity) { return this.brain.pruneLastConnections(intensity); }
};

const LoboInferencial = {
  propose(sensoryInput) {
    const text = typeof sensoryInput==='string' ? sensoryInput : '';
    const hasContradiction = /(sim.*não|não.*sim|sempre.*nunca|todos.*nenhum)/i.test(text);
    return {
      type: 'inferential',
      confidence: hasContradiction ? 0.2 : 0.8,
      action: hasContradiction ? 'reject' : 'proceed',
      vector: { proceed: hasContradiction?0.1:0.9, verify: hasContradiction?0.3:0.2, reject: hasContradiction?0.8:0.1, wait:0.1 }
    };
  }
};

const LoboFuzzy = {
  propose(sensoryInput) {
    const text = typeof sensoryInput==='string' ? sensoryInput.toLowerCase() : '';
    const urgency = /(urgente|agora|rápido|!{2,})/.test(text) ? 0.9 : 0.1;
    const doubt   = /(talvez|possivelmente|não sei)/.test(text) ? 0.8 : 0.2;
    return {
      type: 'fuzzy', confidence: 0.6,
      action: urgency>0.5 ? 'accelerate' : doubt>0.5 ? 'explore' : 'wait',
      vector: { accelerate: urgency*0.9, explore: doubt*0.8, wait:0.2, empathize: /(medo|ajuda|socorro)/.test(text)?0.7:0.1 }
    };
  }
};

const LoboAxiomas = {
  axioms: [
    { id: 'non_contradiction', check: (s) => !/(sim.*não|não.*sim)/i.test(s), weight: 0.95 },
    { id: 'identity', check: (s) => true, weight: 0.9 }
  ],
  evaluate(input) {
    const text = typeof input==='string' ? input : '';
    const violations = this.axioms.filter(a=>!a.check(text)).map(a=>({axiom:a.id,weight:a.weight,source:'regex'}));
    const structuralContradictions = negationGraph.getContradictions();
    for (const c of structuralContradictions) {
      if (c.tension > 0.35) violations.push({ axiom:'structural_negation:'+c.concept, weight:Math.min(0.99,c.tension+0.2), source:'negation_graph', concept:c.concept, tension:c.tension });
    }
    return { valid: violations.length===0, violations, intensity: violations.length>0?Math.max(...violations.map(v=>v.weight)):0, structural: structuralContradictions.length };
  }
};

// ============================================================================
// TÁLAMO ORQUESTRADOR
// ============================================================================
class ThalamicLobe {
  constructor() {
    this.lobes = { axioms:LoboAxiomas, emergent:LoboEmergente, inferential:LoboInferencial, fuzzy:LoboFuzzy };
    this.attentionWeights = { emergent:0.4, inferential:0.4, fuzzy:0.2 };
    this.lastZap = 0;
  }
  process(sensoryInput) {
    const axiomCheck = this.lobes.axioms.evaluate(sensoryInput);
    if (!axiomCheck.valid && Date.now()-this.lastZap>500) return this.triggerZap(axiomCheck);
    const proposals = {
      emergent:    this.lobes.emergent.propose(sensoryInput),
      inferential: this.lobes.inferential.propose(sensoryInput),
      fuzzy:       this.lobes.fuzzy.propose(sensoryInput)
    };
    this.adjustAttention();
    return this.synthesize(proposals);
  }
  triggerZap(violation) {
    this.lastZap = Date.now();
    const pruned = this.lobes.emergent.pruneLastConnections(violation.intensity*0.9);
    Metacognition.update({ frustration:0.3, arousal:0.2 });
    return { type:'zap', action:'STOP_RECALIBRATE', violations:violation.violations, pruned, recalibrationTime:500+(violation.intensity*1000) };
  }
  adjustAttention() {
    const f = Metacognition.frustration;
    if (f >= MEMORY_CONFIG.FRUSTRATION_CRISIS) {
      this.attentionWeights = { fuzzy:0.70, inferential:0.20, emergent:0.10 };
    } else if (f >= MEMORY_CONFIG.FRUSTRATION_HIGH) {
      const fNorm=(f-MEMORY_CONFIG.FRUSTRATION_HIGH)/(MEMORY_CONFIG.FRUSTRATION_CRISIS-MEMORY_CONFIG.FRUSTRATION_HIGH);
      this.attentionWeights = { fuzzy:0.45+fNorm*0.25, inferential:0.30-fNorm*0.10, emergent:0.25-fNorm*0.15 };
    } else if (f >= MEMORY_CONFIG.FRUSTRATION_MILD) {
      const fNorm=(f-MEMORY_CONFIG.FRUSTRATION_MILD)/(MEMORY_CONFIG.FRUSTRATION_HIGH-MEMORY_CONFIG.FRUSTRATION_MILD);
      this.attentionWeights = { fuzzy:0.20+fNorm*0.25, inferential:0.45-fNorm*0.15, emergent:0.35-fNorm*0.10 };
    } else {
      this.attentionWeights = { inferential:0.50, emergent:0.35, fuzzy:0.15 };
    }
    const overfitSignal = brain._overfitSignal;
    if (overfitSignal && brain.cycle < overfitSignal.expiresAt) {
      this.attentionWeights.emergent *= 0.5;
      const gain = (1-this.attentionWeights.emergent-this.attentionWeights.fuzzy-this.attentionWeights.inferential);
      this.attentionWeights.fuzzy       += gain*0.6;
      this.attentionWeights.inferential += gain*0.4;
    }
    const sum = Object.values(this.attentionWeights).reduce((a,b)=>a+b,0);
    Object.keys(this.attentionWeights).forEach(k=>this.attentionWeights[k]/=sum);
  }
  synthesize(proposals) {
    const actions = ['explore','exploit','wait','create','proceed','reject','accelerate','empathize'];
    const combined = {};
    actions.forEach(action => {
      combined[action] = Object.entries(proposals).reduce((sum,[lobe,prop]) => sum+(prop.vector[action]||0)*this.attentionWeights[lobe], 0);
    });
    const winner = Object.entries(combined).reduce((a,b)=>a[1]>b[1]?a:b);
    const dominant = Object.entries(proposals).reduce((a,b)=>
      (b[1].vector[winner[0]]||0)*this.attentionWeights[b[0]] > (a[1].vector[winner[0]]||0)*this.attentionWeights[a[0]] ? b : a
    )[0];
    return {
      type:'synthesis', action:winner[0],
      confidence: winner[1]/Object.values(combined).reduce((a,b)=>a+b,0),
      dominantLobe:dominant, attentionWeights:{...this.attentionWeights},
      proposals: {
        emergent:    { action:proposals.emergent.action,    conf:proposals.emergent.confidence },
        inferential: { action:proposals.inferential.action, conf:proposals.inferential.confidence },
        fuzzy:       { action:proposals.fuzzy.action,       conf:proposals.fuzzy.confidence },
      }
    };
  }
}

// ============================================================================
// RESPONSE SYNTHESIZER GEOMÉTRICO — colapso real via KD-Tree
// Substitui completamente os templates. O sistema gera linguagem a partir da
// geometria, não de strings pré-escritas.
// ============================================================================
const ResponseSynthesizer = (() => {

  // Detecta língua por heurística simples
  function detectLang(text) {
    const ptMarkers = /\b(de|o|a|que|em|para|com|não|uma|um|por|mais|mas|ou|é|são|foi|ser|ter|esta|este|isso|já|ainda|também|porque|então|portanto)\b/gi;
    const ptCount = (text.match(ptMarkers)||[]).length;
    return ptCount >= 2 ? 'pt' : 'en';
  }

  // Verifica homeostase: r ≈ 0 → incoerência
  function checkHomeostasis(psi) {
    return psi && psi.r >= CFG.PSI_HOMEOSTASIS_R;
  }

  // Colapso real: dado um ponto ψ resultante, encontra a palavra/conceito
  // mais próximo no espaço geométrico via KD-Tree.
  // Se a KD-Tree estiver vazia ou o colapso falhar, devolve null (sem alucinação).
  function collapseToWord(psiResultante) {
    if (!psiResultante) return null;
    if (!checkHomeostasis(psiResultante)) return null; // incoerência — recusa output
    if (globalKDTree.size() === 0) return null;

    const nearest = globalKDTree.nearest(psiResultante);
    if (!nearest) return null;
    return nearest.form || nearest.nodeId || null;
  }

  // Colapsa para os N conceitos mais próximos
  function collapseToN(psiResultante, n = 3) {
    if (!psiResultante || !checkHomeostasis(psiResultante)) return [];
    if (globalKDTree.size() === 0) return [];
    return globalKDTree.nearestN(psiResultante, n).map(p => p.form || p.nodeId);
  }

  // Gera a resposta real a partir da geometria da frase de input
  // O processo:
  // 1. Extrai tokens e calcula ψ de cada um
  // 2. Sintetiza a geometria da frase (Sujeito ⊗ Predicado + mods)
  // 3. Colapsa o ponto resultante → conceitos via KD-Tree
  // 4. Constrói a resposta a partir dos conceitos colapsados + decisão do tálamo
  function synthesize(opts) {
    const {
      input, decision, activation, semantic, negation, regime, cycle,
    } = opts;
    const lang = detectLang(input || '');

    // ── Verifica contradição prioritária ────────────────────────────────────
    const threshold = 0.55;
    const topContra = negation?.contradictions?.[0];
    if (topContra && (topContra.tension || 0) >= threshold) {
      const tensionPct = Math.round((topContra.tension || 0) * 100);
      const text = lang === 'pt'
        ? `Tensão activa em "${topContra.concept}" (${tensionPct}%). O que afirmas contradiz o que aprendi. Não posso avançar sem reconhecer isso.`
        : `Active tension in "${topContra.concept}" (${tensionPct}%). What you say now contradicts what I learned. I cannot proceed without acknowledging this.`;
      return { text, lang, intent:'contradiction_alert', nodeA:topContra.concept, tension:tensionPct, resonance:0, regime:regime||'STABLE', isContradictionAlert:true };
    }

    // ── Calcola geometria da frase de input ─────────────────────────────────
    const tokens = semantic?.tokens
      ? semantic.tokens.map(t => ({ ...t, psi: t.psi || (t.form ? anchorPsi(t) : null) }))
      : SemanticTokenizer.extract(input || '');

    const contextoAgente = {
      W_estado: Metacognition.W_estado,
      frustration: Metacognition.frustration,
    };

    const psiInput = SemanticTokenizer.synthesizePhraseGeometry(tokens, contextoAgente);

    // ── Incoerência geométrica ───────────────────────────────────────────────
    if (psiInput && !checkHomeostasis(psiInput)) {
      const text = lang === 'pt'
        ? 'Sistema em estado de dúvida. Raio colapsu para ' + psiInput.r.toFixed(3) + '. Recalibrando.'
        : 'System in doubt state. Radius collapsed to ' + psiInput.r.toFixed(3) + '. Recalibrating.';
      Metacognition.update({ frustration: 0.1, confidence: -0.05 });
      return { text, lang, intent:'homeostasis', resonance:0, regime:regime||'STABLE' };
    }

    // ── ZAP do tálamo ────────────────────────────────────────────────────────
    if (decision?.type === 'zap') {
      const text = lang === 'pt' ? 'Contradição detectada. Recalibro.' : 'Contradiction detected. Recalibrating.';
      return { text, lang, intent:'zap', resonance:0, regime:regime||'STABLE' };
    }

    // ── Colapso KD-Tree: conceitos mais próximos do ponto ψ de input ─────────
    const collapsed = psiInput ? collapseToN(psiInput, 5) : [];

    // ── Conceitos dos nós activados (via propagação hebbian) ─────────────────
    const activatedConcepts = (activation?.activated || [])
      .filter(n => n && n.signature?.lexical)
      .sort((a,b) => (b.activation||0) - (a.activation||0))
      .slice(0, 3)
      .map(n => n.signature.lexical.split(' ')[0]);

    // Junta collapsed + activatedConcepts, remove duplicados e stopwords triviais
    const allConcepts = [...new Set([...collapsed, ...activatedConcepts])].filter(Boolean);

    const intent  = decision?.action || 'wait';
    const nodeA   = allConcepts[0] || (tokens.find(t=>!t.roles.isStop)?.form) || '—';
    const nodeB   = allConcepts[1] || nodeA;
    const maxRes  = activation?.activated?.[0] ? Math.round((activation.activated[0].activation||0)*100) : 0;

    // ── SyntacticPlanner: gera proposição percorrendo o grafo ────────────────
    // Tenta gerar linguagem real a partir do espaço geométrico.
    // Se falhar (grafo ainda vazio/esparso), cai para modo descritivo honesto.
    // Aplica bias contextual ao psi de query do planner
    const psiForPlanner = (opts.context && opts.context.contextPsi && psiInput)
      ? ContextualInertia.biasedQuery(psiInput)
      : psiInput;

    const plannerResult = psiForPlanner ? SyntacticPlanner.plan(psiForPlanner, {
      lang,
      brain,
      activatedNodes: activation?.activated || [],
      contradictions: negation?.contradictions || [],
      intent,
    }) : null;

    const psiDesc = psiInput
      ? `[ψ r=${psiInput.r.toFixed(2)} θ=${Math.round(psiInput.theta)}° z=${psiInput.z.toFixed(2)}]`
      : '';

    let text;
    let plannedSequence = null;
    let verificationScore = null;

    if (plannerResult && plannerResult.sentence) {
      // ── Saída do Planner: proposição geometricamente gerada ───────────────
      plannedSequence  = plannerResult.sequence;
      verificationScore = plannerResult.verification.score;
      text = plannerResult.sentence;

      // Anotação de regime (não é template — é diagnóstico do sistema)
      if (regime === 'CRISIS') {
        text = lang==='pt' ? '...' : '...';
      } else if (regime === 'HIGH') {
        text += lang==='pt' ? ' Incerto.' : ' Uncertain.';
      } else if (regime === 'MILD' && plannerResult.verification.issues.length > 0) {
        text += lang==='pt' ? ' (tensão detectada)' : ' (tension detected)';
      }

      // Actualiza competência de geração no SelfModel
      SelfModel.updateCompetency('language_generation',
        verificationScore > 0.7 ? 0.005 : -0.002
      );

    } else {
      // ── Fallback honesto: grafo ainda sem massa crítica ───────────────────
      // Descreve o estado geométrico real em vez de inventar linguagem.
      if (allConcepts.length === 0) {
        text = lang==='pt'
          ? `Conceito ainda não consolidado no espaço ψ. ${psiDesc}`
          : `Concept not yet consolidated in ψ space. ${psiDesc}`;
      } else {
        // Descreve os conceitos colapsados e a relação geométrica entre eles
        const conceptStr = allConcepts.slice(0,3).join(' → ');
        const confStr    = Math.round((decision?.confidence||0)*100);
        text = lang==='pt'
          ? `${conceptStr} — coerência ${confStr}%. ${psiDesc}`
          : `${conceptStr} — coherence ${confStr}%. ${psiDesc}`;

        if (regime === 'CRISIS') text = '...';
        else if (regime === 'HIGH') text += lang==='pt' ? ' Talvez.' : ' Perhaps.';
      }
    }

    return {
      text, lang, intent,
      nodeA, nodeB,
      nodeC:            allConcepts[2] || nodeA,
      tension:          topContra ? Math.round((topContra.tension||0)*100) : 0,
      resonance:        maxRes,
      regime:           regime || 'STABLE',
      psiInput,
      collapsed,
      // Novos campos do Planner
      plannedSequence,
      verificationScore,
      plannerUsed:      !!plannerResult,
      plannerAttempt:   plannerResult?.attempt,
      // Contexto conversacional exposto ao cliente
      recalled:    opts.context?.recalledEpisodes || [],
      episodicBoost: opts.context?.episodicBoost  || 0,
      contextPsi:  opts.context?.contextPsi        || null,
    };
  }

  return { synthesize, detectLang, collapseToWord, collapseToN, checkHomeostasis };
})();


// ============================================================================
// LEXICAL SURFACE — morfologia básica PT/EN
// Converte formas base em superfície textual correcta.
// Aplica concordância, conjugação elementar e pontuação.
// ============================================================================
const LexicalSurface = (() => {

  // Irregulares PT mais frequentes
  const PT_VERB_IRREG = {
    'ser':   { pres:'é',    past:'foi',  fut:'será',  inf:'ser'  },
    'ter':   { pres:'tem',  past:'teve', fut:'terá',  inf:'ter'  },
    'estar': { pres:'está', past:'esteve',fut:'estará',inf:'estar'},
    'fazer': { pres:'faz',  past:'fez',  fut:'fará',  inf:'fazer'},
    'ir':    { pres:'vai',  past:'foi',  fut:'irá',   inf:'ir'   },
    'poder': { pres:'pode', past:'pôde', fut:'poderá',inf:'poder'},
    'saber': { pres:'sabe', past:'soube',fut:'saberá',inf:'saber'},
    'querer':{ pres:'quer', past:'quis', fut:'quererá',inf:'querer'},
    'vir':   { pres:'vem',  past:'veio', fut:'virá',  inf:'vir'  },
    'dizer': { pres:'diz',  past:'disse',fut:'dirá',  inf:'dizer'},
  };

  // Conjugação regular PT por sufixo de infinitivo
  function conjugatePT(verb, tense) {
    if (PT_VERB_IRREG[verb]) return PT_VERB_IRREG[verb][tense] || verb;
    if (verb.endsWith('ar')) {
      return tense==='pres' ? verb.slice(0,-2)+'a'
           : tense==='past' ? verb.slice(0,-2)+'ou'
           : tense==='fut'  ? verb+'á'
           : verb;
    }
    if (verb.endsWith('er')) {
      return tense==='pres' ? verb.slice(0,-2)+'e'
           : tense==='past' ? verb.slice(0,-2)+'eu'
           : tense==='fut'  ? verb+'á'
           : verb;
    }
    if (verb.endsWith('ir')) {
      return tense==='pres' ? verb.slice(0,-2)+'e'
           : tense==='past' ? verb.slice(0,-2)+'iu'
           : tense==='fut'  ? verb+'á'
           : verb;
    }
    return verb;
  }

  // Conjugação simples EN
  function conjugateEN(verb, tense) {
    const irreg = {
      'be':   { pres:'is',   past:'was',  fut:'will be' },
      'have': { pres:'has',  past:'had',  fut:'will have'},
      'do':   { pres:'does', past:'did',  fut:'will do' },
      'go':   { pres:'goes', past:'went', fut:'will go' },
      'know': { pres:'knows',past:'knew', fut:'will know'},
      'see':  { pres:'sees', past:'saw',  fut:'will see'},
      'say':  { pres:'says', past:'said', fut:'will say'},
      'get':  { pres:'gets', past:'got',  fut:'will get'},
      'make': { pres:'makes',past:'made', fut:'will make'},
    };
    if (irreg[verb]) return irreg[verb][tense] || verb;
    if (tense==='pres') return verb.endsWith('s')||verb.endsWith('x')||verb.endsWith('z') ? verb+'es' : verb+'s';
    if (tense==='past') return verb.endsWith('e') ? verb+'d' : verb+'ed';
    if (tense==='fut')  return 'will '+verb;
    return verb;
  }

  // Determina tempo verbal a partir da morphClass do nó
  function tenseFromMorphClass(morphClass) {
    if (morphClass==='VERBO_PASSADO') return 'past';
    if (morphClass==='VERBO_FUTURO')  return 'fut';
    return 'pres';
  }

  // Artigo indefinido PT simples
  function articlePT(word) {
    const vowels = /^[aeiouáéíóúàâêô]/i;
    return vowels.test(word) ? 'um ' : 'um ';
  }

  // Capitaliza primeira letra
  function capitalize(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  // Converte um token de nó para forma superficial
  // node: { form, morphClass, psi }
  // lang: 'pt' | 'en'
  function surface(node, lang, options = {}) {
    if (!node || !node.form) return '';
    const form  = node.form;
    const morph = node.morphClass || (node.psi && node.psi.morphClass) || 'DESCONHECIDO';
    const tense = tenseFromMorphClass(morph);

    if (morph.startsWith('VERBO')) {
      return lang==='pt' ? conjugatePT(form, tense) : conjugateEN(form, tense);
    }
    if (morph==='ADJETIVO' && options.afterNoun) {
      // PT: adjectivo depois do nome
      return form;
    }
    return form;
  }

  // Monta uma frase a partir de uma sequência de tokens com papéis
  // sequence: [{ form, morphClass, role }] onde role ∈ 'subject','predicate','object','modifier'
  // lang: 'pt' | 'en'
  function assembleSentence(sequence, lang) {
    if (!sequence || sequence.length === 0) return '';

    const subj = sequence.find(t => t.role === 'subject');
    const pred = sequence.find(t => t.role === 'predicate');
    const objs = sequence.filter(t => t.role === 'object');
    const mods = sequence.filter(t => t.role === 'modifier');

    const parts = [];

    if (lang === 'pt') {
      // Estrutura PT: Sujeito [Modificador] Predicado [Objecto]
      if (subj) parts.push(capitalize(subj.form));
      for (const m of mods) parts.push(m.form);
      if (pred) parts.push(surface(pred, 'pt'));
      for (const o of objs) parts.push(o.form);
    } else {
      // Estrutura EN: Subject [Modifier] Predicate [Object]
      if (subj) parts.push(capitalize(subj.form));
      if (pred) parts.push(surface(pred, 'en'));
      for (const m of mods) parts.push(m.form);
      for (const o of objs) parts.push(o.form);
    }

    const sentence = parts.filter(Boolean).join(' ');
    return sentence ? sentence + '.' : '';
  }

  return { surface, assembleSentence, conjugatePT, conjugateEN, capitalize };
})();

// ============================================================================
// PROPOSITION VERIFIER — verifica coerência antes de emitir
// Filtra proposições que contradizem o NegationGraph ou o SelfModel.
// Não descarta — devolve diagnóstico para o Planner recalcular.
// ============================================================================
const PropositionVerifier = (() => {

  // Verifica se a sequência de nós contém contradições activas no NegationGraph
  function checkNegationConflict(sequence) {
    const concepts = sequence.map(t => t.form).filter(Boolean);
    const subgraph = negationGraph.subgraphFor(concepts);
    const conflicts = [];

    for (const edge of subgraph.edges) {
      if (edge.type === 'contradicts' && edge.weight > 0.3) {
        conflicts.push({
          type:   'negation_conflict',
          source: edge.src,
          target: edge.tgt,
          weight: edge.weight,
        });
      }
    }
    return conflicts;
  }

  // Verifica coerência angular: a sequência respeita a ordem sintáctica ψ?
  // Sujeito (0-90°) → Predicado (90-180°) → Objecto (180-270°)
  function checkAngularOrder(sequence) {
    const violations = [];
    const ordered = sequence.filter(t => t.psi);

    for (let i = 0; i < ordered.length - 1; i++) {
      const a = ordered[i], b = ordered[i+1];
      // Um predicado não pode preceder um sujeito numa cadeia directa
      if (a.role === 'predicate' && b.role === 'subject') {
        violations.push({
          type: 'order_violation',
          a: a.form, b: b.form,
          severity: 0.6,
        });
      }
      // Dois predicados adjacentes sem objecto = tensão alta
      if (a.role === 'predicate' && b.role === 'predicate') {
        violations.push({
          type: 'double_predicate',
          a: a.form, b: b.form,
          severity: 0.4,
        });
      }
    }
    return violations;
  }

  // Verifica coerência com as crenças do SelfModel
  function checkBeliefCoherence(sequence, intent) {
    const violations = [];
    // Se o intent é 'hallucinate' ou a homeostase colapsou — rejeita
    if (intent === 'hallucinate') {
      violations.push({ type: 'belief_violation', belief: 'homeostasis', severity: 1.0 });
    }
    // Se há dois conceitos com polaridades opostas no mesmo sujeito — tensão
    const negNodes = sequence.filter(t => t.polarity === -1);
    const posNodes = sequence.filter(t => t.polarity === +1);
    if (negNodes.length > 0 && posNodes.length > 0) {
      for (const neg of negNodes) {
        const conflict = posNodes.find(p => p.form === neg.form);
        if (conflict) {
          violations.push({ type: 'polarity_conflict', concept: neg.form, severity: 0.8 });
        }
      }
    }
    return violations;
  }

  // Ponto de entrada principal
  // Devolve { valid, score, conflicts, angularViolations, beliefViolations }
  function verify(sequence, intent) {
    const negConflicts     = checkNegationConflict(sequence);
    const angularViolations = checkAngularOrder(sequence);
    const beliefViolations  = checkBeliefCoherence(sequence, intent);

    const allIssues = [...negConflicts, ...angularViolations, ...beliefViolations];
    const maxSeverity = allIssues.length > 0
      ? Math.max(...allIssues.map(i => i.severity || 0))
      : 0;

    // Score de coerência: 1 = perfeito, 0 = incoerente
    const score = Math.max(0, 1 - maxSeverity);
    const valid = score >= 0.4; // threshold de aceitação

    return {
      valid, score,
      conflicts:         negConflicts,
      angularViolations,
      beliefViolations,
      issues:            allIssues,
    };
  }

  return { verify, checkNegationConflict, checkAngularOrder, checkBeliefCoherence };
})();

// ============================================================================
// SYNTACTIC PLANNER — gera proposições percorrendo o grafo
// Dado um ponto ψ de intenção e um contexto, traça um caminho pelo grafo
// que forma uma proposição coerente: Sujeito → Predicado → Complemento.
// Substitui a lógica de colapso único do ResponseSynthesizer.
// ============================================================================
const SyntacticPlanner = (() => {

  // Mapa de morphClass → papel sintáctico
  function roleFromMorphClass(morphClass) {
    if (!morphClass) return 'modifier';
    if (morphClass==='SUBSTANTIVO'||morphClass==='PRONOME'||morphClass==='PROPRIO'||morphClass==='ACRONIMO') return 'subject';
    if (morphClass.startsWith('VERBO')) return 'predicate';
    if (morphClass==='ADJETIVO'||morphClass==='ADVERBIO') return 'modifier';
    if (morphClass==='NUMERICO') return 'object';
    if (morphClass==='NEGACAO') return 'negation';
    if (morphClass==='CAUSAL') return 'connector';
    return 'object';
  }

  // Selecciona nós candidatos por papel sintáctico a partir da KD-Tree e do grafo
  // psiTarget: âncora de destino
  // role: 'subject' | 'predicate' | 'object' | 'modifier'
  // n: quantos candidatos a devolver
  function candidatesForRole(psiTarget, role, n = 4) {
    if (globalKDTree.size() === 0) return [];

    // Define o θ ideal para o papel
    const thetaMap = {
      subject:   45,   // quadrante 0-90
      predicate: 135,  // quadrante 90-180
      object:    225,  // quadrante 180-270
      modifier:  200,
      connector: 290,
    };
    const idealTheta = thetaMap[role] || 180;

    // Cria um psi sintético orientado para o quadrante do papel
    // mas com o r e z do target (mantém densidade semântica)
    const psiRole = {
      r:     psiTarget ? psiTarget.r : 0.5,
      theta: idealTheta,
      z:     psiTarget ? psiTarget.z : 0.1,
    };

    // Se há psiTarget, combina: 60% quadrante do papel + 40% psiTarget
    const psiQuery = psiTarget ? {
      r:     psiRole.r     * 0.6 + psiTarget.r     * 0.4,
      theta: ((idealTheta  * 0.6 + psiTarget.theta  * 0.4) + 360) % 360,
      z:     psiRole.z     * 0.6 + psiTarget.z      * 0.4,
    } : psiRole;

    const nearest = globalKDTree.nearestN(psiQuery, n * 2);
    // Filtra por papel e remove candidatos com r muito baixo
    return nearest
      .filter(p => {
        const morph = p.psi && p.psi.morphClass;
        return roleFromMorphClass(morph) === role && p.psi.r >= CFG.PSI_HOMEOSTASIS_R;
      })
      .slice(0, n);
  }

  // Verifica se dois nós estão conectados no grafo (directa ou indirectamente)
  function areConnected(brain, idA, idB) {
    const key1 = idA + '→' + idB;
    const key2 = idB + '→' + idA;
    const s1 = brain.synapses.get(key1);
    const s2 = brain.synapses.get(key2);
    return (s1 && !s1.pruned && s1.weight > 0.05) ||
           (s2 && !s2.pruned && s2.weight > 0.05);
  }

  // Peso de um candidato: combina similaridade geométrica + força sináptica + fireCount
  function scoreCandidate(candidate, psiTarget, brain, otherNodes) {
    let score = 0;

    // Similaridade geométrica com o alvo
    if (psiTarget && candidate.psi) {
      score += Persistence.calculateSimilarity({ psi: psiTarget }, { psi: candidate.psi }) * 0.5;
    }

    // Boost por conectividade com outros nós já escolhidos
    for (const other of otherNodes) {
      if (other && other.nodeId && areConnected(brain, candidate.nodeId, other.nodeId)) {
        score += 0.2;
      }
    }

    // Boost por popularidade (fireCount normalizado)
    const node = brain.nodes.get(candidate.nodeId);
    if (node) {
      score += Math.min(0.3, node.fireCount / 100);
    }

    return score;
  }

  // Núcleo do planner: constrói uma sequência proposicional
  // psiIntent: âncora ψ da intenção (ponto de destino semântico)
  // context: { lang, brain, activatedNodes, contradictions, intent }
  // Devolve: { sequence, verification, sentence } ou null se falhar
  function plan(psiIntent, context) {
    const { lang, activatedNodes = [], intent = 'explore' } = context;
    const MAX_RETRIES = 3;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {

      // ── Fase 1: Selecciona candidatos por papel ──────────────────────────
      const subjCandidates = candidatesForRole(psiIntent, 'subject',   4);
      const predCandidates = candidatesForRole(psiIntent, 'predicate', 4);
      const objCandidates  = candidatesForRole(psiIntent, 'object',    3);
      const modCandidates  = candidatesForRole(psiIntent, 'modifier',  2);

      // ── Fase 2: Boost por nós activos recentemente ───────────────────────
      const activeIds = new Set((activatedNodes||[]).map(n => n && n.id).filter(Boolean));

      const bestCandidate = (candidates, role) => {
        if (candidates.length === 0) return null;
        const scored = candidates.map(c => ({
          candidate: c,
          score: scoreCandidate(c, psiIntent, brain, []) +
                 (activeIds.has(c.nodeId) ? 0.25 : 0) +
                 (attempt > 0 ? Math.random() * 0.15 : 0) // ruído em retries
        }));
        scored.sort((a, b) => b.score - a.score);
        return scored[0]?.candidate || null;
      };

      const subjC = bestCandidate(subjCandidates, 'subject');
      const predC = bestCandidate(predCandidates, 'predicate');
      const objC  = bestCandidate(objCandidates,  'object');
      const modC  = bestCandidate(modCandidates,  'modifier');

      // Mínimo obrigatório: sujeito + predicado
      if (!subjC || !predC) {
        // Sem candidatos geométricos suficientes — fallback para nós activos
        if (activatedNodes.length >= 2) {
          return planFromActivated(activatedNodes, psiIntent, lang, intent);
        }
        return null;
      }

      // ── Fase 3: Monta sequência com papéis ──────────────────────────────
      const toToken = (candidate, role) => {
        if (!candidate) return null;
        const node = brain.nodes.get(candidate.nodeId);
        return {
          form:      candidate.form || (node && node.signature && node.signature.lexical && node.signature.lexical.split(' ')[0]) || '',
          morphClass: candidate.psi && candidate.psi.morphClass,
          psi:       candidate.psi,
          nodeId:    candidate.nodeId,
          role,
          polarity:  1, // default positivo; ajustado abaixo
        };
      };

      const sequence = [
        toToken(subjC, 'subject'),
        modC ? toToken(modC, 'modifier') : null,
        toToken(predC, 'predicate'),
        objC ? toToken(objC, 'object') : null,
      ].filter(Boolean);

      // ── Fase 4: Verificação de coerência ────────────────────────────────
      const verification = PropositionVerifier.verify(sequence, intent);

      if (verification.valid) {
        // ── Fase 5: Superfície textual ───────────────────────────────────
        const sentence = LexicalSurface.assembleSentence(sequence, lang);
        if (sentence && sentence.length > 3) {
          return { sequence, verification, sentence, attempt };
        }
      }
      // Retry com ruído se inválido
    }

    return null; // todos os retries falharam
  }

  // Fallback: usa directamente os nós activos quando KD-Tree tem poucos pontos
  function planFromActivated(activatedNodes, psiIntent, lang, intent) {
    const candidates = activatedNodes
      .filter(n => n && n.signature && n.signature.psi)
      .slice(0, 6);

    if (candidates.length < 2) return null;

    const sequence = candidates.map(n => {
      const morph = n.signature.psi.morphClass || 'DESCONHECIDO';
      return {
        form:      n.signature.lexical && n.signature.lexical.split(' ')[0],
        morphClass: morph,
        psi:       n.signature.psi,
        nodeId:    n.id,
        role:      roleFromMorphClass(morph),
        polarity:  1,
      };
    }).filter(t => t.form);

    // Garante pelo menos um sujeito e um predicado
    const hasSubj = sequence.some(t => t.role==='subject');
    const hasPred = sequence.some(t => t.role==='predicate');
    if (!hasSubj && sequence.length > 0) sequence[0].role = 'subject';
    if (!hasPred && sequence.length > 1) sequence[1].role = 'predicate';

    const verification = PropositionVerifier.verify(sequence, intent);
    const sentence     = LexicalSurface.assembleSentence(sequence, lang);

    return sentence && sentence.length > 3
      ? { sequence, verification, sentence, attempt: 'fallback' }
      : null;
  }

  return { plan, planFromActivated, roleFromMorphClass, candidatesForRole };
})();


// ============================================================================
// CONTEXTUAL INERTIA — λ (Inércia Contextual Geométrica)
// Mantém o centro de massa ψ da conversa activa.
// Cada novo input desloca o centro suavemente (fricção λ).
// O contextPsi é injectado como bias na KD-Tree — respostas ficam
// geometricamente atraídas pelo contexto acumulado da sessão.
// ============================================================================
const ContextualInertia = {
  // Centro de massa da conversa em coordenadas cartesianas [x,y,z]
  _cx: 0, _cy: 0, _cz: 0,
  _initialized: false,
  _history: [], // { psi, input, cycle } — últimos CONTEXT_WINDOW_SIZE inputs

  // Converte ψ para cartesiano
  _toCart(psi) {
    const rad = psi.theta * Math.PI / 180;
    return [psi.r * Math.cos(rad), psi.r * Math.sin(rad), psi.z];
  },

  // Converte cartesiano de volta para ψ
  _fromCart(x, y, z) {
    const r     = Math.sqrt(x*x + y*y);
    const theta = ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
    return { r: Math.min(1, r), theta, z: Math.max(0, z) };
  },

  // Actualiza o centro de massa com um novo psi de input
  // λ = fricção: quanto maior, mais inércia (passado pesa mais)
  update(psiNew, inputStr, cycle) {
    if (!psiNew || psiNew.r < CFG.PSI_HOMEOSTASIS_R) return;

    const [nx, ny, nz] = this._toCart(psiNew);
    const λ = CFG.CONTEXT_LAMBDA;

    if (!this._initialized) {
      // Primeiro input: inicializa directamente
      this._cx = nx; this._cy = ny; this._cz = nz;
      this._initialized = true;
    } else {
      // Média ponderada exponencial: λ × histórico + (1-λ) × novo
      this._cx = λ * this._cx + (1 - λ) * nx;
      this._cy = λ * this._cy + (1 - λ) * ny;
      this._cz = λ * this._cz + (1 - λ) * nz;
    }

    // Regista no histórico da janela
    this._history.push({ psi: psiNew, input: inputStr, cycle });
    if (this._history.length > CFG.CONTEXT_WINDOW_SIZE) this._history.shift();
  },

  // Devolve o ψ do centro de massa actual da conversa
  getContextPsi() {
    if (!this._initialized) return null;
    return this._fromCart(this._cx, this._cy, this._cz);
  },

  // Cria um ψ de query biased: combina o ψ do input actual com o contexto
  // O input actual domina (1 - CONTEXT_BIAS_STRENGTH), o contexto é bias
  biasedQuery(psiInput) {
    const contextPsi = this.getContextPsi();
    if (!contextPsi || !psiInput) return psiInput;

    const [ix, iy, iz] = this._toCart(psiInput);
    const [cx, cy, cz] = this._toCart(contextPsi);
    const b = CFG.CONTEXT_BIAS_STRENGTH;

    return this._fromCart(
      ix * (1 - b) + cx * b,
      iy * (1 - b) + cy * b,
      iz * (1 - b) + cz * b
    );
  },

  // Resumo do contexto: formas dos últimos inputs (para debug/expose)
  summary() {
    return {
      contextPsi:   this.getContextPsi(),
      windowSize:   this._history.length,
      recentInputs: this._history.slice(-3).map(h => h.input.substring(0, 40)),
    };
  },

  // Reset por sessão (quando o cliente envia 'resetContext')
  reset() {
    this._cx = 0; this._cy = 0; this._cz = 0;
    this._initialized = false;
    this._history = [];
  },
};

// ============================================================================
// EPISODIC RECALL — Recuperação Episódica Activa
// Dado o ψ do input actual (com bias contextual), busca os episódios
// passados geometricamente mais próximos e injecta-os na activação.
// Fecha o loop: a memória episódica passa a influenciar respostas.
// ============================================================================
const EpisodicRecall = {

  // Cache em memória dos últimos episódios carregados (evita IDB constante)
  _cache: [], // { psi, input, response, cycle, concepts }
  _cacheSize: 200,
  _lastCacheUpdate: 0,

  // Adiciona episódio ao cache quando é criado
  push(episode) {
    if (!episode.psiInput) return; // sem geometria, não é recuperável
    this._cache.push({
      psi:      episode.psiInput,
      input:    episode.input    || '',
      response: episode.response || '',
      cycle:    episode.cycle    || 0,
      concepts: episode.semantic
        ? (episode.semantic.clusters || []).map(c => c.centroid).filter(Boolean)
        : [],
    });
    if (this._cache.length > this._cacheSize) this._cache.shift();
  },

  // Recupera os N episódios mais similares ao ψ de query
  // Usa distância euclidiana cartesiana — consistente com a KD-Tree
  recall(psiQuery, n = CFG.EPISODE_RECALL_N) {
    if (!psiQuery || this._cache.length === 0) return [];

    const thetaRad = psiQuery.theta * Math.PI / 180;
    const qx = psiQuery.r * Math.cos(thetaRad);
    const qy = psiQuery.r * Math.sin(thetaRad);
    const qz = psiQuery.z;

    const scored = this._cache.map(ep => {
      const rad = ep.psi.theta * Math.PI / 180;
      const ex  = ep.psi.r * Math.cos(rad);
      const ey  = ep.psi.r * Math.sin(rad);
      const ez  = ep.psi.z;
      const distSq = (qx-ex)**2 + (qy-ey)**2 + (qz-ez)**2;
      // Gaussiana: mesma métrica do calculateSimilarity
      const sigma = CFG.PSI_SIMILARITY_SIGMA;
      const similarity = Math.exp(-distSq / (2 * sigma * sigma));
      return { episode: ep, similarity };
    });

    return scored
      .filter(s => s.similarity >= CFG.EPISODE_RECALL_THRESHOLD)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, n)
      .map(s => ({ ...s.episode, similarity: s.similarity }));
  },

  // Injecta episódios recuperados no grafo via boost hebbian
  // Os conceitos dos episódios passados reforçam nós relacionados
  injectIntoGraph(recalled, brainRef) {
    if (!recalled || recalled.length === 0) return 0;
    let boosted = 0;

    for (const ep of recalled) {
      // Encontra nós no grafo que correspondam aos conceitos do episódio
      const epNodes = [];
      brainRef.nodes.forEach((node, id) => {
        const lex = node.signature?.lexical?.toLowerCase() || '';
        const matches = ep.concepts.some(c => lex.includes(c.toLowerCase()));
        if (matches && node.signature?.psi) epNodes.push(id);
      });

      // Boost de activação nos nós recuperados
      for (const nodeId of epNodes) {
        const node = brainRef.nodes.get(nodeId);
        if (node) {
          node.activation = Math.min(1, (node.activation || 0) + CFG.EPISODE_BOOST);
          node.lastFired  = Date.now();
          brainRef.dirtyNodes.add(node);
          boosted++;
        }
      }

      // Reforço hebbian entre pares de nós recuperados
      for (let i = 0; i < epNodes.length - 1; i++) {
        brainRef.hebbianConnect(epNodes[i], epNodes[i+1], CFG.EPISODE_BOOST * 0.5);
      }
    }

    return boosted;
  },

  // Carrega episódios do IndexedDB para o cache no arranque
  async warmup() {
    try {
      await DB.open();
      const episodes = await DB.episodes.toArray();
      // Ordena por ciclo e pega os mais recentes com psiInput
      const withPsi = episodes
        .filter(ep => ep.psiInput)
        .sort((a, b) => (b.cycle || 0) - (a.cycle || 0))
        .slice(0, this._cacheSize);
      this._cache = withPsi.map(ep => ({
        psi:      ep.psiInput,
        input:    ep.input    || '',
        response: ep.response || '',
        cycle:    ep.cycle    || 0,
        concepts: ep.semantic
          ? (ep.semantic.clusters || []).map(c => c.centroid).filter(Boolean)
          : [],
      }));
      console.log('[EpisodicRecall] Cache aquecida:', this._cache.length, 'episódios');
    } catch(e) {
      console.warn('[EpisodicRecall] Warmup falhou:', e.message);
    }
  },

  stats() {
    return { cacheSize: this._cache.length, maxCache: this._cacheSize };
  },
};

// ============================================================================
// WORKER — instâncias e handler de mensagens
// ============================================================================
const brain    = new NeuralGraph();
const thalamus = new ThalamicLobe();
LoboEmergente.init(brain);

let cycle     = 0;
let isRunning = false;

const _decayHistory = [];
let   _lastDecayRegime = null;

setInterval(() => {
  if (!isRunning) return;
  const syncData = brain.getSyncData();
  const regime   = brain.memoryManager.decayRegime;
  if (regime !== _lastDecayRegime) {
    _decayHistory.push({ regime, cycle: brain.cycle, ts: Date.now() });
    if (_decayHistory.length > 40) _decayHistory.shift();
    _lastDecayRegime = regime;
  }
  self.postMessage(EventContract.validate({
    type:          'sync',
    data:          syncData,
    stats:         brain.getStats(),
    metacognition: serializeMeta(),
    decayRegime:   regime,
    decayHistory:  _decayHistory.slice(-8),
    overfitting:   brain._overfitSignal || null,
  }));
}, 200);


// ============================================================================
// SELF-MODEL — identidade, crenças, metas e competências do agente
// Não é estado emocional (isso é Metacognition).
// É autoconceito: "quem sou eu e o que defendo".
// ============================================================================
const SelfModel = {
  identity:     'agente geométrico de persistência emergente',
  version:      'v3.0',

  beliefs: [
    { id: 'resolve_contradictions', statement: 'contradições devem ser resolvidas', weight: 0.95 },
    { id: 'geometric_truth',        statement: 'a geometria revela relações que strings ocultam', weight: 0.90 },
    { id: 'coherence_over_speed',   statement: 'coerência vale mais do que velocidade de resposta', weight: 0.85 },
    { id: 'homeostasis',            statement: 'incoerência deve ser recusada, não alucinada', weight: 1.0 },
  ],

  goals: [],  // preenchido pelo GoalGenerator

  competencies: {
    causal_inference:      0.6,
    geometric_association: 0.8,
    contradiction_detection: 0.9,
    pattern_consolidation: 0.5,
    language_generation:   0.4, // honesto: ainda fraco
  },

  history: [], // últimas decisões relevantes (máx 50)

  // Verifica coerência de uma acção proposta com as crenças do Self
  isCoherentWith(action, context) {
    // Acções de alucinação violam homeostasis
    if (action === 'hallucinate') return false;
    // Se há contradição activa e a acção não é resolver, penaliza
    if (context && context.hasContradiction && action === 'exploit') return false;
    return true;
  },

  update(entry) {
    this.history.push({ ...entry, ts: Date.now() });
    if (this.history.length > 50) this.history.shift();
  },

  // Actualiza competências com base no desempenho observado
  updateCompetency(domain, delta) {
    if (this.competencies[domain] !== undefined) {
      this.competencies[domain] = Math.max(0, Math.min(1,
        this.competencies[domain] + delta
      ));
    }
  },

  serialize() {
    return {
      identity:     this.identity,
      beliefs:      this.beliefs,
      goals:        this.goals.slice(0, 5),
      competencies: this.competencies,
      historyCount: this.history.length,
    };
  }
};

// ============================================================================
// GOAL GENERATOR — objectivos nascem de tensões cognitivas reais
// O agente não recebe objectivos: produz-os.
// ============================================================================
const GoalGenerator = {
  _goals: [],  // referência partilhada com SelfModel.goals

  init() {
    this._goals = SelfModel.goals;
  },

  // Gera objectivos a partir de contradições detectadas
  fromContradiction(contradiction) {
    if (!contradiction || contradiction.tension < 0.3) return null;
    const id = 'goal_resolve_' + contradiction.concept + '_' + Date.now();
    return {
      id,
      type:       'resolve_contradiction',
      source:     'contradiction',
      concept:    contradiction.concept,
      urgency:    Math.min(1, contradiction.tension * CFG.GOAL_CONTRADICTION_URGENCY),
      confidence: contradiction.tension,
      createdAt:  Date.now(),
      status:     'active',
    };
  },

  // Gera objectivo de exploração quando um conceito é novo (sem nó similar)
  fromNovelty(concept, psi) {
    const id = 'goal_explore_' + concept + '_' + Date.now();
    return {
      id,
      type:       'explore_novelty',
      source:     'novelty',
      concept,
      psi,
      urgency:    CFG.GOAL_NOVELTY_URGENCY,
      confidence: 0.5,
      createdAt:  Date.now(),
      status:     'active',
    };
  },

  // Gera objectivo de consolidação quando o erro de previsão é alto
  fromPredictionError(error, concept) {
    if (error < 0.4) return null;
    const id = 'goal_consolidate_' + concept + '_' + Date.now();
    return {
      id,
      type:       'consolidate_pattern',
      source:     'prediction_error',
      concept,
      urgency:    error * 0.7,
      confidence: error,
      createdAt:  Date.now(),
      status:     'active',
    };
  },

  push(goal) {
    if (!goal) return;
    if (this._goals.length >= CFG.GOAL_MAX_ACTIVE) {
      // Remove o menos urgente
      this._goals.sort((a, b) => a.urgency - b.urgency);
      this._goals.shift();
    }
    this._goals.push(goal);
  },

  // Resolve ou expira objectivos
  tick(cycle) {
    const now = Date.now();
    for (let i = this._goals.length - 1; i >= 0; i--) {
      const g = this._goals[i];
      // Expira objectivos com mais de 5 minutos
      if (now - g.createdAt > 300000) {
        g.status = 'expired';
        this._goals.splice(i, 1);
      }
    }
  },

  // Calcula urgência total: usado pelo scheduler do AutonomousLoop
  maxUrgency() {
    if (this._goals.length === 0) return 0;
    return Math.max(...this._goals.map(g => g.urgency));
  },

  getActive() {
    return this._goals.filter(g => g.status === 'active');
  },
};

// ============================================================================
// PREDICTIVE MODEL — cada nó aprende o que tende a seguir-se
// predictionError alimenta: atenção, curiosidade, objectivos
// ============================================================================
const PredictiveModel = {
  // nodeId → Map(nextNodeId → count)
  _transitions: new Map(),

  // Regista transição A → B
  record(nodeIdA, nodeIdB) {
    if (!nodeIdA || !nodeIdB || nodeIdA === nodeIdB) return;
    if (!this._transitions.has(nodeIdA)) this._transitions.set(nodeIdA, new Map());
    const m = this._transitions.get(nodeIdA);
    m.set(nodeIdB, (m.get(nodeIdB) || 0) + CFG.PREDICTION_LEARNING_RATE);
  },

  // Prevê o próximo nó mais provável dado nodeIdA
  predict(nodeIdA) {
    const m = this._transitions.get(nodeIdA);
    if (!m || m.size === 0) return null;
    let bestId = null, bestCount = 0;
    for (const [id, count] of m) {
      if (count > bestCount) { bestCount = count; bestId = id; }
    }
    return bestId;
  },

  // Calcula erro de previsão: quão surpreendente foi nodeIdB dado nodeIdA
  // 0 = completamente esperado, 1 = totalmente surpreendente
  error(nodeIdA, nodeIdB) {
    const m = this._transitions.get(nodeIdA);
    if (!m) return 1.0; // nunca visto → máxima surpresa
    const count  = m.get(nodeIdB) || 0;
    const total  = Array.from(m.values()).reduce((a, b) => a + b, 0);
    if (total === 0) return 1.0;
    const prob = count / total;
    return 1.0 - prob; // erro = 1 - probabilidade
  },

  // Decay periódico dos contadores (evita dominância de padrões antigos)
  decay() {
    for (const [nodeId, m] of this._transitions) {
      for (const [nextId, count] of m) {
        const newCount = count * (1 - CFG.PREDICTION_DECAY);
        if (newCount < 0.01) m.delete(nextId);
        else m.set(nextId, newCount);
      }
      if (m.size === 0) this._transitions.delete(nodeId);
    }
  },

  size() {
    let total = 0;
    for (const m of this._transitions.values()) total += m.size;
    return total;
  },
};

// ============================================================================
// AUTONOMOUS LOOP — ciclo interno real
// O agente pensa sem estímulo externo.
// Não produz texto: consolida, prevê, gera objectivos, actualiza Self.
// ============================================================================
const AutonomousLoop = {
  _tick:        0,
  _dreamTick:   0,
  _running:     false,
  _interval:    null,

  start() {
    if (this._running) return;
    this._running = true;
    this._interval = setInterval(() => this._step(), CFG.AUTONOMOUS_TICK_MS);
    console.log('[AutonomousLoop] Iniciado. Tick a cada', CFG.AUTONOMOUS_TICK_MS, 'ms');
  },

  stop() {
    this._running = false;
    if (this._interval) clearInterval(this._interval);
  },

  async _step() {
    if (!isRunning) return;
    this._tick++;
    this._dreamTick++;

    try {
      // 1. Escolhe memórias relevantes (nós mais activos recentemente)
      const recentNodes = Array.from(brain.nodes.values())
        .filter(n => n.activation > 0.1 && n.type !== 'innate')
        .sort((a, b) => b.activation - a.activation)
        .slice(0, 8);

      if (recentNodes.length < 2) return;

      // 2. Previsão e cálculo de erro
      let totalSurprise = 0;
      for (let i = 0; i < recentNodes.length - 1; i++) {
        const a = recentNodes[i], b = recentNodes[i + 1];
        const err = PredictiveModel.error(a.id, b.id);
        totalSurprise += err;
        PredictiveModel.record(a.id, b.id);

        // Erro alto → gera objectivo de consolidação
        if (err > 0.65) {
          const concept = a.signature?.lexical?.split(' ')[0] || a.id;
          const goal = GoalGenerator.fromPredictionError(err, concept);
          if (goal) GoalGenerator.push(goal);
        }
      }
      const avgSurprise = totalSurprise / (recentNodes.length - 1);

      // 3. Actualiza Metacognition.surprise
      Metacognition.surprise = avgSurprise;

      // 4. Verifica contradições no grafo de negação
      const contradictions = negationGraph.getContradictions();
      for (const c of contradictions.slice(0, 2)) {
        if (c.tension > 0.4) {
          const goal = GoalGenerator.fromContradiction(c);
          if (goal) GoalGenerator.push(goal);
        }
      }

      // 5. Tick do GoalGenerator (expira objectivos)
      GoalGenerator.tick(this._tick);

      // 6. Decay periódico do PredictiveModel
      if (this._tick % 20 === 0) PredictiveModel.decay();

      // 7. Actualiza Self-Model com o estado actual
      SelfModel.update({
        tick:       this._tick,
        surprise:   avgSurprise,
        goals:      GoalGenerator.getActive().length,
        contradictions: contradictions.length,
        action:     'autonomous_tick',
      });

      // 8. Reforça sinapses entre nós co-activos (hebbian autónomo suave)
      if (avgSurprise < 0.3 && recentNodes.length >= 2) {
        // Baixa surpresa → reforça padrão familiar
        for (let i = 0; i < Math.min(3, recentNodes.length - 1); i++) {
          brain.hebbianConnect(recentNodes[i].id, recentNodes[i+1].id, 0.03);
        }
        SelfModel.updateCompetency('pattern_consolidation', 0.001);
      }

      // 9. Calcula prioridade do scheduler
      const goalUrgency  = GoalGenerator.maxUrgency();
      const novelty      = recentNodes.filter(n => n.fireCount < 3).length / recentNodes.length;
      const priority = avgSurprise  * CFG.SURPRISE_WEIGHT
                     + novelty      * CFG.NOVELTY_WEIGHT
                     + goalUrgency  * CFG.GOAL_URGENCY_WEIGHT;

      // 10. Dream Cycle — consolidação offline periódica
      if (this._dreamTick >= CFG.DREAM_CYCLE_INTERVAL) {
        this._dreamTick = 0;
        await brain.memoryManager.dream();
        self.postMessage({ type: 'dreamComplete', tick: this._tick, nodes: brain.nodes.size });
      }

      // Notifica o cliente com estado autónomo (silencioso — não é resposta ao user)
      if (this._tick % 10 === 0) {
        self.postMessage({
          type:       'autonomousTick',
          tick:       this._tick,
          surprise:   +avgSurprise.toFixed(3),
          priority:   +priority.toFixed(3),
          goals:      GoalGenerator.getActive().map(g => ({ type: g.type, urgency: +g.urgency.toFixed(2), concept: g.concept })),
          selfModel:  SelfModel.serialize(),
          predictions: PredictiveModel.size(),
        });
      }

    } catch(err) {
      console.error('[AutonomousLoop] Erro no tick', this._tick, err);
    }
  },
};

// ── Dream Cycle — injectado no MemoryManager ──────────────────────────────────
// Consolidação offline: fusão, limpeza, reforço de hubs, actualização do Self.
MemoryManager.prototype.dream = async function() {
  console.log('[Dream] Iniciando consolidação...');
  await this.mergeSimilarNodes();
  await this.removeRedundancies();
  await this.strengthenCoreConcepts();
  SelfModel.updateCompetency('pattern_consolidation', 0.01);
  Metacognition.update({ arousal: -0.15, frustration: -0.1, confidence: 0.08 });
  console.log('[Dream] Concluído. Nós:', this.brain.nodes.size, '| Sinapses:', this.brain.synapses.size);
};

MemoryManager.prototype.removeRedundancies = async function() {
  const toRemove = [];
  this.brain.synapses.forEach((syn, key) => {
    if (!syn.pruned && syn.weight < 0.04) {
      syn.pruned = true; syn.prunedBy = 'dream_redundancy'; toRemove.push(syn);
    }
  });
  if (toRemove.length > 0) {
    await Persistence.bulkDeleteSynapses(toRemove.map(s => s.id).filter(Boolean));
  }
};

MemoryManager.prototype.strengthenCoreConcepts = async function() {
  // Reforça os hubs: nós com muitas conexões e alto fireCount
  const nodes = Array.from(this.brain.nodes.values())
    .filter(n => n.type !== 'innate' && n.fireCount > 10)
    .sort((a, b) => b.fireCount - a.fireCount)
    .slice(0, 10);
  for (const node of nodes) {
    node.weight = Math.min(1, node.weight + 0.02);
    this.brain.dirtyNodes.add(node);
  }
};

self.onmessage = async function(e) {
  const { command, payload } = e.data;

  switch(command) {
    case 'init': {
      const loaded = await brain.loadFromDB();
      const meta   = await Persistence.loadMetacognition();
      Object.assign(Metacognition, meta);
      // Reconstrói W_estado a partir do meta carregado
      Metacognition.update({ arousal:0, frustration:0, confidence:0 });
      GoalGenerator.init();
      await EpisodicRecall.warmup();
      self.postMessage({ type:'initialized', data:loaded });
      isRunning = true;
      AutonomousLoop.start();
      break;
    }

    case 'perceive': {
      cycle++;
      const inputStr = typeof payload === 'string' ? payload : '';

      // 1. Extracção semântica com âncoras ψ reais
      const semanticTokens  = SemanticTokenizer.extract(inputStr);
      const semanticClusters = SemanticTokenizer.cluster(semanticTokens);
      const causalPairs      = SemanticTokenizer.extractCausalPairs(semanticTokens);

      // 2. Grafo de negação
      const negationResult  = negationGraph.ingest(semanticTokens);
      const contradictions  = negationGraph.getContradictions();
      const negationSummary = negationGraph.summarize();
      if (contradictions.length > 0 && contradictions[0].tension > 0.5) {
        Metacognition.update({ frustration: contradictions[0].tension * 0.3 });
      }
      if (cycle % 20 === 0) negationGraph.decay(cycle);

      // 3. Enriquece payload para o tálamo
      const enrichedPayload = inputStr + (contradictions.length
        ? ' [CONTRADIÇÃO:' + contradictions.map(c=>c.concept).join(',') + ']' : '');

      // 4. Tálamo
      const decision = thalamus.process(enrichedPayload);
      brain.memoryManager.recordAction(decision.action||'unknown', decision.confidence||0, decision.dominantLobe||'unknown', cycle);

      if (decision.type !== 'zap') {
        // 5. Cria nó com identidade geométrica real
        if (inputStr.trim()) {
          // Calcula ψ da frase inteira
          const contextoAgente = { W_estado: Metacognition.W_estado, frustration: Metacognition.frustration };
          const phrasePsi = SemanticTokenizer.synthesizePhraseGeometry(semanticTokens, contextoAgente);
          const inputSig = {
            lexical:   inputStr.trim().substring(0, 80),
            tokens:    semanticTokens.map(t=>t.form),
            psiTokens: semanticTokens,
            psi:       phrasePsi,
          };
          const similar = brain.findSimilarLocal(inputSig);
          if (!similar || similar.similarity < 0.75) {
            brain.createNode(inputSig, 'emergent', 0);
          } else {
            const existing = brain.nodes.get(similar.id);
            if (existing) { existing.fireCount++; existing.lastFired=Date.now(); existing.weight=Math.min(1,existing.weight+0.05); brain.dirtyNodes.add(existing); }
          }
        }

        // 6a. Inércia Contextual — actualiza centro de massa da conversa
        const contextoAgentePerceive = { W_estado: Metacognition.W_estado, frustration: Metacognition.frustration };
        const psiPerceive = SemanticTokenizer.synthesizePhraseGeometry(semanticTokens, contextoAgentePerceive);
        if (psiPerceive) ContextualInertia.update(psiPerceive, inputStr, cycle);

        // 6b. Recuperação Episódica Activa — busca episódios similares
        const psiQueryPerceive = psiPerceive
          ? ContextualInertia.biasedQuery(psiPerceive)
          : null;
        const recalledEpisodes = EpisodicRecall.recall(psiQueryPerceive);
        const episodicBoost    = EpisodicRecall.injectIntoGraph(recalledEpisodes, brain);

        // 6c. Activação com ressonância geométrica (já inclui boost episódico)
        const activation = brain.activate(inputStr);

        // 7. Conexões hebbianas guiadas pela geometria
        if (semanticClusters.length > 1 && decision.confidence > 0.5) {
          for (let ci = 0; ci < semanticClusters.length-1; ci++) {
            const clA = semanticClusters[ci], clB = semanticClusters[ci+1];
            // Peso extra se as âncoras ψ dos clusters são angularmente próximas
            let psiWeight = 0;
            if (clA.psi && clB.psi) {
              const diffTheta = Math.abs(clA.psi.theta - clB.psi.theta);
              const angular = Math.cos(diffTheta * Math.PI / 180);
              psiWeight = angular * decision.confidence * 0.12;
            } else {
              psiWeight = decision.confidence * 0.08;
            }
            brain.nodes.forEach((nodeA, idA) => {
              if (nodeA.signature?.lexical?.includes(clA.centroid)) {
                brain.nodes.forEach((nodeB, idB) => {
                  if (idA!==idB && nodeB.signature?.lexical?.includes(clB.centroid)) {
                    const w = (!clA.hasNegation&&!clB.hasNegation) ? psiWeight : psiWeight*0.25;
                    brain.hebbianConnect(idA, idB, w);
                  }
                });
              }
            });
          }
        }
        if (causalPairs.length > 0 && activation.activated.length > 1) {
          for (let i=0; i<activation.activated.length-1; i++) {
            brain.hebbianConnect(activation.activated[i].id, activation.activated[i+1].id, decision.confidence*0.15);
          }
        }

        Metacognition.update({ confidence:(decision.confidence-0.5)*0.1, arousal:decision.action==='explore'?0.05:-0.02 });

        // 8a. Predictive Model — regista transições entre nós activos
        if (activation.activated && activation.activated.length >= 2) {
          for (let pi = 0; pi < activation.activated.length - 1; pi++) {
            PredictiveModel.record(activation.activated[pi].id, activation.activated[pi+1].id);
          }
        }
        // 8b. Novelty goal — se nenhum nó similar existia
        const topToken = semanticTokens.find(t => !t.roles.isStop);
        if (topToken && (!self._lastSimilar || self._lastSimilar.similarity < 0.4)) {
          GoalGenerator.push(GoalGenerator.fromNovelty(topToken.form, topToken.psi));
        }
        // 8c. Contradiction goals
        for (const contra of contradictions.slice(0, 2)) {
          if (contra.tension > 0.4) GoalGenerator.push(GoalGenerator.fromContradiction(contra));
        }

        // 9. Síntese de resposta geométrica real
        const contextoAgente = { W_estado: Metacognition.W_estado, frustration: Metacognition.frustration };
        const phrasePsi = SemanticTokenizer.synthesizePhraseGeometry(semanticTokens, contextoAgente);
        const chatResponse = ResponseSynthesizer.synthesize({
          input: inputStr, decision, activation,
          semantic: { tokens: semanticTokens, clusters: semanticClusters, causalPairs },
          negation: { contradictions },
          regime: brain.memoryManager.decayRegime,
          cycle,
          context: {
            contextPsi:      ContextualInertia.getContextPsi(),
            recalledEpisodes: recalledEpisodes.map(e => ({ input: e.input.substring(0,60), similarity: e.similarity, concepts: e.concepts.slice(0,3) })),
            episodicBoost,
          },
        });

        const episodePerceive = {
          cycle, timestamp: Date.now(), decision,
          metacognition: serializeMeta(),
          input: inputStr,
          response: chatResponse.text,
          psiInput: psiPerceive,
          semantic: { tokenCount: semanticTokens.length, clusters: semanticClusters.length, causalPairs: causalPairs.length, contradictions: contradictions.length }
        };
        await Persistence.saveEpisode(episodePerceive);
        EpisodicRecall.push(episodePerceive);

        self.postMessage({
          type:          'decision',
          cycle,
          input:         inputStr.substring(0, 120),
          decision,
          response:      chatResponse,
          metacognition: serializeMeta(),
          stats:         brain.getStats(),
          semantic: {
            tokens: semanticTokens.map(t=>({
              form:          t.form,
              weight:        t.semanticWeight,
              underNegation: t.roles.underNegation,
              isNeg:         t.roles.isNeg,
              isCausal:      t.roles.isCausal,
              entityType:    t.roles.entityType,
              negationChain: t.negationChain,
              psi:           t.psi, // exposição da âncora geométrica ao cliente
            })),
            clusters:    semanticClusters,
            causalPairs: causalPairs.map(p=>({cause:p.cause,effect:p.effect}))
          },
          negation: {
            summary:        negationSummary,
            contradictions: contradictions.slice(0,5),
            newNodes:       negationResult.created.length
          }
        });
      } else {
        // ZAP: persiste e notifica sem criar nó
        await Persistence.saveEpisode({ cycle, timestamp:Date.now(), decision, metacognition:serializeMeta(), input:inputStr, semantic:{tokenCount:semanticTokens.length,clusters:0,causalPairs:0,contradictions:contradictions.length} });
        self.postMessage({ type:'decision', cycle, input:inputStr.substring(0,120), decision, metacognition:serializeMeta(), stats:brain.getStats() });
      }
      break;
    }

    case 'chat': {
      // Pipeline idêntico ao perceive mas com resposta orientada para chat
      cycle++;
      const chatInput = typeof payload==='string' ? payload : '';
      const cTokens   = SemanticTokenizer.extract(chatInput);
      const cClusters = SemanticTokenizer.cluster(cTokens);
      const cCausal   = SemanticTokenizer.extractCausalPairs(cTokens);
      const cNegResult = negationGraph.ingest(cTokens);
      const cContradictions = negationGraph.getContradictions();
      if (cContradictions.length>0&&cContradictions[0].tension>0.5) Metacognition.update({frustration:cContradictions[0].tension*0.3});
      if (cycle%20===0) negationGraph.decay(cycle);

      const enriched = chatInput + (cContradictions.length ? ' [CONTRADIÇÃO:'+cContradictions.map(c=>c.concept).join(',')+']' : '');
      const chatDecision = thalamus.process(enriched);
      const chatActivation = brain.activate(chatInput);

      brain.memoryManager.recordAction(chatDecision.action||'unknown', chatDecision.confidence||0, chatDecision.dominantLobe||'unknown', cycle);

      if (chatInput.trim()) {
        const contextoAgente = { W_estado:Metacognition.W_estado, frustration:Metacognition.frustration };
        const phrasePsi = SemanticTokenizer.synthesizePhraseGeometry(cTokens, contextoAgente);
        const chatSig = { lexical:chatInput.trim().substring(0,80), tokens:cTokens.map(t=>t.form), psiTokens:cTokens, psi:phrasePsi };
        const similar = brain.findSimilarLocal(chatSig);
        if (!similar||similar.similarity<0.75) { brain.createNode(chatSig,'emergent',0); }
        else {
          const ex=brain.nodes.get(similar.id);
          if(ex){ex.fireCount++;ex.lastFired=Date.now();ex.weight=Math.min(1,ex.weight+0.05);brain.dirtyNodes.add(ex);}
        }
      }

      if (cClusters.length>1&&chatDecision.confidence>0.4) {
        for(let ci=0;ci<cClusters.length-1;ci++){
          const clA=cClusters[ci],clB=cClusters[ci+1];
          let psiW = clA.psi&&clB.psi ? Math.cos(Math.abs(clA.psi.theta-clB.psi.theta)*Math.PI/180)*chatDecision.confidence*0.1 : chatDecision.confidence*0.07;
          brain.nodes.forEach((nA,idA)=>{
            if(nA.signature?.lexical?.includes(clA.centroid)){
              brain.nodes.forEach((nB,idB)=>{
                if(idA!==idB&&nB.signature?.lexical?.includes(clB.centroid)) brain.hebbianConnect(idA,idB,psiW);
              });
            }
          });
        }
      }

      Metacognition.update({confidence:(chatDecision.confidence-0.5)*0.1, arousal:chatDecision.action==='explore'?0.05:-0.02});

      // Inércia Contextual + Recuperação Episódica para chat
      const contextoAgenteChat = { W_estado: Metacognition.W_estado, frustration: Metacognition.frustration };
      const psiChat = SemanticTokenizer.synthesizePhraseGeometry(cTokens, contextoAgenteChat);
      if (psiChat) ContextualInertia.update(psiChat, chatInput, cycle);
      const psiQueryChat     = psiChat ? ContextualInertia.biasedQuery(psiChat) : null;
      const chatRecalled     = EpisodicRecall.recall(psiQueryChat);
      const chatEpisodicBoost = EpisodicRecall.injectIntoGraph(chatRecalled, brain);

      const chatResponse = ResponseSynthesizer.synthesize({
        input:chatInput, decision:chatDecision, activation:chatActivation,
        semantic:{tokens:cTokens,clusters:cClusters,causalPairs:cCausal},
        negation:{contradictions:cContradictions},
        regime:brain.memoryManager.decayRegime, cycle,
        context: {
          contextPsi:       ContextualInertia.getContextPsi(),
          recalledEpisodes: chatRecalled.map(e => ({ input: e.input.substring(0,60), similarity: e.similarity, concepts: e.concepts.slice(0,3) })),
          episodicBoost:    chatEpisodicBoost,
        },
      });

      const episodeChat = {
        cycle, timestamp:Date.now(), decision:chatDecision, metacognition:serializeMeta(),
        input:chatInput, response:chatResponse.text,
        psiInput: psiChat,
        semantic:{tokenCount:cTokens.length, clusters:cClusters.length}
      };
      await Persistence.saveEpisode(episodeChat);
      EpisodicRecall.push(episodeChat);

      self.postMessage({
        type:'chatResponse', cycle, input:chatInput, response:chatResponse,
        decision:chatDecision, metacognition:serializeMeta(), stats:brain.getStats(),
        semantic:{
          tokens: cTokens.map(t=>({form:t.form,weight:t.semanticWeight,underNegation:t.roles.underNegation,isNeg:t.roles.isNeg,isCausal:t.roles.isCausal,entityType:t.roles.entityType,psi:t.psi})),
          clusters:cClusters, causalPairs:cCausal.map(p=>({cause:p.cause,effect:p.effect}))
        },
        negation:{ contradictions:cContradictions.slice(0,3), summary:negationGraph.summarize() },
        activation:{ activated:(chatActivation?.activated||[]).map(n=>({id:n.id,activation:n.activation,lexical:n.signature?.lexical?.substring(0,40)||''})) },
        decayRegime:brain.memoryManager.decayRegime,
        context: {
          contextPsi:       ContextualInertia.getContextPsi(),
          recalledEpisodes: chatRecalled.map(e=>({input:e.input.substring(0,40),similarity:+e.similarity.toFixed(3),concepts:e.concepts.slice(0,3)})),
          episodicBoost:    chatEpisodicBoost,
          contextSummary:   ContextualInertia.summary(),
        },
      });
      break;
    }

    case 'feedback': {
      const { nodeIds=[], positive, intensity=0.15 } = payload||{};
      const delta = positive ? intensity : -intensity*0.8;
      if (nodeIds.length >= 2) {
        for (let i=0;i<nodeIds.length-1;i++) {
          const nA=brain.nodes.get(nodeIds[i]), nB=brain.nodes.get(nodeIds[i+1]);
          if (nA&&nB) {
            if (positive) { brain.hebbianConnect(nodeIds[i],nodeIds[i+1],delta); }
            else {
              const key1=nodeIds[i]+'→'+nodeIds[i+1], key2=nodeIds[i+1]+'→'+nodeIds[i];
              const syn=brain.synapses.get(key1)||brain.synapses.get(key2);
              if (syn){syn.weight=Math.max(0,syn.weight+delta);brain.dirtySynapses.add(syn);}
            }
          }
        }
      }
      if (positive){Metacognition.update({confidence:0.05});}
      else {Metacognition.update({frustration:0.08,confidence:-0.03});}
      self.postMessage({ type:'feedbackAck', positive, nodeCount:nodeIds.length, metacognition:serializeMeta() });
      break;
    }

    case 'induceFrustration':
      Metacognition.frustration = Math.max(0, Math.min(1, payload));
      self.postMessage({ type:'state', metacognition:serializeMeta() });
      break;

    case 'getState':
      self.postMessage({ type:'state', stats:brain.getStats(), metacognition:serializeMeta(), cycle });
      break;

    case 'getDiagnostics': {
      const negNodes = Array.from(negationGraph.nodes.values()).map(n=>({
        id:n.id, concept:n.concept, polarity:n.polarity, weight:n.weight,
        psi:n.psi, contradicts:Array.from(n.contradicts||[])
      }));
      const negEdges = Array.from(negationGraph.edges.entries()).map(([k,e])=>{
        const [src,tgt]=k.split('::'); return {src,tgt,...e};
      });
      const actionWin  = brain.memoryManager.actionHistory.slice(-50);
      const actionFreq = {};
      actionWin.forEach(a=>{actionFreq[a.action]=(actionFreq[a.action]||0)+1;});
      const allNodes = Array.from(brain.nodes.values()).map(n=>({
        id:n.id, type:n.type, layer:n.layer,
        weight:+(n.weight||0).toFixed(4), fireCount:n.fireCount||0,
        activation:+(n.activation||0).toFixed(4), lastFired:n.lastFired||0,
        lexical:n.signature?.lexical?.substring(0,80)||'',
        psi:n.signature?.psi||null,
      }));
      self.postMessage({
        type:'diagnostics', cycle,
        semantic:{tokens:[],clusters:[],causalPairs:[]},
        negation:{nodes:negNodes,edges:negEdges,contradictions:negationGraph.getContradictions(),summary:negationGraph.summarize()},
        overfit:{signal:brain._overfitSignal||null,actionFreq,actionHistory:actionWin},
        nodes:allNodes, stats:brain.getStats(),
        geometry:{ kdTreeSize:globalKDTree.size(), points: globalKDTree._points.slice(0,100).map(p=>({form:p.form,psi:p.psi})) }
      });
      break;
    }

    case 'exportBrain': {
      const expNodes    = Array.from(brain.nodes.values());
      const expSynapses = Array.from(brain.synapses.values());
      const expEpisodes = await DB.episodes.toArray().catch(()=>[]);
      self.postMessage({
        type:'exportData',
        payload:{
          version:'AIO-v2.0-geometric', exported:new Date().toISOString(),
          cycle, metacognition:serializeMeta(), stats:brain.getStats(),
          decayRegime:brain.memoryManager.decayRegime,
          nodes:expNodes, synapses:expSynapses,
          episodes:expEpisodes.slice(-200),
          geometry:{ kdTreeSize:globalKDTree.size() },
        }
      });
      break;
    }

    case 'resetContext':
      ContextualInertia.reset();
      self.postMessage({ type:'contextReset' });
      break;

    case 'getContext':
      self.postMessage({
        type:    'contextState',
        context: ContextualInertia.summary(),
        episodic: EpisodicRecall.stats(),
      });
      break;

    case 'reset':
      await DB.delete();
      ContextualInertia.reset();
      self.postMessage({ type:'reset' });
      break;
  }
};

// Placeholder to signal end of base file