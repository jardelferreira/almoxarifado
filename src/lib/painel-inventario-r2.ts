import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import type {
  AtualizacaoPainelInventario,
  IndicePainelInventario,
  PublicacaoInventario,
  RegistroPublicacaoInventario,
} from "@/types";
import { autorizarProjetoNuvem } from "@/lib/projeto-auth-r2";
import { notificarInscricoesPush } from "@/lib/push-notifications-r2";

const PREFIXO = "painel-inventarios";
const FORMATO = "ALMOXARIFADO_PAINEL_INVENTARIO";
const INDICE = "ALMOXARIFADO_INDICE_PAINEL_INVENTARIO";

function validarId(valor: string, campo: string) {
  const texto = valor.trim();
  if (!/^[a-zA-Z0-9_-]{8,160}$/.test(texto)) throw new Error(`${campo} inválido.`);
  return texto;
}
function validarCpfHash(valor: string) {
  if (!/^[a-f0-9]{64}$/.test(valor)) throw new Error("CPF inválido.");
  return valor;
}
function caminho(projetoId: string, inventarioId: string, cpfHash: string) {
  return `${PREFIXO}/${encodeURIComponent(projetoId)}/${encodeURIComponent(inventarioId)}/${cpfHash}.json`;
}
function caminhoIndice(projetoId: string, cpfHash: string) {
  return `${PREFIXO}/${encodeURIComponent(projetoId)}/indices/${cpfHash}.json`;
}
function caminhoAtualizacoes(projetoId: string, inventarioId: string) {
  return `${PREFIXO}/${encodeURIComponent(projetoId)}/${encodeURIComponent(inventarioId)}/atualizacoes.json`;
}

function validarRegistro(
  registro: RegistroPublicacaoInventario,
  projetoId: string,
  inventarioId: string,
) {
  if (
    registro.inventario_id !== inventarioId ||
    !/^[a-f0-9]{64}$/.test(registro.cpf_hash) ||
    typeof registro.pin_hash !== "string" ||
    typeof registro.pin_salt !== "string" ||
    !Number.isInteger(registro.pin_iteracoes) ||
    typeof registro.iv !== "string" ||
    typeof registro.dados !== "string" ||
    registro.dados.length > 15 * 1024 * 1024
  )
    throw new Error(`Registro de inventário inválido para ${projetoId}.`);
}

export const publicarPainelInventarioNuvem = createServerFn({ method: "POST" })
  .validator((data: { projetoId: string; senha: string; publicacao: PublicacaoInventario }) => {
    const projetoId = validarId(data.projetoId, "Projeto");
    const publicacao = data.publicacao;
    if (
      publicacao.formato !== FORMATO ||
      publicacao.versao !== 1 ||
      publicacao.projeto_id !== projetoId
    )
      throw new Error("Publicação de inventário inválida.");
    const inventarioId = validarId(publicacao.inventario_id, "Inventário");
    for (const registro of publicacao.registros) validarRegistro(registro, projetoId, inventarioId);
    return { projetoId, senha: data.senha, publicacao };
  })
  .handler(async ({ data }) => {
    await autorizarProjetoNuvem(data.projetoId, data.senha);
    const opcoes = {
      httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "no-store" },
      customMetadata: {
        projetoId: data.projetoId,
        inventarioId: data.publicacao.inventario_id,
        atualizadoEm: data.publicacao.atualizado_em,
      },
    };
    await Promise.all(
      data.publicacao.registros.map((registro) =>
        env.ALMOXARIFADO_BUCKET.put(
          caminho(data.projetoId, data.publicacao.inventario_id, registro.cpf_hash),
          JSON.stringify(registro),
          opcoes,
        ),
      ),
    );
    const indices = new Map<string, IndicePainelInventario>();
    for (const registro of data.publicacao.registros) {
      const nome = caminhoIndice(data.projetoId, registro.cpf_hash);
      const atual = await env.ALMOXARIFADO_BUCKET.get(nome);
      const indiceAtual = atual
        ? ((await atual.json()) as IndicePainelInventario)
        : {
            formato: INDICE,
            versao: 1,
            projeto_id: data.projetoId,
            cpf_hash: registro.cpf_hash,
            inventarios: [],
          };
      const inventarios = indiceAtual.inventarios.filter(
        (item) => item.inventario_id !== registro.inventario_id,
      );
      indices.set(nome, {
        ...indiceAtual,
        inventarios: [
          ...inventarios,
          {
            inventario_id: registro.inventario_id,
            pin_salt: registro.pin_salt,
            pin_iteracoes: registro.pin_iteracoes,
            atualizado_em: registro.atualizado_em,
          },
        ],
      });
    }
    await Promise.all(
      [...indices].map(([nome, indice]) =>
        env.ALMOXARIFADO_BUCKET.put(nome, JSON.stringify(indice), opcoes),
      ),
    );
    try {
      await notificarInscricoesPush(
        data.projetoId,
        {
          titulo: "Inventário disponível",
          corpo: "Você foi incluído em um inventário e já pode acessar a conferência.",
          url: `/consulta-inventario?projeto=${encodeURIComponent(data.projetoId)}`,
          tag: `inventario-${data.publicacao.inventario_id}`,
        },
        data.publicacao.registros.map((registro) => registro.cpf_hash),
      );
    } catch (error) {
      console.warn("A publicação do inventário foi concluída, mas o envio push falhou.", error);
    }
    return {
      publicados: data.publicacao.registros.length,
      atualizadoEm: data.publicacao.atualizado_em,
    };
  });

export const consultarDesafioPainelInventario = createServerFn({ method: "POST" })
  .validator((data: { projetoId: string; cpfHash: string }) => ({
    projetoId: validarId(data.projetoId, "Projeto"),
    cpfHash: validarCpfHash(data.cpfHash),
  }))
  .handler(async ({ data }) => {
    const objeto = await env.ALMOXARIFADO_BUCKET.get(caminhoIndice(data.projetoId, data.cpfHash));
    if (!objeto) throw new Error("Nenhum inventário aberto foi publicado para este CPF.");
    const indice = (await objeto.json()) as IndicePainelInventario;
    if (indice.formato !== INDICE || indice.projeto_id !== data.projetoId)
      throw new Error("Índice de inventário inválido.");
    return indice.inventarios;
  });

export const consultarPainelInventario = createServerFn({ method: "POST" })
  .validator(
    (data: {
      projetoId: string;
      inventarioId: string;
      cpfHash: string;
      credencialHash: string;
    }) => ({
      projetoId: validarId(data.projetoId, "Projeto"),
      inventarioId: validarId(data.inventarioId, "Inventário"),
      cpfHash: validarCpfHash(data.cpfHash),
      credencialHash: data.credencialHash,
    }),
  )
  .handler(async ({ data }) => {
    const objeto = await env.ALMOXARIFADO_BUCKET.get(
      caminho(data.projetoId, data.inventarioId, data.cpfHash),
    );
    if (!objeto) throw new Error("Inventário não localizado para este funcionário.");
    const registro = (await objeto.json()) as RegistroPublicacaoInventario;
    if (registro.pin_hash !== data.credencialHash) throw new Error("CPF ou PIN inválido.");
    const atualizacoesObjeto = await env.ALMOXARIFADO_BUCKET.get(
      caminhoAtualizacoes(data.projetoId, data.inventarioId),
    );
    const atualizacoes = atualizacoesObjeto
      ? ((await atualizacoesObjeto.json()) as AtualizacaoPainelInventario[])
      : [];
    return {
      inventarioId: data.inventarioId,
      iv: registro.iv,
      dados: registro.dados,
      atualizadoEm: registro.atualizado_em,
      atualizacoes,
    };
  });

export const salvarPainelInventario = createServerFn({ method: "POST" })
  .validator(
    (data: {
      projetoId: string;
      inventarioId: string;
      cpfHash: string;
      credencialHash: string;
      iv: string;
      dados: string;
      itemId: string;
      quantidade: number;
      observacao?: string | null;
    }) => ({
      projetoId: validarId(data.projetoId, "Projeto"),
      inventarioId: validarId(data.inventarioId, "Inventário"),
      cpfHash: validarCpfHash(data.cpfHash),
      credencialHash: data.credencialHash,
      iv: data.iv,
      dados: data.dados,
      itemId: data.itemId,
      quantidade: data.quantidade,
      observacao: data.observacao ?? null,
    }),
  )
  .handler(async ({ data }) => {
    const nome = caminho(data.projetoId, data.inventarioId, data.cpfHash);
    const objeto = await env.ALMOXARIFADO_BUCKET.get(nome);
    if (!objeto) throw new Error("Inventário não localizado para este funcionário.");
    const atual = (await objeto.json()) as RegistroPublicacaoInventario;
    if (atual.pin_hash !== data.credencialHash) throw new Error("CPF ou PIN inválido.");
    const registro = {
      ...atual,
      iv: data.iv,
      dados: data.dados,
      atualizado_em: new Date().toISOString(),
    };
    await env.ALMOXARIFADO_BUCKET.put(nome, JSON.stringify(registro), {
      httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "no-store" },
      customMetadata: {
        projetoId: data.projetoId,
        inventarioId: data.inventarioId,
        origem: "painel-funcionario",
      },
    });
    const atualizacoesNome = caminhoAtualizacoes(data.projetoId, data.inventarioId);
    const atualizacoesObjeto = await env.ALMOXARIFADO_BUCKET.get(atualizacoesNome);
    const atuais = atualizacoesObjeto
      ? ((await atualizacoesObjeto.json()) as AtualizacaoPainelInventario[])
      : [];
    const atualizacao: AtualizacaoPainelInventario = {
      item_id: data.itemId,
      quantidade_contada: data.quantidade,
      observacao: data.observacao,
      cpf_hash: data.cpfHash,
      atualizado_em: registro.atualizado_em,
    };
    await env.ALMOXARIFADO_BUCKET.put(
      atualizacoesNome,
      JSON.stringify([...atuais, atualizacao].slice(-100_000)),
      {
        httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "no-store" },
        customMetadata: {
          projetoId: data.projetoId,
          inventarioId: data.inventarioId,
          historico: "append-only",
        },
      },
    );
    return { atualizadoEm: registro.atualizado_em };
  });
