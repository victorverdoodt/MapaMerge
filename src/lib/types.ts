// ============================================================
// Types for Simulador de Fusões Municipais
// ============================================================

/** Raw fiscal data per municipality */
export interface MunicipalityData {
  codIbge: string;
  nome: string;
  uf: string;
  populacao: number;
  receita: number;        // Receita Total
  despesa: number;        // Despesa Total
  despesaPessoal: number; // Despesa com Pessoal e Encargos Sociais
  despesaAdmin?: number;  // Despesa com Administração (função 04)
  receitaPropria: number; // Receitas próprias (tributária + patrimonial + serviços)
  receitaTransferencias?: number;
  fpm?: number;           // FPM recebido
  /** Esforço Fiscal de Arrecadação = receitaPropria / receita */
  efa: number;
  /** Saldo = receita - despesa */
  saldo: number;
  /** Whether fiscal data was available */
  dadosIndisponiveis?: boolean;
}

/** A group of merged municipalities */
export interface MergeGroup {
  id: string;
  /** IBGE codes of member municipalities */
  members: string[];
  /** Display name (largest municipality or custom) */
  nome: string;
  uf: string;
  populacao: number;
  receita: number;
  despesa: number;
  despesaPessoal: number;
  receitaPropria: number;
  efa: number;
  saldo: number;
  /** Gross estimated savings from the merger */
  economia: number;
  /** Net savings (after FPM loss and transition costs) */
  economiaLiquida: number;
  /** Annual FPM loss from coefficient change (negative = loss) */
  perdaFPM: number;
  /** Annualized transition cost */
  custoTransicao: number;
  /** Saldo after accounting for net economies */
  saldoOtimizado: number;
  /** Total area in km² */
  areaKm2?: number;
}

/** Optimization parameters */
export interface OptimizationParams {
  personnelSavingsRate: number;
  adminSavingsRate: number;
  adminCostEstimate: number;
  useRealAdminCosts: boolean;
  transitionCostPerCapita: number;
  amortizationYears: number;
  modelFPM: boolean;
  maxPopulation: number;
  maxMembers: number;
  minSavingsThreshold: number;
  minPopulationTrigger: number;
  maxAreaKm2: number;
  maxCentroidDistanceKm: number;
  algorithm: 'greedy' | 'annealing';
  saIterations: number;
  saInitialTemp: number;
  saCoolingRate: number;
}

/** Stats for a single state */
export interface StateStats {
  uf: string;
  nomeEstado: string;
  municipiosOriginal: number;
  municipiosResultante: number;
  reducaoPercent: number;
  economiaTotal: number;
  economiaLiquida: number;
  perdaFPM: number;
  custoTransicao: number;
  efaAntes: number;
  efaDepois: number;
  deficitAntes: number;
  deficitDepois: number;
}

/** National aggregate statistics */
export interface GlobalStats {
  municipiosOriginal: number;
  municipiosResultante: number;
  municipiosEliminados: number;
  reducaoPercent: number;
  economiaTotal: number;
  economiaLiquida: number;
  perdaFPMTotal: number;
  custoTransicaoTotal: number;
  economiaPorHabitante: number;
  efaAntes: number;
  efaDepois: number;
  desequilibrioAntes: number; // std dev of saldo per capita
  desequilibrioDepois: number;
  reducaoDesequilibrio: number;
  reducaoDeficit: number;
  populacaoMediaPorEnte: number;
  totalGruposFusao: number;
  deficitTotalAntes: number;
  deficitTotalDepois: number;
  topEstados: {
    uf: string;
    nomeEstado: string;
    municipiosOriginal: number;
    municipiosResultante: number;
    reducaoPercent: number;
    economiaTotal: number;
    economiaLiquida: number;
  }[];
  byState: StateStats[];
  params?: Partial<OptimizationParams>;
}

/** Merge results file structure */
export interface MergeResults {
  groups: MergeGroup[];
  ungrouped: string[]; // codIbge of municipalities that were NOT merged
  stats: GlobalStats;
}

/** Map view state for synchronized maps */
export interface MapViewState {
  longitude: number;
  latitude: number;
  zoom: number;
  bearing?: number;
  pitch?: number;
}

/** Tooltip data shown on hover */
export interface TooltipInfo {
  x: number;
  y: number;
  codIbge: string;
  nome: string;
  uf: string;
  populacao: number;
  saldo: number;
  efa: number;
  receita: number;
  despesa: number;
  /** Only on the optimized map */
  isMerged?: boolean;
  membersCount?: number;
  economia?: number;
  saldoOtimizado?: number;
  memberNames?: string[];
}
