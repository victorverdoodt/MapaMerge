// Quick test: fetch DCA for 2 municipalities and verify parsing
import * as path from 'path';

const DCA_URL = 'https://apidatalake.tesouro.gov.br/ords/siconfi/tt/dca';

interface DCAItem {
  exercicio: number;
  cod_ibge: number;
  instituicao: string;
  anexo: string;
  cod_conta: string;
  conta: string;
  coluna: string;
  rotulo: string;
  populacao: number;
  valor: number;
}

function extractFiscalFromDCA(items: DCAItem[], codIbge: string, nome: string, uf: string, populacao: number, ano: number) {
  function findValue(codConta: string, anexoSubstr: string, colunaSubstr: string): number {
    for (const item of items) {
      if (item.cod_conta !== codConta) continue;
      if (!item.anexo.includes(anexoSubstr)) continue;
      if (!item.coluna.includes(colunaSubstr)) continue;
      return item.valor || 0;
    }
    return 0;
  }

  const receitaBruta = findValue('ReceitasExcetoIntraOrcamentarias', 'I-C', 'Receitas Brutas Realizadas');
  const deducoesFundeb = findValue('ReceitasExcetoIntraOrcamentarias', 'I-C', 'FUNDEB');
  const deducoesOutras = findValue('ReceitasExcetoIntraOrcamentarias', 'I-C', 'Outras Dedu');
  const receita = receitaBruta - Math.abs(deducoesFundeb) - Math.abs(deducoesOutras);

  const despesa = findValue('TotalDespesas', 'I-D', 'Despesas Liquidadas');
  const despesaPessoal = findValue('DO3.1.00.00.00.00', 'I-D', 'Despesas Liquidadas');
  const receitaPropria = findValue('RO1.1.0.0.00.0.0', 'I-C', 'Receitas Brutas Realizadas');

  const receitaFinal = receita > 0 ? receita : receitaBruta;
  const efa = receitaFinal > 0 ? receitaPropria / receitaFinal : 0;
  const saldo = receitaFinal - despesa;

  return {
    codIbge, nome, uf, populacao,
    receita: receitaFinal, despesa, despesaPessoal, receitaPropria,
    efa, saldo, ano,
    dadosIndisponiveis: receitaFinal === 0 && despesa === 0,
  };
}

async function test() {
  const tests = [
    { codIbge: '3550308', nome: 'São Paulo', uf: 'SP', populacao: 11451245 },
    { codIbge: '1100015', nome: "Alta Floresta D'Oeste", uf: 'RO', populacao: 22787 },
  ];

  for (const t of tests) {
    const url = `${DCA_URL}?an_exercicio=2023&id_ente=${t.codIbge}`;
    console.log(`\n--- ${t.nome} (${t.codIbge}) ---`);
    const res = await fetch(url);
    const data: { items: DCAItem[] } = await res.json();
    console.log(`  DCA items: ${data.items?.length ?? 0}`);

    if (data.items?.length > 0) {
      const fiscal = extractFiscalFromDCA(data.items, t.codIbge, t.nome, t.uf, t.populacao, 2023);
      console.log(`  Receita:        R$ ${(fiscal.receita / 1e9).toFixed(2)} B`);
      console.log(`  Despesa:        R$ ${(fiscal.despesa / 1e9).toFixed(2)} B`);
      console.log(`  Pessoal:        R$ ${(fiscal.despesaPessoal / 1e9).toFixed(2)} B`);
      console.log(`  Receita Prop.:  R$ ${(fiscal.receitaPropria / 1e9).toFixed(2)} B`);
      console.log(`  EFA:            ${(fiscal.efa * 100).toFixed(1)}%`);
      console.log(`  Saldo:          R$ ${(fiscal.saldo / 1e9).toFixed(2)} B`);
      console.log(`  Indisponível:   ${fiscal.dadosIndisponiveis}`);
    }
  }
}

test().catch(console.error);
