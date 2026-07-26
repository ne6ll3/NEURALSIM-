// ── State ─────────────────────────────────────────────────────────────────────
let worker       = null;
let mode         = 'chat';
let agentReady   = false;
let currentPsi   = null;
let allNodes     = [];       // para o canvas
let lastMeta     = {};
let lastStats    = {};
let auditTrail   = [];
let activLog     = [];
let beliefs      = [];
let animFrame    = null;
let canvasNodes  = [];       // nós a desenhar no canvas
const MAX_LOG    = 200;
const MAX_AUDIT  = 100;
const MAX_ACTIV  = 150;

// ── Worker bootstrap ──────────────────────────────────────────────────────────
function initWorker() {
  try {
    // 1. Descobre a URL base da página/script atual (ex: https://seu-site.com/minha-pasta/)
    const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);

    // 2. Injeta a baseUrl dentro do código do Blob
    const blob = new Blob([`
      try {
        // Concatena a baseUrl para garantir o caminho absoluto correto
        importScripts(
        '${baseUrl}aio-worker-v4.js',
        '${baseUrl}aio-patch-context.js',
        '${baseUrl}aio-patch-semantic-depth.js',
        '${baseUrl}aio-patch-orchestration.js',
        '${baseUrl}aio-patch-propositions.js',
        '${baseUrl}aio-patch-entityframe.js',
        '${baseUrl}aio-patch-quantity.js',
        '${baseUrl}aio-patch-commands.js',
        '${baseUrl}aio-patch-patternlayer.js',
        '${baseUrl}aio-patch-import.js',
        '${baseUrl}aio-patch-reconciliation.js',
          '${baseUrl}aio-patch-antipattern.js,
          '${baseUrl}aio-patch-semanticwalker.js'
        );
      } catch(e) {
        // Fallback: tenta só o v4 se os patches não existirem
        try { 
          importScripts('${baseUrl}aio-worker-v4.js'); 
        } catch(e2) {}
        self.postMessage({ type: '__patch_missing__', error: e.message });
      }
    `], { type: 'application/javascript' });

    // O resto do seu código permanece igual e funcional
    worker = new Worker(URL.createObjectURL(blob));
    worker.onmessage = onWorkerMessage;
    worker.onerror = onWorkerError;

    setStatus('thinking', 'a carregar...');
    log('info', 'SYS', 'Worker iniciado');
  } catch(e) {
    setStatus('', 'erro worker');
    log('error', 'SYS', 'Falha ao criar worker: ' + e.message);
  }
}

function onWorkerMessage(e) {
  const msg = e.data;
  if (!msg || !msg.type) return;

  switch(msg.type) {

    case '__worker_alive__':
      log('debug', 'WRK', 'Worker vivo');
      worker.postMessage({ command: 'init' });
      break;

    case '__worker_error__':
      log('error', 'WRK', msg.message);
      setStatus('', 'erro');
      break;

    case '__patch_missing__':
      log('warn', 'WRK', 'Patches não encontrados: ' + msg.error);
      log('warn', 'WRK', 'A correr apenas com aio-worker-v4.js');
      break;

    case 'initialized':
      agentReady = true;
      setStatus('alive', 'pronto');
      document.getElementById('btn-send').disabled = false;
      addSystemMsg('Agente iniciado. ' + (msg.data?.nodeCount||0) + ' nós carregados.');
      log('success', 'INIT', 'Agente pronto. Nós: ' + (msg.data?.nodeCount||0));
      break;

    case 'decision':
    case 'chatResponse':
      handleDecision(msg);
      break;

    case 'sync':
      handleSync(msg);
      break;

    case 'autonomousTick':
      handleAutonomousTick(msg);
      break;

    case 'dreamComplete':
      log('success', 'DREAM', 'Consolidação concluída. Nós: ' + msg.nodes);
      addSystemMsg('Dream cycle concluído.');
      break;

    case 'contextEnriched':
      handleContextEnriched(msg);
      break;

    case 'semanticDepthUpdate':
      handleSemanticDepth(msg);
      break;

    case 'orchestrationState':
      handleOrchestration(msg);
      break;

    case 'newBeliefs':
      handleNewBeliefs(msg.beliefs);
      break;

    case 'topicTick':
      // silent — actualiza apenas internamente
      break;

    case 'reset':
      location.reload();
      break;
  }
}

function onWorkerError(e) {
  setStatus('', 'erro');
  log('error', 'WRK', e.message || 'Erro desconhecido no worker');
}

// ── Message handlers ──────────────────────────────────────────────────────────
function handleDecision(msg) {
  setStatus('alive', 'pronto');

  const resp   = msg.response || {};
  const text   = resp.text || '(sem resposta)';
  const meta   = msg.metacognition || {};
  const stats  = msg.stats || {};
  const sem    = msg.semantic || {};

  lastMeta  = meta;
  lastStats = stats;

  // Actualiza header
  updateHeader(meta, stats);

  // Mostra resposta no chat
  const tags = [];
  if (resp.plannerUsed) {
    tags.push({ cls:'tag-act', txt: resp.speechActApplied || resp.intent || '?' });
    if (resp.verificationScore != null)
      tags.push({ cls:'tag-res', txt: 'coe:' + (resp.verificationScore*100|0) + '%' });
  }
  if (resp.resonance > 0)
    tags.push({ cls:'tag-res', txt: 'res:' + resp.resonance + '%' });
  if (meta.contextPsi)
    tags.push({ cls:'tag-act', txt: 'ctx:θ' + Math.round(meta.contextPsi.theta||0) + '°' });

  addAgentMsg(text, tags);

  // PSI do input
  if (resp.psiInput) {
    currentPsi = resp.psiInput;
    updatePsiLegend(resp.psiInput);
  }

  // Audit trail
  const auditEntry = {
    cycle:    msg.cycle,
    ts:       new Date().toLocaleTimeString(),
    input:    (msg.input||'').substring(0,60),
    response: text.substring(0,80),
    intent:   resp.intent,
    psi:      resp.psiInput,
    regime:   resp.regime,
    recalled: resp.recalled?.length || 0,
    semantic: sem,
    meta:     { f: meta.frustration, a: meta.arousal, c: meta.confidence },
  };
  auditTrail.unshift(auditEntry);
  if (auditTrail.length > MAX_AUDIT) auditTrail.pop();
  renderAudit();

  // Activações
  if (msg.activation?.activated) {
    const aNodes = msg.activation.activated.filter(n => n);
    aNodes.forEach(n => {
      activLog.unshift({
        form:    n.lexical || n.id || '?',
        val:     (n.activation||0).toFixed(3),
        sources: n.activationSources || null,
        cycle:   msg.cycle,
      });
    });
    if (activLog.length > MAX_ACTIV) activLog.length = MAX_ACTIV;
    renderActivations();
  }

  // Canvas nodes update
  updateCanvasNodes(msg);

  // Log detalhado
  log('info', 'RSP', `[${msg.cycle}] intent:${resp.intent} regime:${resp.regime} planner:${resp.plannerUsed?'✓':'—'}`);
  if (sem.tokens) {
    const heavy = sem.tokens.filter(t => (t.compositionalWeight||t.weight||0) > 0.6);
    if (heavy.length > 0) {
      log('debug', 'SEM', 'Tokens pesados: ' + heavy.map(t=>t.form+'('+((t.compositionalWeight||t.weight||0)*100|0)+'%)').join(' '));
    }
  }
  if (resp.recalled?.length > 0) {
    log('info', 'EPI', 'Episódios recuperados: ' + resp.recalled.map(r=>r.input?.substring(0,20)).join(' | '));
  }
}

function handleSync(msg) {
  updateHeader(msg.metacognition, msg.stats);
  if (msg.decayRegime) {
    document.getElementById('m-regime').textContent = msg.decayRegime;
    const rColours = { STABLE:'var(--green)', MILD:'var(--amber)', HIGH:'var(--red)', CRISIS:'var(--red)' };
    document.getElementById('m-regime').style.color = rColours[msg.decayRegime] || 'var(--text)';
  }
}

function handleAutonomousTick(msg) {
  if (msg.goals?.length > 0) {
    renderGoals(msg.goals);
  }
  // Actualiza surpresa no header
  if (msg.surprise != null) {
    document.getElementById('hdr-surprise').textContent = msg.surprise.toFixed(2);
    document.getElementById('m-surprise').textContent   = msg.surprise.toFixed(3);
  }
}

function handleContextEnriched(msg) {
  if (!msg) return;
  // Topic
  if (msg.topic) {
    log('debug', 'TOP', 'Tópico: ' + msg.topic.label + ' conf:' + (msg.topic.confidence*100|0) + '% clusters:' + (msg.topic.clusters||1));
  }
  // Change
  if (msg.topicChange?.changed) {
    const t = msg.topicChange.type;
    log('warn', 'CHG', 'Mudança de tópico [' + t.toUpperCase() + '] drift:' + (msg.topicChange.metrics.drift*100|0) + '%');
  }
  // Alerts
  if (msg.alerts?.dominanceHigh) {
    log('warn', 'DOM', 'Dominância episódica alta: ' + (msg.topicChange?.metrics.dominance*100|0) + '%');
  }
  if (msg.alerts?.fidelityLow) {
    log('warn', 'FID', 'Fidelidade baixa: ' + (msg.topicChange?.metrics.fidelity*100|0) + '%');
  }
  // Speech act
  if (msg.speechAct) {
    log('debug', 'ACT', 'Acto de fala: ' + msg.speechAct.act + '/' + msg.speechAct.subtype + ' conf:' + (msg.speechAct.confidence*100|0) + '%');
  }
}

function handleSemanticDepth(msg) {
  if (!msg) return;
  const c = msg.compositional;

  // X da conversa
  if (msg.X) {
    const xEl  = document.getElementById('hdr-x');
    const pill = document.getElementById('hdr-x-pill');
    xEl.textContent = msg.X.form + ' (' + (msg.X.centrality*100|0) + ')';
    pill.style.display = 'flex';
    log('debug', 'X', '"' + msg.X.form + '" central:' + msg.X.centrality.toFixed(4) + (msg.X.changed?' [MUDOU]':''));
  }

  // Tensões composicionais
  if (c?.tensions?.length > 0) {
    c.tensions.forEach(t => {
      log('warn', 'TEN', '"' + t.negator + '" + "' + t.concept + '" peso:' + (t.weight*100|0) + '%');
    });
  }

  // Token dominante
  if (c?.dominantToken) {
    log('debug', 'DOM', 'Token dominante: "' + c.dominantToken.form + '" cw:' + (c.dominantToken.compositionalWeight*100|0) + '%');
  }

  // Novas crenças
  if (msg.beliefs?.new?.length > 0) {
    handleNewBeliefs(msg.beliefs.new);
  }

  // Nós emocionalmente tensos
  if (msg.emotionalHighlights?.length > 0) {
    msg.emotionalHighlights.forEach(h => {
      log('warn', 'EMO', '"' + h.form + '" tenso f_avg:' + (h.profile.avgFrustration*100|0) + '%');
    });
  }
}

function handleOrchestration(msg) {
  if (!msg) return;

  // Purity
  if (msg.topicPurity != null) {
    document.getElementById('leg-purity').textContent = (msg.topicPurity*100|0) + '%';
    const pc = msg.topicPurity > 0.7 ? 'var(--green)' : msg.topicPurity > 0.4 ? 'var(--amber)' : 'var(--red)';
    document.getElementById('leg-purity').style.color = pc;
  }

  // Atenção tálamo
  if (msg.attention) {
    const a = msg.attention;
    setBarVal('at-em', a.emergent);
    setBarVal('at-in', a.inferential);
    setBarVal('at-fz', a.fuzzy);
  }

  // Activation sources
  if (msg.sourceSample?.length > 0) {
    renderSources(msg.sourceSample);
  }

  log('debug', 'ORC', 'purity:' + (msg.topicPurity*100|0) + '% beliefs:' + msg.beliefs + ' emergent:' + msg.emergentBeliefs);
}

function handleNewBeliefs(newBeliefs) {
  if (!newBeliefs?.length) return;
  newBeliefs.forEach(b => {
    beliefs.unshift({ ...b, ts: new Date().toLocaleTimeString() });
    log('success', 'BEL', 'Nova crença: "' + b.statement + '" peso:' + (b.weight*100|0) + '%');
    addSystemMsg('Crença emergente: "' + b.statement + '"');
  });
  renderBeliefs();
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function setStatus(cls, text) {
  const dot  = document.getElementById('status-dot');
  const txt  = document.getElementById('status-text');
  dot.className = 'status-dot' + (cls ? ' ' + cls : '');
  txt.textContent = text;
}

function updateHeader(meta, stats) {
  if (!meta && !stats) return;
  if (meta) {
    document.getElementById('hdr-frust').textContent   = (meta.frustration||0).toFixed(2);
    document.getElementById('hdr-conf').textContent    = (meta.confidence||0).toFixed(2);
    document.getElementById('hdr-surprise').textContent= (meta.surprise||0).toFixed(2);
    document.getElementById('m-frust').textContent     = (meta.frustration||0).toFixed(3);
    document.getElementById('m-arousal').textContent   = (meta.arousal||0).toFixed(3);
    document.getElementById('m-conf').textContent      = (meta.confidence||0).toFixed(3);
    document.getElementById('m-surprise').textContent  = (meta.surprise||0).toFixed(3);
  }
  if (stats) {
    document.getElementById('hdr-nodes').textContent = stats.nodes||0;
    document.getElementById('hdr-kd').textContent    = stats.kdTreeSize||0;
    document.getElementById('m-nodes').textContent   = stats.nodes||0;
    document.getElementById('m-synapses').textContent= stats.synapses||0;
    document.getElementById('m-kd').textContent      = stats.kdTreeSize||0;
    document.getElementById('m-active').textContent  = stats.activeNodes||0;
  }
}

function updatePsiLegend(psi) {
  if (!psi) return;
  document.getElementById('leg-r').textContent     = psi.r.toFixed(3);
  document.getElementById('leg-theta').textContent = Math.round(psi.theta) + '°';
  document.getElementById('leg-z').textContent     = psi.z.toFixed(3);
}

function setBarVal(id, val) {
  const pct = Math.round((val||0) * 100);
  document.getElementById(id).textContent = pct + '%';
  const bar = document.getElementById(id + '-bar');
  if (bar) bar.style.width = pct + '%';
}

// ── Chat ──────────────────────────────────────────────────────────────────────
function addAgentMsg(text, tags) {
  const el = document.createElement('div');
  el.className = 'msg msg-agent';
  el.innerHTML = '<div>' + escHtml(text) + '</div>';
  if (tags?.length) {
    const tm = document.createElement('div');
    tm.className = 'msg-meta';
    tags.forEach(t => {
      const span = document.createElement('span');
      span.className = 'tag ' + t.cls;
      span.textContent = t.txt;
      tm.appendChild(span);
    });
    el.appendChild(tm);
  }
  appendChat(el);
}

function addUserMsg(text) {
  const el = document.createElement('div');
  el.className = 'msg msg-user';
  el.textContent = text;
  appendChat(el);
}

function addSystemMsg(text) {
  const el = document.createElement('div');
  el.className = 'msg-system';
  el.textContent = text;
  appendChat(el);
}

function appendChat(el) {
  const container = document.getElementById('chat-messages');
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}

// ── Send ──────────────────────────────────────────────────────────────────────
function sendMessage() {
  if (!agentReady || !worker) return;
  const input = document.getElementById('chat-input');
  const text  = input.value.trim();
  if (!text) return;

  addUserMsg(text);
  input.value = '';
  input.style.height = 'auto';
  setStatus('thinking', 'a processar...');

  const cmd = mode === 'perceive' ? 'perceive'
            : mode === 'train'    ? 'perceive'
            : 'chat';

  worker.postMessage({ command: cmd, payload: text });

  // Após cada mensagem, pede estado de orquestração
  setTimeout(() => {
    if (worker) worker.postMessage({ command: 'getOrchestration' });
  }, 300);

  log('info', 'USR', '[' + mode.toUpperCase() + '] ' + text.substring(0,60));
}

function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 100) + 'px';
}

function setMode(m) {
  mode = m;
  document.querySelectorAll('.mode-tab').forEach((tab, i) => {
    const modes = ['chat','perceive','train'];
    tab.classList.toggle('active', modes[i] === m);
  });
  document.getElementById('chat-input').placeholder =
    m === 'chat'    ? 'Mensagem...' :
    m === 'perceive'? 'Input sensorial...' :
                      'Frase de treino...';
}

// ── PSI Canvas ────────────────────────────────────────────────────────────────
function updateCanvasNodes(msg) {
  // Recolhe nós para desenhar
  const nodes = [];
  if (msg.activation?.activated) {
    msg.activation.activated.forEach(n => {
      if (n?.psi || (n && msg.response?.psiInput)) {
        nodes.push({ psi: n.psi || msg.response?.psiInput, act: n.activation||0, form: n.lexical||'' });
      }
    });
  }
  if (msg.response?.psiInput) {
    nodes.push({ psi: msg.response.psiInput, act: 1.0, form: 'INPUT', isInput: true });
  }
  canvasNodes = nodes;
}

function drawPsiCanvas() {
  const canvas = document.getElementById('psi-canvas');
  const ctx    = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const cx = W/2, cy = H/2;
  const R  = Math.min(W,H)/2 - 20;

  ctx.clearRect(0, 0, W, H);

  // Fundo
  ctx.fillStyle = '#0a0e17';
  ctx.fillRect(0, 0, W, H);

  // Círculos de raio
  [0.25, 0.5, 0.75, 1.0].forEach(r => {
    ctx.beginPath();
    ctx.arc(cx, cy, R * r, 0, Math.PI * 2);
    ctx.strokeStyle = r === 1.0 ? '#1a2744' : '#0f1729';
    ctx.lineWidth   = r === 1.0 ? 1.5 : 1;
    ctx.stroke();
    // Label raio
    ctx.fillStyle = '#475569';
    ctx.font = '9px JetBrains Mono';
    ctx.fillText(r.toFixed(2), cx + R * r + 2, cy - 2);
  });

  // Linhas de quadrante gramatical
  const quadrants = [
    { a: 0,   label: 'SUJEITO',    color: '#00d4ff33' },
    { a: 90,  label: 'PREDICADO',  color: '#7c3aed33' },
    { a: 180, label: 'OBJECTO',    color: '#10b98133' },
    { a: 270, label: 'OPERADORES', color: '#f59e0b33' },
  ];
  quadrants.forEach(q => {
    const rad = (q.a - 90) * Math.PI / 180;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(rad) * R, cy + Math.sin(rad) * R);
    ctx.strokeStyle = '#1a2744';
    ctx.lineWidth = 1;
    ctx.stroke();
    // Label quadrante
    const lRad = (q.a + 45 - 90) * Math.PI / 180;
    const lx   = cx + Math.cos(lRad) * (R * 0.88);
    const ly   = cy + Math.sin(lRad) * (R * 0.88);
    ctx.fillStyle = q.color.replace('33','88');
    ctx.font = '8px JetBrains Mono';
    ctx.textAlign = 'center';
    ctx.fillText(q.label, lx, ly);
  });
  ctx.textAlign = 'left';

  // Ângulos marcados
  for (let a = 0; a < 360; a += 30) {
    const rad = (a - 90) * Math.PI / 180;
    const x1  = cx + Math.cos(rad) * (R - 5);
    const y1  = cy + Math.sin(rad) * (R - 5);
    const x2  = cx + Math.cos(rad) * R;
    const y2  = cy + Math.sin(rad) * R;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = '#243557';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Nós activados
  canvasNodes.forEach(node => {
    if (!node.psi) return;
    const rad = (node.psi.theta - 90) * Math.PI / 180;
    const nr  = node.psi.r * R;
    const nx  = cx + Math.cos(rad) * nr;
    const ny  = cy + Math.sin(rad) * nr;

    // Z como tamanho do ponto
    const size = 3 + node.psi.z * 8 + node.act * 4;

    if (node.isInput) {
      // Input: marcador especial
      ctx.beginPath();
      ctx.arc(nx, ny, size + 3, 0, Math.PI * 2);
      ctx.strokeStyle = '#00d4ff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Pulso
      ctx.beginPath();
      ctx.arc(nx, ny, size + 6 + Math.sin(Date.now()/300)*3, 0, Math.PI * 2);
      ctx.strokeStyle = '#00d4ff44';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Cor baseada no quadrante θ
    const color = node.psi.theta < 90  ? '#00d4ff' :
                  node.psi.theta < 180 ? '#7c3aed' :
                  node.psi.theta < 270 ? '#10b981' : '#f59e0b';

    ctx.beginPath();
    ctx.arc(nx, ny, size, 0, Math.PI * 2);
    ctx.fillStyle = color + Math.round(node.act * 255).toString(16).padStart(2,'0');
    ctx.fill();

    // Label
    if (node.form && node.act > 0.3) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '9px JetBrains Mono';
      ctx.fillText(node.form.substring(0,10), nx + size + 2, ny + 3);
    }
  });

  // ψ actual do input (linha do centro)
  if (currentPsi) {
    const rad = (currentPsi.theta - 90) * Math.PI / 180;
    const nr  = currentPsi.r * R;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(rad) * nr, cy + Math.sin(rad) * nr);
    ctx.strokeStyle = '#00d4ff55';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  animFrame = requestAnimationFrame(drawPsiCanvas);
}

// ── Log rendering ─────────────────────────────────────────────────────────────
let logBuffer = [];

function log(level, tag, msg) {
  const entry = { level, tag, msg, ts: new Date().toLocaleTimeString('pt',{hour:'2-digit',minute:'2-digit',second:'2-digit'}) };
  logBuffer.unshift(entry);
  if (logBuffer.length > MAX_LOG) logBuffer.pop();
  renderLog();
}

function renderLog() {
  const panel = document.getElementById('log-panel-log');
  panel.innerHTML = logBuffer.slice(0, 60).map(e =>
    `<div class="log-entry ${e.level}">
      <span class="log-ts">${e.ts}</span>
      <span class="log-type">[${e.tag}]</span>
      <span class="log-msg">${escHtml(e.msg)}</span>
    </div>`
  ).join('');
}

function renderAudit() {
  const panel = document.getElementById('log-panel-audit');
  panel.innerHTML = auditTrail.slice(0,40).map(a =>
    `<div class="audit-entry">
      <div class="audit-header">
        <span class="audit-cycle">CIC ${a.cycle||'—'}</span>
        <span class="audit-time">${a.ts}</span>
      </div>
      <div class="audit-body">
        <span class="audit-key">input: </span><span class="audit-val">${escHtml((a.input||'').substring(0,50))}</span><br>
        <span class="audit-key">resp:  </span><span class="audit-val">${escHtml((a.response||'').substring(0,60))}</span><br>
        <span class="audit-key">intent:</span><span class="audit-val"> ${a.intent||'—'}</span>
        <span class="audit-key"> regime:</span><span class="audit-val"> ${a.regime||'—'}</span><br>
        ${a.psi ? `<span class="audit-psi">ψ r:${a.psi.r.toFixed(2)} θ:${Math.round(a.psi.theta)}° z:${a.psi.z.toFixed(2)}</span><br>` : ''}
        <span class="audit-key">f:</span><span class="audit-val">${(a.meta?.f||0).toFixed(3)}</span>
        <span class="audit-key"> a:</span><span class="audit-val">${(a.meta?.a||0).toFixed(3)}</span>
        <span class="audit-key"> c:</span><span class="audit-val">${(a.meta?.c||0).toFixed(3)}</span>
        <span class="audit-key"> epi:</span><span class="audit-val">${a.recalled}</span>
      </div>
    </div>`
  ).join('') || '<div class="empty-state">Sem entradas ainda</div>';
}

function renderActivations() {
  const panel = document.getElementById('log-panel-activations');
  panel.innerHTML = activLog.slice(0,60).map(a =>
    `<div class="act-entry">
      <span class="act-node">${escHtml(a.form)}</span>
      <span style="color:var(--text3)"> act:</span>
      <span class="act-val">${a.val}</span>
      ${a.sources ? `<div class="act-src">res:${a.sources.resonance.toFixed(2)} epi:${a.sources.episodic.toFixed(2)} ctx:${a.sources.context.toFixed(2)} aut:${a.sources.autonomous.toFixed(2)}</div>` : ''}
    </div>`
  ).join('') || '<div class="empty-state">Sem activações</div>';
}

function renderBeliefs() {
  const panel = document.getElementById('log-panel-beliefs');
  const all   = beliefs;
  if (all.length === 0) {
    panel.innerHTML = '<div class="empty-state">Sem crenças ainda\nO agente forma crenças com uso</div>';
    return;
  }
  panel.innerHTML = all.map(b =>
    `<div class="belief-card ${b.emergent?'belief-emergent':''}">
      <div class="belief-stmt">${escHtml(b.statement)}</div>
      <div class="belief-meta">
        peso:${(b.weight*100|0)}%
        ${b.instances ? ' inst:'+b.instances : ''}
        ${b.consistency ? ' cons:'+(b.consistency*100|0)+'%' : ''}
        ${b.emergent ? ' [emergente]' : ' [core]'}
        ${b.ts ? ' '+b.ts : ''}
      </div>
    </div>`
  ).join('');
}

function renderGoals(goals) {
  const el = document.getElementById('m-goals');
  if (!goals?.length) { el.innerHTML = '<div class="empty-state">Sem objectivos</div>'; return; }
  el.innerHTML = goals.slice(0,5).map(g =>
    `<div class="metric-card" style="margin-bottom:5px">
      <div class="mk">${g.type}</div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:3px">
        <div class="bar-track" style="flex:1">
          <div class="bar-fill" style="width:${(g.urgency*100|0)}%;background:var(--amber)"></div>
        </div>
        <span style="font-family:var(--mono);font-size:10px;color:var(--amber)">${(g.urgency*100|0)}%</span>
      </div>
    </div>`
  ).join('');
}

function renderSources(sources) {
  const el = document.getElementById('sources-list');
  el.innerHTML = sources.map(s => {
    const src = s.sources || { resonance:0, episodic:0, context:0, autonomous:0 };
    const total = src.resonance + src.episodic + src.context + src.autonomous || 0.001;
    return `<div class="source-node">
      <div class="source-node-name">${escHtml(s.form)} <span style="color:var(--text3);font-size:9px">act:${s.activation}</span></div>
      <div class="source-bars">
        ${sourceBar('Ressonância', src.resonance, total, 'sb-resonance')}
        ${sourceBar('Episódica',   src.episodic,  total, 'sb-episodic')}
        ${sourceBar('Contexto',    src.context,   total, 'sb-context')}
        ${sourceBar('Autónoma',    src.autonomous,total, 'sb-autonomous')}
      </div>
    </div>`;
  }).join('') || '<div class="empty-state">Sem activações</div>';
}

function sourceBar(label, val, total, cls) {
  const pct = Math.min(100, Math.round((val/total)*100));
  return `<div class="source-bar-row">
    <span class="source-bar-label">${label}</span>
    <div class="source-bar-track">
      <div class="source-bar-fill ${cls}" style="width:${pct}%"></div>
    </div>
    <span class="source-bar-val">${val.toFixed(2)}</span>
  </div>`;
}

// ── Panel switching ───────────────────────────────────────────────────────────
function showVizPanel(name) {
  document.querySelectorAll('.viz-tab').forEach((t,i) => {
    const names = ['psi','metrics','sources'];
    t.classList.toggle('active', names[i] === name);
  });
  document.getElementById('panel-psi').style.display     = name==='psi'     ? 'flex' : 'none';
  document.getElementById('panel-metrics').style.display = name==='metrics' ? 'block': 'none';
  document.getElementById('panel-sources').style.display = name==='sources' ? 'block': 'none';
}

function showLogPanel(name) {
  document.querySelectorAll('.log-tab').forEach((t,i) => {
    const names = ['log','audit','activations','beliefs'];
    t.classList.toggle('active', names[i] === name);
  });
  ['log','audit','activations','beliefs'].forEach(n => {
    document.getElementById('log-panel-'+n).style.display = n===name ? 'block' : 'none';
  });
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str||'')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

function resetAgent() {
  if (!confirm('Reset completo? Apaga toda a memória persistida.')) return;
  if (worker) worker.postMessage({ command: 'reset' });
}

// ── Boot ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  // Carrega crenças core do SelfModel (estáticas)
  beliefs = [
    { statement: 'contradições devem ser resolvidas', weight: 0.95, emergent: false },
    { statement: 'geometria revela relações que strings ocultam', weight: 0.90, emergent: false },
    { statement: 'coerência vale mais do que velocidade', weight: 0.85, emergent: false },
    { statement: 'incoerência deve ser recusada, não alucinada', weight: 1.0, emergent: false },
  ];
  renderBeliefs();

  // Inicia canvas
  drawPsiCanvas();

  // Inicia worker
  initWorker();

  log('info', 'SYS', 'NeuralSim Lab iniciado');
  log('info', 'SYS', 'Aguarda aio-worker-v4.js...');
});
