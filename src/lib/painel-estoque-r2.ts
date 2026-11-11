import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import type { PainelEstoqueDados } from "@/types";
import { autorizarProjetoNuvem } from "@/lib/projeto-auth-r2";

const PREFIXO = "painel-estoque";

function validarProjetoId(projetoId: string): string {
  const valor = projetoId.trim();
  if (!/^[a-zA-Z0-9_-]{8,160}$/.test(valor)) throw new Error("Identificador de projeto inválido.");
  return valor;
}

function validarToken(token: string): string {
  const valor = token.trim();
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(valor)) throw new Error("Acesso do painel inválido.");
  return valor;
}

function chave(projetoId: string, token: string) {
  return `${PREFIXO}/${encodeURIComponent(projetoId)}/${token}.json`;
}

function novoToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function validarPublicacao(publicacao: PainelEstoqueDados): PainelEstoqueDados {
  if (
    publicacao?.formato !== "ALMOXARIFADO_PAINEL_ESTOQUE" ||
    publicacao.versao !== 1 ||
    !Array.isArray(publicacao.itens) ||
    JSON.stringify(publicacao).length > 10 * 1024 * 1024
  )
    throw new Error("A publicação do estoque é inválida ou excede o limite permitido.");
  return publicacao;
}

export const publicarPainelEstoqueNuvem = createServerFn({ method: "POST" })
  .validator((data: { projetoId: string; senha: string; publicacao: PainelEstoqueDados }) => ({
    projetoId: validarProjetoId(data.projetoId),
    senha: data.senha,
    publicacao: validarPublicacao(data.publicacao),
  }))
  .handler(async ({ data }) => {
    await autorizarProjetoNuvem(data.projetoId, data.senha);
    if (data.publicacao.projeto_id !== data.projetoId)
      throw new Error("A publicação não pertence ao projeto informado.");
    const prefixo = `${PREFIXO}/${encodeURIComponent(data.projetoId)}/`;
    const existentes = await env.ALMOXARIFADO_BUCKET.list({ prefix: prefixo });
    if (existentes.objects.length)
      await env.ALMOXARIFADO_BUCKET.delete(existentes.objects.map((item) => item.key));
    const token = novoToken();
    await env.ALMOXARIFADO_BUCKET.put(
      chave(data.projetoId, token),
      JSON.stringify(data.publicacao),
      {
        httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "no-store" },
        customMetadata: { projetoId: data.projetoId, atualizadoEm: data.publicacao.atualizado_em },
      },
    );
    return {
      token,
      publicadoEm: data.publicacao.atualizado_em,
      itensPublicados: data.publicacao.itens.length,
    };
  });

export const consultarPainelEstoqueNuvem = createServerFn({ method: "GET" })
  .validator((data: { projetoId: string; token: string }) => ({
    projetoId: validarProjetoId(data.projetoId),
    token: validarToken(data.token),
  }))
  .handler(async ({ data }) => {
    const objeto = await env.ALMOXARIFADO_BUCKET.get(chave(data.projetoId, data.token));
    if (!objeto) throw new Error("Painel de estoque não localizado ou desatualizado.");
    return (await objeto.json()) as PainelEstoqueDados;
  });
