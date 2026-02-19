# 🗺️ Simulador de Fusões Municipais Otimizadas

Simulação hipotética de fusões municipais em todo o Brasil, com visualização em mapa dual (antes vs. depois) e indicadores fiscais consolidados.

> **Aviso:** Este projeto tem caráter **educacional e exploratório**. Não representa proposta oficial nem cenário juridicamente viável sem plebiscito e legislação específica (PEC 188/2019).

---

## Visão Geral

O sistema exibe dois mapas sincronizados do Brasil lado a lado:

| Mapa Esquerdo | Mapa Direito |
|---|---|
| Divisão municipal **original** (~5.570 municípios) | Divisão **otimizada** após fusões (~1.700–1.800 municípios) |

Cada polígono é colorido pelo **saldo fiscal per capita** (receita − despesa ÷ população):
- 🔴 Vermelho = déficit severo (até −R$2.000/hab)
- 🟡 Amarelo = equilíbrio (~R$0/hab)
- 🟢 Verde = superávit (até +R$2.000/hab)

---

## Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| Framework Web | Next.js 14 (App Router, SSG com `output: 'export'`) |
| Renderização de Mapa | MapLibre GL JS 5.x + react-map-gl (WebGL) |
| Estilo do Mapa Base | CARTO Dark Matter (gratuito, sem API key) |
| Processamento Geográfico | TopoJSON (server/client/simplify), Turf.js |
| Pipeline de Dados | TypeScript executado via `tsx` |
| Estilização | Tailwind CSS 3.4, tema escuro |

---

## Arquitetura do Projeto

```
MapaMerge/
├── scripts/                    # Pipeline de dados offline (7 etapas)
│   ├── 01-fetch-geojson.ts     # Baixa geometrias do IBGE
│   ├── 02-fetch-fiscal.ts      # Baixa dados fiscais do SICONFI
│   ├── 02-generate-synthetic-fiscal.ts  # (alternativa) Dados fiscais sintéticos
│   ├── 03-build-topojson.ts    # Converte GeoJSON → TopoJSON
│   ├── 04-build-adjacency.ts   # Monta grafo de adjacência
│   ├── 05-optimize-merges.ts   # Algoritmo guloso de fusão
│   ├── 06-build-merged-geo.ts  # Dissolve geometrias fundidas
│   ├── 07-compute-stats.ts     # Calcula estatísticas globais
│   └── data/                   # Cache intermediário (não versionado)
├── public/data/                # Dados pré-processados consumidos pelo frontend
│   ├── br-original.topojson    # Mapa original (~5 MB)
│   ├── br-merged.topojson      # Mapa otimizado (~1 MB)
│   ├── merge-results.json      # Grupos de fusão + dados fiscais
│   └── global-stats.json       # Estatísticas nacionais para o sidebar
├── src/
│   ├── app/                    # Páginas Next.js (layout, page, globals.css)
│   ├── components/             # Componentes React
│   │   ├── DualMapView.tsx     # Mapas sincronizados (viewState compartilhado)
│   │   ├── Sidebar.tsx         # Painel lateral com estatísticas
│   │   ├── Tooltip.tsx         # Tooltip ao passar o mouse sobre municípios
│   │   ├── Legend.tsx          # Legenda de cores
│   │   └── StateFilter.tsx    # Filtro por estado com flyTo
│   ├── hooks/
│   │   └── useFiscalData.ts   # Hook para carregamento paralelo dos dados
│   └── lib/
│       ├── types.ts           # Interfaces TypeScript
│       ├── colors.ts          # Escalas de cor choropleth (MapLibre expressions)
│       └── format.ts          # Formatação brasileira (BRL, números, %)
└── next.config.mjs            # Configuração: output estático
```

---

## Fontes de Dados

### 1. Geometrias Municipais — IBGE

- **API:** [Malhas Territoriais v3](https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR)
- **Parâmetros:** `formato=application/vnd.geo+json&qualidade=minima&intrarregiao=municipio`
- **Volume:** ~5.570 polígonos / 3.5 MB (qualidade mínima)
- **Nomes e UF:** Enriquecidos via [API Localidades](https://servicodados.ibge.gov.br/api/v1/localidades/municipios)

### 2. Dados Fiscais — Tesouro Nacional (SICONFI)

- **API:** [DCA — Declaração de Contas Anuais](https://apidatalake.tesouro.gov.br/ords/siconfi/tt/dca)
- **Variáveis extraídas por município:**

| Variável | Anexo DCA | cod_conta | coluna |
|---|---|---|---|
| **Receita Bruta** | `DCA-Anexo I-C` | `ReceitasExcetoIntraOrcamentarias` | `Receitas Brutas Realizadas` |
| **Deduções FUNDEB** | `DCA-Anexo I-C` | `ReceitasExcetoIntraOrcamentarias` | `*FUNDEB*` |
| **Outras Deduções** | `DCA-Anexo I-C` | `ReceitasExcetoIntraOrcamentarias` | `*Outras Dedu*` |
| **Despesa Total** | `DCA-Anexo I-D` | `TotalDespesas` | `Despesas Liquidadas` |
| **Despesa c/ Pessoal** | `DCA-Anexo I-D` | `DO3.1.00.00.00.00` | `Despesas Liquidadas` |
| **Receita Tributária** | `DCA-Anexo I-C` | `RO1.1.0.0.00.0.0` | `Receitas Brutas Realizadas` |

- **Receita Líquida** = Receita Bruta − |Deduções FUNDEB| − |Outras Deduções|
- **Anos tentados:** 2024 → 2023 → 2022 (o mais recente disponível)
- **Rate limit:** 1 requisição por segundo (~93 min para todos os municípios)
- **Cache incremental:** Cada município é salvo em `scripts/data/fiscal-cache/{codIbge}.json`, permitindo retomada em caso de falha

---

## Indicadores Calculados

### Por Município

| Indicador | Fórmula |
|---|---|
| **Saldo Fiscal** | `receita − despesa` |
| **Saldo per Capita** | `saldo ÷ população` |
| **EFA** (Esforço Fiscal de Arrecadação) | `receitaTributária ÷ receitaLíquida` |

### Simulação de Economia por Fusão

Quando dois municípios adjacentes A e B são fundidos (onde B é o menor):

```
economiaPessoal   = despesaPessoalB × 0.60      (60% do custo de pessoal do menor)
economiaAdmin     = despesaB × 0.15 × 0.50      (50% de 15% do custo admin estimado)
economiaTotal     = (economiaPessoal + economiaAdmin) × penalidade
```

A **penalidade por tamanho** reduz os ganhos para municípios grandes (retorno decrescente):
```
penalidade = min(1, 500.000 ÷ populaçãoCombinada)
```

### Restrições da Fusão

O algoritmo **não** realizará uma fusão se:
- População combinada > **150.000 habitantes**
- Grupo resultante > **6 municípios**
- Ambos os municípios já têm população > **50.000** (ao menos um deve ser pequeno)
- Economia estimada < **R$500.000**
- Os municípios **não são adjacentes** geograficamente
- Pertencem a **estados diferentes** (fusões são por estado)

### Estatísticas Globais (Sidebar)

O painel lateral exibe 6 cards + ranking de estados. Cada indicador é explicado abaixo:

#### 💰 Economia Total Estimada

A economia estimada é a **soma de todas as economias individuais de cada grupo de fusão**. Para cada grupo, a economia vem da eliminação parcial de custos do município menor absorvido:

```
economiaGrupo = Σ (economiaPessoal + economiaAdmin) × penalidade
              para cada fusão realizada dentro do grupo

economiaTotal = Σ economiaGrupo  (todos os grupos de todos os estados)
economiaPorHabitante = economiaTotal ÷ populaçãoTotalBrasil
```

**Interpretação:** Se todas as fusões propostas fossem realizadas, o país economizaria esse valor anualmente em custos de pessoal e administrativos redundantes. O value por habitante mostra quanto essa economia representa dividida por toda a população.

---

#### 🏛️ Redução de Municípios

```
municipiosEliminados = municipiosOriginal − municipiosResultante
reducaoPercent       = municipiosEliminados ÷ municipiosOriginal × 100
```

- **municipiosOriginal:** total de municípios com dados fiscais disponíveis
- **municipiosResultante:** nº de grupos de fusão + nº de municípios que ficaram sem fusão (isolados ou que já são grandes)

**Interpretação:** Quantos entes municipais deixariam de existir como unidades administrativas independentes.

---

#### 📉 Déficit Fiscal

O déficit fiscal mede o volume total de **saldos negativos** (municípios que gastam mais do que arrecadam):

```
déficitAntes  = Σ saldo   (para todo município onde saldo < 0)
              onde saldo = receita − despesa

déficitDepois = Σ saldoOtimizado   (para toda entidade pós-fusão onde saldoOtimizado < 0)
              onde saldoOtimizado = receita − (despesa − economia)

reducaoDeficit = (déficitAntes − déficitDepois) ÷ |déficitAntes| × 100
```

Para as **entidades resultantes de fusão**, o saldo otimizado desconta a economia estimada da despesa — simulando que a fusão reduz gastos. Para **municípios sem fusão**, o saldo permanece inalterado.

**Interpretação:** Se o déficit era −R$50 bi e caiu para −R$35 bi, a simulação sugere que 30% do déficit agregado seria eliminado pelas economias de escala. Isto não significa que as entidades deficitárias se tornam superavitárias necessariamente — apenas que o saldo negativo total é menor.

---

#### ⚖️ Desequilíbrio Fiscal

Mede a **dispersão** entre os saldos fiscais per capita dos entes, usando o desvio padrão populacional (σ):

```
Antes:
  saldoPerCapitaᵢ = saldoᵢ ÷ populaçãoᵢ          (para cada município i)
  μ = média(saldoPerCapita)
  σ_antes = √[ Σ(saldoPerCapitaᵢ − μ)² ÷ N ]

Depois:
  Para grupos de fusão:   saldoPerCapitaⱼ = (receitaⱼ − (despesaⱼ − economiaⱼ)) ÷ populaçãoⱼ
  Para municípios soltos:  saldoPerCapitaⱼ = saldoⱼ ÷ populaçãoⱼ
  μ' = média(saldoPerCapita')
  σ_depois = √[ Σ(saldoPerCapitaⱼ − μ')² ÷ N' ]

reducaoDesequilibrio = (σ_antes − σ_depois) ÷ σ_antes × 100
```

**Interpretação:** Um σ alto significa que há muita desigualdade — alguns municípios estão com superávit muito maior que outros enquanto muitos estão em déficit profundo. Se σ diminui após as fusões, os entes resultantes ficam mais "parecidos" fiscalmente entre si. Se σ aumenta, as fusões concentraram riqueza em alguns entes enquanto outros continuaram deficitários.

> O desequilíbrio pode **aumentar** após fusões porque municípios superavitários às vezes absorvem vizinhos deficitários, criando entidades com saldo per capita mais extremo (muito positivo ou muito negativo).

---

#### 👥 Pop. Média por Ente

```
popMediaPorEnte = populaçãoTotal ÷ municípiosResultantes
```

**Sublabel:** Mostra quantos **grupos de fusão** foram criados (entidades com 2+ municípios fundidos).

**Interpretação:** Antes das fusões o Brasil tem ~5.570 municípios com média de ~38 mil habitantes. Após a simulação, a média sobe para ~120 mil/ente, refletindo entidades maiores e potencialmente com mais escala administrativa.

---

#### 🎯 Autossuficiência Fiscal (EFA)

O **Esforço Fiscal de Arrecadação** mede quanto da receita total de um ente vem de receitas tributárias próprias (ISS, IPTU, ITBI, etc.), não de transferências:

```
EFA_antes  = Σ receitaTributária (todos os municípios) ÷ Σ receitaTotal (todos)
EFA_depois = Σ receitaTributária (todos os entes pós-fusão) ÷ Σ receitaTotal (todos)
```

**Interpretação:** Um EFA de 24% significa que apenas 24% da receita municipal brasileira vem de fontes próprias — o restante são transferências (FPM, ICMS, etc.). A fusão por si só não altera o EFA agregado (as receitas tributárias totais não mudam), mas a expectativa teórica é que entes maiores consigam aumentar sua base tributária ao longo do tempo.

> O EFA "antes" e "depois" aparece igual no agregado nacional porque a fusão redistribui mas não cria novas receitas tributárias. A diferença apareceria ao nível de cada ente se compararmos EFA individual.

---

#### 🏆 Top Estados por Economia

Ranking dos 5 estados com maior economia total estimada, mostrando:
- **UF** e nome do estado
- Transição de municípios (ex: `853→268`)
- Economia estimada em R$ (ex: `R$ 15,0 B`)

---

## Algoritmo de Otimização

O script `05-optimize-merges.ts` usa um **algoritmo guloso (greedy)** executado **por estado**:

### Etapas

1. **Inicialização:** Cada município com dados fiscais disponíveis vira um "nó" no grafo
2. **Grafo de adjacência:** Construído via `topojson.neighbors()` no passo 04 — dois municípios são vizinhos se compartilham uma fronteira
3. **Fila de prioridade:** Para cada par de vizinhos, calcula-se a economia potencial. Os pares são ordenados por economia decrescente
4. **Loop guloso:**
   - Retira o par de maior economia da fila
   - Se ambos os nós ainda estão ativos e respeitam as restrições → efetua a fusão
   - O nó maior absorve o menor (soma fiscal, transfere adjacências)
   - Recalcula a economia para as novas adjacências do nó expandido
   - Repete até não haver mais pares viáveis
5. **Resultado:** Lista de grupos de fusão + municípios sem alteração

### Complexidade

- Para cada estado: O(E log E) onde E = número de arestas de adjacência
- Média de 5.7 vizinhos por município → ~16.000 arestas no total
- Execução total: < 1 segundo para os 27 estados

---

## Como Rodar

### Pré-requisitos

- **Node.js** ≥ 18
- **npm** (incluído com Node.js)

### 1. Instalação

```bash
git clone <repo-url>
cd MapaMerge
npm install
```

### 2. Pipeline de Dados (primeira vez)

O pipeline precisa ser executado uma vez para gerar os dados pré-processados em `public/data/`:

#### Opção A — Pipeline completo com dados reais (~4 horas)

```bash
# Executa todos os 7 scripts em sequência
npm run pipeline
```

⚠️ O passo 02 (SICONFI) leva aproximadamente **3-4 horas** por conta do rate limit da API (1 req/s × 5.570 municípios × até 3 tentativas de anos).

O download é **incremental** — se interromper, ao rodar novamente ele retoma de onde parou (cache em `scripts/data/fiscal-cache/`).

#### Opção B — Pipeline rápido com dados sintéticos (~2 min)

```bash
# 1. Baixar geometrias do IBGE (~30s)
npm run pipeline:geo

# 2. Gerar dados ficais sintéticos (instantâneo)
npx tsx scripts/02-generate-synthetic-fiscal.ts

# 3. Processar tudo (topojson + adjacência + fusões + mapas + stats)
npm run pipeline:process
```

Os dados sintéticos usam distribuições realistas (lognormal para população, razões reais para receita/despesa) mas **não representam valores reais** dos municípios.

#### Opção C — Executar scripts individuais

```bash
npx tsx scripts/01-fetch-geojson.ts       # Geometrias IBGE
npx tsx scripts/02-fetch-fiscal.ts        # Dados SICONFI (lento)
npx tsx scripts/03-build-topojson.ts      # GeoJSON → TopoJSON
npx tsx scripts/04-build-adjacency.ts     # Grafo de adjacência
npx tsx scripts/05-optimize-merges.ts     # Algoritmo de fusão
npx tsx scripts/06-build-merged-geo.ts    # Geometrias dissolvidas
npx tsx scripts/07-compute-stats.ts       # Estatísticas globais
```

#### Atalhos de re-execução

```bash
# Reprocessar apenas fusões + mapas + stats (após ajustar parâmetros do algoritmo)
npm run pipeline:merge

# Reprocessar tudo exceto downloads (topojson → adjacência → fusão → mapas → stats)
npm run pipeline:process
```

### 3. Rodar o Projeto

```bash
# Modo desenvolvimento (hot-reload)
npm run dev
# Acesse http://localhost:3000

# Build estático para produção
npm run build
# Os arquivos ficam em /out — servir com qualquer servidor HTTP estático
```

---

## Dados Gerados

Após o pipeline, os seguintes arquivos estarão em `public/data/`:

| Arquivo | Tamanho | Conteúdo |
|---|---|---|
| `br-original.topojson` | ~5 MB | TopoJSON dos ~5.570 municípios originais com propriedades fiscais |
| `br-merged.topojson` | ~1 MB | TopoJSON dos municípios pós-fusão (~1.700–1.800 polígonos) |
| `merge-results.json` | ~500 KB | Lista de todos os grupos de fusão, membros, dados fiscais e economias |
| `global-stats.json` | ~15 KB | Estatísticas nacionais e ranking de estados para o sidebar |

Dados intermediários (não versionados) ficam em `scripts/data/`:

| Arquivo/Pasta | Conteúdo |
|---|---|
| `br-raw.geojson` | GeoJSON cru do IBGE |
| `municipios-nomes.json` | Nomes + UF de todos os municípios |
| `fiscal-raw.json` | Dados fiscais consolidados de todos os municípios |
| `fiscal-cache/` | Cache individual por município (para retomada incremental) |
| `br-municipalities.topojson` | TopoJSON intermediário |
| `adjacency.json` | Grafo de adjacência (codIbge → [vizinhos]) |

---

## Ajustando Parâmetros da Simulação

Os parâmetros do algoritmo de fusão estão no início de `scripts/05-optimize-merges.ts`:

```typescript
const PERSONNEL_SAVINGS_RATE = 0.60;  // % de economia no pessoal do menor município
const ADMIN_SAVINGS_RATE = 0.50;      // % de economia administrativa
const ADMIN_COST_ESTIMATE = 0.15;     // Custo admin estimado como % da despesa total
const MAX_POPULATION = 150_000;       // Pop. máxima do grupo fundido
const MAX_MEMBERS = 6;                // Máximo de membros por grupo
const MIN_SAVINGS_THRESHOLD = 500_000; // Economia mínima (R$) para justificar fusão
const MIN_POPULATION_TRIGGER = 50_000; // Ao menos um município deve ter pop < este valor
```

Após alterar, recalcule:

```bash
npm run pipeline:merge
```

---

## Limitações

- As estimativas de economia são **simplificações** — na prática, economias de escala e custos de transição variam por contexto
- Dados de 2023/2024 podem estar indisponíveis para alguns municípios (marcados como "dados indisponíveis")
- A adjacência é puramente geográfica (baseada em fronteiras do IBGE) — não considera rodovias, distância ou vínculos econômicos
- Fusões são restritas a **dentro do mesmo estado** (sem fusões interestaduais)
- A visualização usa qualidade "mínima" do IBGE para performance; polígonos podem parecer simplificados

---

## Licença

Projeto educacional. Dados do IBGE e Tesouro Nacional são de domínio público.
