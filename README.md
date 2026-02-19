# 🗺️ Simulador de Fusões Municipais Otimizadas

Simulação hipotética de fusões municipais em todo o Brasil, com visualização em mapa dual (antes vs. depois), indicadores fiscais consolidados e **otimizador interativo no navegador** com sliders de parâmetros.

> **Aviso:** Este projeto tem caráter **educacional e exploratório**. Não representa proposta oficial nem cenário juridicamente viável sem plebiscito e legislação específica (PEC 188/2019).

---

## Visão Geral

O sistema exibe dois mapas sincronizados do Brasil lado a lado:

| Mapa Esquerdo | Mapa Direito |
|---|---|
| Divisão municipal **original** (~5.570 municípios) | Divisão **otimizada** após fusões (~4.300 municípios, cenário moderado) |

Cada polígono é colorido pelo **saldo fiscal per capita** (receita − despesa ÷ população):
- 🔴 Vermelho = déficit severo (até −R$2.000/hab)
- 🟡 Amarelo = equilíbrio (~R$0/hab)
- 🟢 Verde = superávit (até +R$2.000/hab)

### Otimizador Interativo

O painel lateral "⚙️ Parâmetros da Simulação" permite recalcular fusões **em tempo real** direto no navegador (sem servidor). Inclui:

- **3 cenários pré-configurados:** Conservador / Moderado / Agressivo
- **Sliders** para todas as taxas (pessoal, admin, custo de transição, amortização, limites geográficos)
- **Modelagem de FPM:** Checkbox para ligar/desligar o impacto no Fundo de Participação dos Municípios
- **Botão "Recalcular":** Roda o algoritmo greedy (~300ms) e atualiza mapas + estatísticas instantaneamente

---

## Resultados da Simulação (cenário moderado)

| Métrica | Antes | Depois |
|---|---|---|
| Municípios | 5.566 | 4.327 (−22,3%) |
| Economia bruta (pessoal + admin) | — | R$ 20,1 B/ano |
| Perda de FPM | — | −R$ 13,8 B/ano |
| Custo de transição | — | −R$ 0,6 B/ano |
| **Economia líquida** | — | **R$ 5,7 B/ano** |
| Economia por habitante | — | R$ 26,64 |
| EFA (Autossuficiência Fiscal) | 23,9% | 24,2% |
| Déficit fiscal total | −R$ 50,7 B | −R$ 46,3 B (−8,7%) |
| Desequilíbrio (σ saldo/capita) | 1.207 | 1.002 (−17,0%) |
| Pop. média por ente | ~38 mil | ~49 mil |
| Grupos de fusão | — | 995 |

---

## Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| Framework Web | Next.js 14 (App Router, SSG com `output: 'export'`) |
| Renderização de Mapa | MapLibre GL JS 5.x + react-map-gl (WebGL) |
| Estilo do Mapa Base | CARTO Dark Matter (gratuito, sem API key) |
| Processamento Geográfico | TopoJSON (server/client/simplify), Turf.js |
| Pipeline de Dados | TypeScript executado via `tsx` |
| Otimização Client-side | Engine própria em TypeScript puro (sem dependência de Node.js) |
| Estilização | Tailwind CSS 3.4, tema escuro |

---

## Arquitetura do Projeto

```
MapaMerge/
├── scripts/                        # Pipeline de dados offline (8 etapas)
│   ├── 01-fetch-geojson.ts         # Baixa geometrias do IBGE
│   ├── 02-fetch-fiscal.ts          # Baixa dados fiscais do SICONFI
│   ├── 02-generate-synthetic-fiscal.ts  # (alternativa) Dados fiscais sintéticos
│   ├── 02b-augment-fiscal.ts       # Estima FPM, despesaAdmin, transferências
│   ├── 03-build-topojson.ts        # Converte GeoJSON → TopoJSON
│   ├── 04-build-adjacency.ts       # Grafo de adjacência + dados geográficos
│   ├── 05-optimize-merges.ts       # Greedy + Simulated Annealing
│   ├── 06-build-merged-geo.ts      # Dissolve geometrias fundidas
│   ├── 07-compute-stats.ts         # Stats globais + optimizer bundle
│   └── data/                       # Cache intermediário (não versionado)
├── public/data/                    # Dados consumidos pelo frontend
│   ├── br-original.topojson        # Mapa original (~5 MB)
│   ├── br-merged.topojson          # Mapa otimizado (~2 MB)
│   ├── merge-results.json          # Grupos de fusão + dados fiscais
│   ├── global-stats.json           # Estatísticas nacionais para o sidebar
│   └── optimizer-bundle.json       # Bundle p/ otimização client-side (~3 MB)
├── src/
│   ├── app/                        # Páginas Next.js (layout, page, globals.css)
│   ├── components/
│   │   ├── DualMapView.tsx         # Mapas sincronizados (viewState compartilhado)
│   │   ├── ParameterPanel.tsx      # Painel de sliders para otimização interativa
│   │   ├── Sidebar.tsx             # Painel lateral com estatísticas
│   │   ├── Tooltip.tsx             # Tooltip ao passar o mouse sobre municípios
│   │   ├── Legend.tsx              # Legenda de cores
│   │   └── StateFilter.tsx         # Filtro por estado com flyTo
│   ├── hooks/
│   │   ├── useFiscalData.ts        # Carregamento paralelo dos dados estáticos
│   │   └── useOptimizer.ts         # Hook de otimização client-side
│   └── lib/
│       ├── types.ts                # Interfaces TypeScript
│       ├── optimizer-core.ts       # Engine de otimização (greedy, FPM, haversine)
│       ├── buildMergedGeo.ts       # Dissolução de geometrias client-side
│       ├── colors.ts               # Escalas de cor choropleth
│       └── format.ts               # Formatação brasileira (BRL, números, %)
└── next.config.mjs                 # Configuração: output estático
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
| **Despesa Administrativa** | `DCA-Anexo I-D` | `FO04` (função 04) | `Despesas Liquidadas` |
| **Receita Tributária** | `DCA-Anexo I-C` | `RO1.1.0.0.00.0.0` | `Receitas Brutas Realizadas` |
| **Receita Patrimonial** | `DCA-Anexo I-C` | `RO1.2.0.0.00.0.0` | `Receitas Brutas Realizadas` |
| **Receita de Serviços** | `DCA-Anexo I-C` | `RO1.3.0.0.00.0.0` | `Receitas Brutas Realizadas` |
| **Transferências** | `DCA-Anexo I-C` | `RO1.7.0.0.00.0.0` | `Receitas Brutas Realizadas` |
| **FPM** | `DCA-Anexo I-C` | `RO1.7.1.1.51.0.0` | `Receitas Brutas Realizadas` |

- **Receita Líquida** = Receita Bruta − |Deduções FUNDEB| − |Outras Deduções|
- **Receita Própria** = Tributária + Patrimonial + Serviços
- **Anos tentados:** 2024 → 2023 → 2022 (o mais recente disponível)
- **Rate limit:** 1 requisição por segundo (~93 min para todos os municípios)
- **Cache incremental:** Cada município é salvo em `scripts/data/fiscal-cache/{codIbge}.json`, permitindo retomada em caso de falha
- **Invalidação automática:** Cache que não contém os campos `fpm`, `despesaAdmin` e `receitaTransferencias` é re-baixado automaticamente

### 3. Estimativa de FPM (script 02b)

Quando dados reais de FPM não estão disponíveis no cache, o script `02b-augment-fiscal.ts` estima os valores usando o modelo oficial de distribuição:

- **Pool nacional FPM Interior:** ~R$155 bilhões (2024)
- **Pool nacional FPM Capitais:** ~R$19 bilhões (2024)
- **Participação estadual:** Percentuais definidos no Anexo do DL 1.881/1981
- **Distribuição per capita:** Dentro de cada estado, proporcional ao coeficiente FPM de cada município (ver tabela abaixo)

---

## Modelo Econômico da Fusão

O modelo calcula a **economia líquida anual** de cada fusão, considerando três componentes:

```
economiaLíquida = economiaBruta + perdaFPM − custoTransição
```

### 1. Economia Bruta (Pessoal + Administrativa)

Quando dois municípios adjacentes A e B são fundidos (onde B é o menor):

```
economiaPessoal = despesaPessoalB × taxaPessoal      (default: 20%)
economiaAdmin   = despesaAdminB  × taxaAdmin         (default: 30%, usa dados reais de despesaAdmin quando disponível)
economiaBruta   = economiaPessoal + economiaAdmin
```

Se `despesaAdmin` real não estiver disponível, é estimada como 15% da despesa total.

A **penalidade por tamanho** aplica retornos decrescentes para entidades grandes:
```
penalidade = min(1, 500.000 ÷ populaçãoCombinada)
```

### 2. Modelagem do FPM (Fundo de Participação dos Municípios)

O FPM é a principal transferência federal para municípios. Seu valor depende de um **coeficiente** baseado na faixa populacional (DL 1.881/1981, LC 91/1997):

| Faixa Populacional | Coeficiente |
|---|---|
| Até 10.188 hab | 0,6 |
| 10.189 – 13.584 | 0,8 |
| 13.585 – 16.980 | 1,0 |
| 16.981 – 23.772 | 1,2 |
| 23.773 – 30.564 | 1,4 |
| 30.565 – 37.356 | 1,6 |
| 37.357 – 44.148 | 1,8 |
| 44.149 – 50.940 | 2,0 |
| 50.941 – 61.128 | 2,2 |
| 61.129 – 71.316 | 2,4 |
| 71.317 – 81.504 | 2,6 |
| 81.505 – 91.692 | 2,8 |
| 91.693 – 101.880 | 3,0 |
| 101.881 – 115.464 | 3,2 |
| 115.465 – 129.048 | 3,4 |
| 129.049 – 142.632 | 3,6 |
| 142.633 – 156.216 | 3,8 |
| Acima de 156.216 | 4,0 |

Quando dois municípios se fundem, a entidade resultante pode **cair de faixa FPM**, pois a soma dos coeficientes individuais é geralmente maior que o coeficiente da população combinada:

```
coefAntes  = coef(popA) + coef(popB)            # ex: 0,6 + 0,6 = 1,2
coefDepois = coef(popA + popB)                   # ex: coef(18.000) = 1,0

FPM_depois = FPM_antes × (coefDepois / coefAntes)
perdaFPM   = FPM_depois − FPM_antes              # negativo = perda
```

**Exemplo prático:** Dois municípios de ~8.000 habitantes cada, recebendo R$10M de FPM cada (coef 0,6 cada). Após fusão: cidade de ~16.000 hab com coef 1,0. FPM total cai de R$20M para R$16,7M — perda de R$3,3M/ano.

> A modelagem FPM é o principal fator que torna a simulação realista. Sem ela, fusões pareceriam irrealisticamente vantajosas. Com ela, municípios pequenos perdem muita receita FPM ao se fundirem, reduzindo drasticamente a atratividade da fusão.

### 3. Custo de Transição

Estima custos de integração de sistemas, realocação, harmonização administrativa:

```
custoTotal     = populaçãoMenorMunicípio × custoPerCapita    (default: R$200/hab)
custoAnual     = custoTotal ÷ anosAmortização                (default: 7 anos)
```

### Restrições da Fusão

O algoritmo **não** realizará uma fusão se qualquer restrição for violada:

| Restrição | Valor Default | Justificativa |
|---|---|---|
| **População combinada** | ≤ 150.000 hab | Evita entes demasiado grandes |
| **Membros por grupo** | ≤ 6 municípios | Limita complexidade de integração |
| **Pop. mínima de gatilho** | Ao menos um < 50.000 | Não funde dois municípios médios/grandes |
| **Economia mínima** | ≥ R$200.000/ano | Fusões triviais não compensam |
| **Área combinada** | ≤ 15.000 km² | Evita entes com extensão territorial excessiva |
| **Distância entre centroides** | ≤ 80 km | Garante proximidade geográfica |
| **Adjacência geográfica** | Obrigatória | Municípios devem compartilhar fronteira |
| **Mesmo estado** | Obrigatória | Fusões interestaduais não são modeladas |

---

## Indicadores Calculados

### Por Município

| Indicador | Fórmula |
|---|---|
| **Saldo Fiscal** | `receita − despesa` |
| **Saldo per Capita** | `saldo ÷ população` |
| **EFA** (Esforço Fiscal de Arrecadação) | `receitaPrópria ÷ receitaTotal` |

> **EFA** agora usa `receitaPrópria` (tributária + patrimonial + serviços) em vez de apenas receita tributária, oferecendo uma medida mais ampla de autossuficiência.

### Estatísticas Globais (Sidebar)

O painel lateral exibe 6 cards + ranking de estados:

#### 💰 Economia Líquida Anual

```
economiaLíquida = economiaBruta + perdaFPM − custoTransição
economiaPorHabitante = economiaLíquida ÷ populaçãoTotalBrasil
```

Com breakdown detalhado:
- **Economia bruta:** Soma das economias de pessoal e administrativas
- **Perda FPM:** Soma das perdas de FPM por mudança de coeficiente
- **Custo transição/ano:** Custo de integração anualizado

---

#### 🏛️ Redução de Municípios

```
municipiosEliminados = municipiosOriginal − municipiosResultante
reducaoPercent       = municipiosEliminados ÷ municipiosOriginal × 100
```

- **municipiosOriginal:** total de municípios com dados fiscais disponíveis
- **municipiosResultante:** nº de grupos de fusão + nº de municípios que ficaram sem fusão

---

#### 📉 Déficit Fiscal

```
déficitAntes  = Σ saldo   (para todo município onde saldo < 0)

déficitDepois = Σ saldoOtimizado   (para toda entidade pós-fusão onde saldoOtimizado < 0)
              onde saldoOtimizado = saldo + economiaLíquida

reducaoDeficit = (|déficitAntes| − |déficitDepois|) ÷ |déficitAntes| × 100
```

O saldo otimizado usa a fórmula `saldo + economiaLíquida` (que já inclui economia bruta, perda FPM e custo de transição), evitando dupla contagem.

---

#### ⚖️ Desequilíbrio Fiscal

Desvio padrão populacional (σ) dos saldos fiscais per capita:

```
Antes:
  saldoPerCapitaᵢ = saldoᵢ ÷ populaçãoᵢ
  σ_antes = √[ Σ(saldoPerCapitaᵢ − μ)² ÷ N ]

Depois:
  Para fusões:          saldoPerCapitaⱼ = (saldoⱼ + economiaLíquidaⱼ) ÷ populaçãoⱼ
  Para municípios soltos: saldoPerCapitaⱼ = saldoⱼ ÷ populaçãoⱼ
  σ_depois = √[ Σ(saldoPerCapitaⱼ − μ')² ÷ N' ]

reducaoDesequilibrio = (σ_antes − σ_depois) ÷ σ_antes × 100
```

---

#### 👥 Pop. Média por Ente

```
popMediaPorEnte = populaçãoTotal ÷ municípiosResultantes
```

---

#### 🎯 Autossuficiência Fiscal (EFA)

```
EFA_antes  = Σ receitaPrópria ÷ Σ receitaTotal     (todos os municípios)
EFA_depois = Σ receitaPrópria ÷ Σ receitaTotal'    (receita ajustada por perda FPM)
```

A EFA pós-fusão **melhora ligeiramente** porque a perda de FPM reduz o denominador (receita total diminui com menos transferências), enquanto receitas próprias permanecem iguais.

---

#### 🏆 Top Estados por Economia

Ranking dos 5 estados com maior **economia líquida** estimada (já descontando FPM e transição).

---

## Algoritmo de Otimização

O script `05-optimize-merges.ts` usa um **algoritmo Greedy + Simulated Annealing** executado **por estado**:

### Fase 1 — Greedy (solução inicial)

1. **Inicialização:** Cada município com dados fiscais disponíveis vira um "nó" no grafo
2. **Grafo de adjacência:** Construído via `topojson.neighbors()` no passo 04. Complementado com **dados geográficos** (área em km² e centroide via Turf.js)
3. **Fila de prioridade:** Para cada par de vizinhos, calcula economia líquida (bruta + FPM + transição). Ordenados por economia decrescente
4. **Loop guloso:**
   - Retira o par de maior economia líquida
   - Valida restrições (pop, área, distância, membros)
   - Efetua fusão: nó maior absorve menor; centroide recalculado (ponderado por área)
   - Recalcula economia para novas adjacências
   - Repete até não haver pares viáveis

### Fase 2 — Simulated Annealing (refinamento)

Após o greedy, aplica perturbações estocásticas para escapar de ótimos locais:

| Parâmetro | Valor |
|---|---|
| Iterações | 10.000 × min(N/50, 1) |
| Temperatura inicial | 500.000 × (N/500) |
| Cooling rate | 0,9995 |

**Movimentos:**
- Desfazer uma fusão (split)
- Mover município de um grupo para vizinho

Aceita movimentos ruins com probabilidade `e^(−Δ/T)`, onde Δ é a perda de economia e T é a temperatura decrescente.

### Otimização Client-side

O mesmo algoritmo greedy roda no **navegador** via `src/lib/optimizer-core.ts`:

- **Sem dependências de Node.js:** Haversine puro substitui Turf.js; dados pré-computados substituem leitura de arquivos
- **Double-rAF pattern:** Garante que o indicador "Recalculando..." renderiza antes do cálculo bloquear a thread
- **~300ms** para processar todos os 27 estados do Brasil
- **Geometrias recalculadas:** `topojson.merge()` dissolve polígonos dos grupos no client

### Complexidade

- Greedy: O(E log E) por estado, onde E = arestas de adjacência (~16.000 total)
- SA: O(iterações × validações) — ~5.000–10.000 iterações por estado grande
- Total pipeline: ~30 segundos para os 27 estados (greedy + SA)
- Total client-side: ~300ms (apenas greedy, sem SA)

---

## Cenários Pré-configurados

O otimizador interativo oferece 3 presets:

| Parâmetro | Conservador | Moderado | Agressivo |
|---|---|---|---|
| Economia pessoal | 10% | 20% | 35% |
| Economia admin | 20% | 30% | 45% |
| Custo transição/hab | R$300 | R$200 | R$100 |
| Amortização | 10 anos | 7 anos | 5 anos |
| Modelar FPM | ✅ Sim | ✅ Sim | ❌ Não |
| Pop. máxima | 100k | 150k | 250k |
| Membros máx | 4 | 6 | 8 |
| Área máxima | 10.000 km² | 15.000 km² | 25.000 km² |
| Distância máx | 60 km | 80 km | 120 km |

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
# Executa todos os scripts em sequência
npm run pipeline
```

⚠️ O passo 02 (SICONFI) leva aproximadamente **93 minutos** por conta do rate limit da API (1 req/s × 5.570 municípios).

O download é **incremental** — se interromper, ao rodar novamente ele retoma de onde parou (cache em `scripts/data/fiscal-cache/`). Cache que não possui campos novos (`fpm`, `despesaAdmin`, `receitaTransferencias`) é invalidado e re-baixado automaticamente.

#### Opção B — Pipeline rápido com dados estimados (~5 min)

```bash
# 1. Baixar geometrias do IBGE (~30s)
npm run pipeline:geo

# 2. Gerar dados fiscais sintéticos (instantâneo)
npx tsx scripts/02-generate-synthetic-fiscal.ts

# 3. Estimar FPM, despesaAdmin, transferências (instantâneo)
npx tsx scripts/02b-augment-fiscal.ts

# 4. Processar tudo (topojson + adjacência + fusões + mapas + stats)
npm run pipeline:process
```

Os dados sintéticos usam distribuições realistas, e o script 02b estima FPM via modelo de coeficientes e participação estadual. Para dados reais, rode `02-fetch-fiscal.ts` no lugar dos passos 2 e 3.

#### Opção C — Executar scripts individuais

```bash
npx tsx scripts/01-fetch-geojson.ts       # Geometrias IBGE
npx tsx scripts/02-fetch-fiscal.ts        # Dados SICONFI (lento, ~93 min)
npx tsx scripts/02b-augment-fiscal.ts     # Estimar campos ausentes (FPM etc.)
npx tsx scripts/03-build-topojson.ts      # GeoJSON → TopoJSON
npx tsx scripts/04-build-adjacency.ts     # Grafo de adjacência + geodados
npx tsx scripts/05-optimize-merges.ts     # Greedy + Simulated Annealing
npx tsx scripts/06-build-merged-geo.ts    # Geometrias dissolvidas
npx tsx scripts/07-compute-stats.ts       # Stats + optimizer bundle
```

#### Atalhos de re-execução

```bash
# Reprocessar apenas fusões + mapas + stats (após ajustar parâmetros)
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
| `br-merged.topojson` | ~2 MB | TopoJSON dos municípios pós-fusão (~4.300 polígonos) |
| `merge-results.json` | ~500 KB | Grupos de fusão, membros, dados fiscais, economias e perdas FPM |
| `global-stats.json` | ~15 KB | Estatísticas nacionais, ranking de estados, parâmetros usados |
| `optimizer-bundle.json` | ~3 MB | Dados fiscais + adjacência + geodados para otimização client-side |

Dados intermediários (não versionados) ficam em `scripts/data/`:

| Arquivo/Pasta | Conteúdo |
|---|---|
| `br-raw.geojson` | GeoJSON cru do IBGE |
| `municipios-nomes.json` | Nomes + UF de todos os municípios |
| `fiscal-raw.json` | Dados fiscais consolidados (todos os campos: fpm, despesaAdmin, etc.) |
| `fiscal-cache/` | Cache individual por município (para retomada incremental) |
| `br-municipalities.topojson` | TopoJSON intermediário |
| `adjacency.json` | Grafo de adjacência (codIbge → [vizinhos]) |
| `municipality-geo.json` | Área (km²) e centroide por município (via Turf.js) |

---

## Ajustando Parâmetros da Simulação

### Via Interface Web (interativo)

Abra o painel "⚙️ Parâmetros da Simulação" no sidebar e ajuste os sliders. Clique em "🔄 Recalcular" para ver os resultados instantaneamente. Os parâmetros disponíveis:

| Parâmetro | Range | Default |
|---|---|---|
| Economia de pessoal | 5%–60% | 20% |
| Economia administrativa | 5%–50% | 30% |
| Custo de transição/hab | R$0–R$500 | R$200 |
| Amortização | 3–15 anos | 7 anos |
| Modelar FPM | Liga/Desliga | Liga |
| População máxima | 50k–500k | 150k |
| Membros máx | 2–10 | 6 |
| Área máxima | 5k–50k km² | 15k km² |
| Distância máx centroides | 20–200 km | 80 km |

### Via Pipeline (offline)

Os parâmetros do pipeline estão no início de `scripts/05-optimize-merges.ts`. Após alterar, recalcule:

```bash
npx tsx scripts/05-optimize-merges.ts
npx tsx scripts/06-build-merged-geo.ts
npx tsx scripts/07-compute-stats.ts
```

Ou use o atalho:

```bash
npm run pipeline:merge
```

---

## Limitações

### Do Modelo Econômico
- As taxas de economia (20% pessoal, 30% admin) são **estimativas médias** — na prática variam por município, tipo de serviço e capacidade de integração
- Custos de transição reais podem ser significativamente maiores (integração de sistemas, TI, renegociação de contratos, eleições)
- Não modela ganhos de longo prazo (melhoria de base tributária, economia de escala em compras)
- Não modela perdas políticas e sociais (distância da sede, perda de identidade local)

### Do Modelo FPM
- A estimativa de FPM usa o modelo de coeficientes do DL 1.881/1981 com distribuição proporcional dentro de cada estado — os valores exatos dependem de atualizações anuais do TCU
- Capitais estaduais usam pool separado de FPM (distribuído por população), mas o modelo simplifica a fórmula
- Não modela efeitos de segunda ordem: quando um município perde FPM, outros do mesmo estado poderiam ganhar (soma zero estadual)

### Dos Dados
- Dados de 2023/2024 podem estar indisponíveis para alguns municípios (marcados como "dados indisponíveis")
- Quando dados reais de FPM não estão no cache, são estimados pelo modelo de coeficientes (script 02b)
- `despesaAdmin` e `receitaTransferencias` são estimadas quando ausentes no cache

### Da Modelagem Geográfica
- A adjacência é baseada em fronteiras do IBGE — não considera rodovias, rios ou barreiras naturais
- Distância de centroides é uma aproximação (Haversine) — não mede acessibilidade real
- Áreas são calculadas via projeção plana (Turf.js `area()`) — leve imprecisão para polígonos próximos ao equador
- Fusões são restritas a **dentro do mesmo estado** (sem fusões interestaduais)

### Da Visualização
- Qualidade "mínima" do IBGE para performance — polígonos podem parecer simplificados
- O site é **totalmente estático** (`output: 'export'`) — toda otimização roda no navegador do usuário

---

## Licença

Projeto educacional. Dados do IBGE e Tesouro Nacional são de domínio público.
