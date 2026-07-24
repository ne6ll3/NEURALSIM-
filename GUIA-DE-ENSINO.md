# Guia de Ensino por Camadas — NeuralSim

## Para quem é este guia

Este documento é para qualquer pessoa que vá ensinar conceitos ao agente — não apenas o investigador original. O agente aprende por proposições explícitas (sujeito → relação → objecto) e por inferência sobre essas proposições. **A ordem em que ensinas determina a qualidade do que ele consegue deduzir depois.**

O princípio central: o agente recebe tudo ao mesmo nível hierárquico, a menos que tu imponhas a hierarquia através da ordem de ensino. Uma criança não aprende "o fogo é energia" antes de saber o que é "fogo" e o que é "energia" como conceitos separados. O agente também não devia.

---

## A regra de oro

> **Nunca ensines uma relação entre dois conceitos antes de cada um deles existir isoladamente no sistema.**

Isto não cria nada de novo na arquitectura — apenas reorganiza a ordem em que usas o que já existe, para que o conhecimento fique explicável e não apenas "emergente por acidente".

---

## Camada 0 — Léxico

**Objectivo:** criar os nós. Nada mais.

```
Fogo é um conceito.
Energia é um conceito.
Combustão é um conceito.
Calor é um conceito.
```

Nesta fase não interessa o que cada coisa *é* — só que existe. O agente cria o nó geométrico (ψ) para cada palavra. Sem isto, qualquer relação ensinada depois fica ambígua, porque o agente não tem nenhum ponto de referência estável para o conceito.

**Sinal de que estás a fazer isto bem:** todas as frases desta camada têm a mesma estrutura: `X é um conceito.` Repetitivo de propósito.

---

## Camada 1 — Categoria

**Objectivo:** dizer em que "gaveta" cada conceito pertence. Ainda não estás a explicar nada — só a classificar.

```
Fogo é fenómeno.
Combustão é processo.
Energia é propriedade física.
Calor é energia.
```

### Usa `/catgmn`, não `/mean`, para isto

Esta é a correcção mais importante deste guia. `/mean` cria equivalência simétrica — "fogo é fenómeno" a 100% faz o agente tratar fogo e fenómeno como **a mesma coisa**. Isso é falso: nem todo fenómeno é fogo.

```
/catgmn:"fogo" relation=category "fenómeno" strength=0.8
/catgmn:"combustão" relation=category "processo" strength=0.85
/catgmn:"energia" relation=category "propriedade física" strength=0.9
```

`relation=category` é **assimétrica** por construção. Fogo pertence à classe fenómeno; isso nunca implica que fenómeno seja fogo, mesmo que água, vento e luz também pertençam à mesma classe.

Usa `strength` abaixo de 1.0 sempre que a categoria não seja absoluta — o que é quase sempre. `strength=1.0` só faz sentido para equivalências literais ("H2O é água"), não para pertença de classe.

---

## Camada 2 — Relações

**Objectivo:** ligar conceitos por causa, composição ou posse. Só agora o grafo ganha profundidade real.

```
Combustão causa fogo.
Fogo produz calor.
Fogo contém energia.
Calor é energia.
```

### Escolhe a relação certa, não a mais fácil

| O que queres dizer | Comando | Relação |
|---|---|---|
| A causa B | frase normal ou `/mean ... causes ...` | `CAUSES` |
| A contém B (composição) | `/catgmn relation=contains` | `CONTAINS` |
| A tem B (posse genérica) | frase normal com "tem" | `HAS` |
| A é parte de B | frase normal com "pertence" | `PART_OF` |
| A é equivalente a B | `/mean ... is ...` | `IS` |
| A parece-se com B (nunca é igual) | `/catgmn relation=similar` | `SIMILAR` |

A distinção entre `CONTAINS` e `HAS` importa: "fogo contém energia" é composição transitiva (se A contém B e B contém C, A contém C). "Fogo tem cor" é posse genérica, não transitiva da mesma forma.

---

## Camada 3 — Excepções

**Objectivo:** dizer onde a regra da Camada 1/2 *não* se aplica. O agente já tem o mecanismo para isto — usa-o explicitamente.

```
Mas nem todo fenómeno é fogo, a luz também o é.
Mas nem toda energia é calor, o som também é energia.
```

Usa o operador "mas" em frases naturais — o sistema já sabe extrair a quebra de simetria a partir de `Mas X é Y, Z não.`

Se a excepção for mais simples — só "estes dois conceitos não são a mesma coisa, apesar de estarem próximos" — usa `/oppose`:

```
/oppose:"fogo" "água"
```

Sem esta camada, o sistema generaliza demasiado a partir da Camada 1: se ensinaste "fogo é fenómeno" e nunca disseste que há outros fenómenos diferentes de fogo, o agente não tem como saber que a categoria é mais larga do que o único membro que conhece.

---

## Camada 4 — Contexto

**Objectivo:** só agora introduzes situações específicas. Antes disto, o contexto não tem nada a que se agarrar.

```
Num incêndio, o fogo descontrolado destrói.
Num laboratório, o fogo controlado serve experiências.
Na física, o fogo é uma reacção de oxidação.
```

Esta camada é a mais frágil do sistema actual — o agente não distingue ainda bem entre "isto é sempre verdade" e "isto é verdade neste contexto". Trata frases desta camada como suplementares, não como factos centrais. Se a resposta do agente parecer confundir o contexto com a regra geral, é sinal de que ensinaste a Camada 4 antes de tempo, ou sem Camada 0-3 suficientemente sólida por baixo.

---

## Ferramentas de verificação — usa-as sempre

Depois de ensinar qualquer camada, confirma com:

```
/why:"fogo"
```

Mostra-te exactamente o que o agente sabe sobre o conceito — todas as proposições, a confiança de cada uma, e se alguma está disputada ou marcada para esquecimento.

Se corrigires um erro:

```
/incorrect:"frase errada que o agente disse"
/correct:"frase certa"
```

Isto não apaga a crença antiga — disputa-a estruturalmente, mantendo o histórico para auditoria.

Se quiseres testar sem ensinar nada (importante quando estás só a explorar, não a corrigir o conhecimento permanente):

```
//stop learn
... as tuas perguntas de teste ...
//start learn
```

---

## Erros comuns de quem está a começar a ensinar

**Erro 1 — Saltar a Camada 0.**
Ensinar "fogo é energia" como primeira frase sobre fogo. O agente cria os dois nós ao mesmo tempo, sem nenhuma base prévia — funciona, mas é mais frágil a ambiguidade do que se "fogo" e "energia" já existissem isolados primeiro.

**Erro 2 — Usar `/mean` para categoria.**
Já explicado acima — é a causa mais comum de poluição do espaço ψ. Se a frase tem a forma "X é um tipo de Y" ou "X é um Y", quase certamente queres `/catgmn relation=category`, não `/mean ... is ...`.

**Erro 3 — Ensinar excepções tarde demais, ou nunca.**
Sem Camada 3, o agente assume que a primeira instância de uma categoria que viu é representativa de toda a categoria. Isto não é um bug — é a consequência lógica de teres ensinado uma coisa só.

**Erro 4 — Misturar `strength` sem critério.**
`strength` não é "quão confiante estou nisto" — é "quão equivalentes/próximos são estes dois conceitos especificamente". Usa 1.0 raramente, só para equivalências literais. A maioria das relações reais do mundo estão entre 0.6 e 0.9.

---

## Resumo visual

```
Camada 0 — Léxico       "Fogo é um conceito."
        ↓
Camada 1 — Categoria    /catgmn:"fogo" relation=category "fenómeno" strength=0.8
        ↓
Camada 2 — Relações     "Fogo produz calor." / /catgmn relation=contains
        ↓
Camada 3 — Excepções    "Mas nem todo fenómeno é fogo, a luz também o é."
        ↓
Camada 4 — Contexto     "Num incêndio, o fogo descontrolado destrói."
```

Cada camada depende da anterior estar minimamente estabelecida. Não precisas de terminar uma camada por completo antes de avançar — mas se notares respostas confusas ou contraditórias, o primeiro diagnóstico é sempre: *em que camada estou a ensinar, e a anterior já tem base suficiente?*
