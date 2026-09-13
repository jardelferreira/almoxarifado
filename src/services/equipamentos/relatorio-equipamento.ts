import type {
    Equipamento,
    EstoqueEquipamento,
    Funcionario,
    MovimentacaoEquipamento,
} from "@/types";
import { formatarData } from "@/utils/format";
import {
    descricaoMovimento,
    type ParticipanteMaps,
} from "./historico";

export type RelatorioEquipamentoInput = {
    equipamento: Equipamento;
    estoque: EstoqueEquipamento;
    categoria: string;
    responsavel: Funcionario | undefined;
    equipe: string;
    status: "DISPONIVEL" | "EM_USO" | "MANUTENCAO";
    movimentacoes: MovimentacaoEquipamento[];
    maps: ParticipanteMaps;
};

const statusLabel: Record<RelatorioEquipamentoInput["status"], string> = {
    DISPONIVEL: "Disponível",
    EM_USO: "Em uso",
    MANUTENCAO: "Em manutenção",
};

function esc(valor: unknown): string {
    return String(valor ?? "—")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;")
        .replace(/\n/g, "<br />");
}

function formatarDataHoraMovimentacao(movimento: MovimentacaoEquipamento): string {
    const data = new Date(movimento.criado_em);
    if (Number.isNaN(data.getTime())) return formatarData(movimento.data);

    return new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
    }).format(data);
}

function rotuloMovimentacao(tipo: MovimentacaoEquipamento["tipo"]): string {
    const labels: Record<string, string> = {
        ENTRADA: "Entrada no estoque",
        SAIDA: "Saída para funcionário",
        DEVOLUCAO: "Devolução do funcionário",
        TRANSFERENCIA: "Transferência entre funcionários",
        SINALIZAR_MANUTENCAO: "Sinalizar para manutenção",
        ENVIO: "Envio para manutenção",
        RETORNO_MANUTENCAO: "Retorno da manutenção",
        DEVOLUCAO_FORNECEDOR: "Devolução ao fornecedor",
        BAIXA: "Baixa definitiva",
        REENTRADA: "Reentrada no estoque",
        MANUTENCAO: "Manutenção (histórico)",
        RETIRADA_MANUTENCAO: "Envio para manutenção (histórico)",
    };
    return labels[tipo] ?? tipo;
}

export function gerarRelatorioEquipamento({
    equipamento,
    estoque,
    categoria,
    responsavel,
    equipe,
    status,
    movimentacoes,
    maps,
}: RelatorioEquipamentoInput): void {
    const identificacao =
        estoque.patrimonio || estoque.identificacao || estoque.serial || estoque.id;
    const dataEmissao = new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "long",
        timeStyle: "short",
    }).format(new Date());
    const historico = [...movimentacoes].sort((a, b) =>
        `${b.criado_em}|${b.id}`.localeCompare(`${a.criado_em}|${a.id}`),
    );

    const historicoHtml = historico.length
        ? historico
              .map(
                  (movimento) => `
            <tr>
                <td>${esc(formatarDataHoraMovimentacao(movimento))}</td>
                <td><span class="movement">${esc(rotuloMovimentacao(movimento.tipo))}</span></td>
                <td>${esc(descricaoMovimento(movimento, maps))}</td>
                <td class="center num">${esc(movimento.quantidade)}</td>
                <td>${esc(movimento.observacoes || "—")}</td>
            </tr>`,
              )
              .join("")
        : `<tr><td colspan="5" class="empty">Nenhuma movimentação registrada para este equipamento.</td></tr>`;

    const janela = window.open("", "_blank", "width=1200,height=900");
    if (!janela) {
        throw new Error(
            "Não foi possível abrir o relatório. Verifique se o navegador bloqueou a nova janela.",
        );
    }

    janela.document.write(`<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Relatório — ${esc(equipamento.nome)} — ${esc(identificacao)}</title>
<style>
@page { size: A4 portrait; margin: 12mm 12mm 15mm; }
:root {
    color-scheme: light;
    --navy: #17324D;
    --navy-2: #24445F;
    --amber: #D9A441;
    --ink: #243447;
    --muted: #667788;
    --line: #D9E0E7;
    --soft: #F4F7F9;
    --soft-blue: #EEF4F8;
}
* { box-sizing: border-box; }
body {
    margin: 0;
    color: var(--ink);
    background: #fff;
    font-family: "IBM Plex Sans", Arial, Helvetica, sans-serif;
    font-size: 9px;
    line-height: 1.45;
}
.report { width: 100%; }
.header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 24px;
    padding-bottom: 12px;
    border-bottom: 3px solid var(--navy);
}
.brand {
    color: var(--navy);
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 1.8px;
    text-transform: uppercase;
}
h1 {
    margin: 4px 0 3px;
    color: var(--navy);
    font-family: "Barlow Condensed", Arial, sans-serif;
    font-size: 23px;
    line-height: 1.05;
}
.subtitle { color: var(--muted); font-size: 9px; }
.meta {
    min-width: 180px;
    text-align: right;
    color: var(--muted);
    font-size: 8px;
}
.meta strong {
    display: block;
    color: var(--navy);
    font-size: 9px;
    margin-bottom: 3px;
}
.status {
    display: inline-block;
    margin-top: 7px;
    padding: 4px 8px;
    border-radius: 999px;
    background: var(--soft-blue);
    color: var(--navy);
    font-size: 7px;
    font-weight: 800;
    letter-spacing: .6px;
    text-transform: uppercase;
}
.section { margin-top: 16px; break-inside: avoid; }
.section-title {
    display: flex;
    align-items: center;
    gap: 7px;
    margin: 0 0 7px;
    padding-bottom: 5px;
    border-bottom: 1px solid var(--line);
    color: var(--navy);
    font-size: 10px;
    font-weight: 800;
}
.section-title::before {
    content: "";
    width: 3px;
    height: 13px;
    border-radius: 2px;
    background: var(--amber);
}
.responsibility {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 7px;
    padding: 9px;
    border: 1px solid var(--line);
    border-top: 3px solid var(--amber);
    border-radius: 6px;
    background: var(--soft);
}
.field-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 7px;
}
.field {
    min-height: 42px;
    padding: 7px 8px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: #fff;
}
.field.wide { grid-column: span 3; }
.label {
    display: block;
    margin-bottom: 3px;
    color: var(--muted);
    font-size: 7px;
    font-weight: 700;
    letter-spacing: .55px;
    text-transform: uppercase;
}
.value {
    font-size: 9px;
    font-weight: 600;
    overflow-wrap: anywhere;
}
table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    font-size: 8px;
}
thead { display: table-header-group; }
tr { break-inside: avoid; page-break-inside: avoid; }
th {
    padding: 6px 5px;
    background: var(--navy);
    color: #fff;
    border: 1px solid var(--navy-2);
    text-align: left;
    font-size: 7px;
    font-weight: 800;
    letter-spacing: .4px;
    text-transform: uppercase;
}
td {
    padding: 5px;
    border-bottom: 1px solid var(--line);
    vertical-align: top;
    overflow-wrap: anywhere;
}
tbody tr:nth-child(even) td { background: var(--soft); }
th:nth-child(1), td:nth-child(1) { width: 12%; }
th:nth-child(2), td:nth-child(2) { width: 16%; }
th:nth-child(3), td:nth-child(3) { width: 32%; }
th:nth-child(4), td:nth-child(4) { width: 9%; text-align: center; }
th:nth-child(5), td:nth-child(5) { width: 31%; }
.movement {
    display: inline-block;
    padding: 2px 5px;
    border-radius: 4px;
    background: var(--soft-blue);
    color: var(--navy);
    font-size: 6.5px;
    font-weight: 800;
    white-space: nowrap;
}
.num { font-variant-numeric: tabular-nums; }
.center { text-align: center; }
.note {
    margin-top: 11px;
    padding: 8px 9px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--soft);
}
.footer {
    display: flex;
    justify-content: space-between;
    gap: 20px;
    margin-top: 14px;
    padding-top: 7px;
    border-top: 1px solid var(--line);
    color: var(--muted);
    font-size: 7px;
}
.actions {
    position: fixed;
    top: 14px;
    right: 14px;
    display: flex;
    gap: 7px;
    z-index: 10;
}
.actions button {
    border: 1px solid #C8D1DA;
    border-radius: 6px;
    padding: 7px 10px;
    background: #fff;
    color: var(--navy);
    font-weight: 700;
    cursor: pointer;
}
.actions .primary { border-color: var(--navy); background: var(--navy); color: #fff; }
@media screen {
    body { background: #EEF1F4; padding: 28px; }
    .report { max-width: 820px; margin: 0 auto; padding: 24px 26px; background: #fff; box-shadow: 0 10px 32px rgba(20,35,50,.09); }
}
@media print {
    .actions { display: none !important; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .note, .footer { break-inside: avoid; }
}
</style>
</head>
<body>
<div class="actions"><button onclick="window.close()">Fechar</button><button class="primary" onclick="window.print()">Imprimir / Salvar PDF</button></div>
<main class="report">
<header class="header">
    <div>
        <div class="brand">ALMOXARIFADO · Gestão local-first</div>
        <h1>Relatório do equipamento</h1>
        <div class="subtitle">${esc(equipamento.nome)} · ${esc(identificacao)}</div>
    </div>
    <div class="meta">
        <strong>Relatório individual</strong>
        Emitido em ${esc(dataEmissao)}
        <span class="status">${esc(statusLabel[status])}</span>
    </div>
</header>
<section class="section">
    <h2 class="section-title">Responsabilidade atual</h2>
    <div class="responsibility">
        <div><span class="label">Responsável</span><span class="value">${esc(responsavel?.nome ?? "Disponível no Almoxarifado")}</span></div>
        <div><span class="label">Equipe</span><span class="value">${esc(equipe)}</span></div>
        <div><span class="label">Status</span><span class="value">${esc(statusLabel[status])}</span></div>
    </div>
</section>
<section class="section">
    <h2 class="section-title">Identificação</h2>
    <div class="field-grid">
        <div class="field"><span class="label">Patrimônio</span><span class="value">${esc(estoque.patrimonio)}</span></div>
        <div class="field"><span class="label">Identificação</span><span class="value">${esc(estoque.identificacao)}</span></div>
        <div class="field"><span class="label">Número de série</span><span class="value">${esc(estoque.serial)}</span></div>
        <div class="field"><span class="label">Vínculo</span><span class="value">${esc(estoque.vinculo)}</span></div>
        <div class="field"><span class="label">Tipo de controle</span><span class="value">${esc(equipamento.tipo_controle)}</span></div>
        <div class="field"><span class="label">Categoria</span><span class="value">${esc(categoria)}</span></div>
    </div>
</section>
<section class="section">
    <h2 class="section-title">Dados do cadastro</h2>
    <div class="field-grid">
        <div class="field"><span class="label">Equipamento</span><span class="value">${esc(equipamento.nome)}</span></div>
        <div class="field"><span class="label">Marca</span><span class="value">${esc(equipamento.marca)}</span></div>
        <div class="field"><span class="label">Modelo</span><span class="value">${esc(equipamento.modelo)}</span></div>
        <div class="field wide"><span class="label">Observações</span><span class="value">${esc(estoque.observacoes)}</span></div>
    </div>
</section>
<section class="section">
    <h2 class="section-title">Histórico de movimentações</h2>
    <table>
        <thead><tr><th>Data</th><th>Movimento</th><th>Origem → Destino</th><th>Qtd.</th><th>Observações</th></tr></thead>
        <tbody>${historicoHtml}</tbody>
    </table>
</section>
<div class="note"><strong>Observação:</strong> este documento representa o estado e o histórico registrados no momento da emissão.</div>
<footer class="footer"><span>ALMOXARIFADO · Gestão local-first</span><span>${esc(equipamento.nome)} · ${esc(identificacao)}</span></footer>
</main>
<script>window.addEventListener("load",()=>setTimeout(()=>window.print(),350));</script>
</body>
</html>`);
    janela.document.close();
    janela.focus();
}
