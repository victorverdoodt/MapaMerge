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
  receitaPropria: number; // Receitas tributárias próprias (ISS, IPTU, ITBI, etc.)
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
  /** Estimated savings from the merger */
  economia: number;
  /** Saldo after accounting for economies */
  saldoOtimizado: number;
}

/** Stats for a single state */
export interface StateStats {
  uf: string;
  nomeEstado: string;
  municipiosOriginal: number;
  municipiosResultante: number;
  reducaoPercent: number;
  economiaTotal: number;
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
  }[];
  byState: StateStats[];
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
