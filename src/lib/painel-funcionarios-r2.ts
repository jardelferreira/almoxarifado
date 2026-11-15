import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import type { PublicacaoPainelFuncionarios, RegistroPublicacaoFuncionario } from "@/types";
import { autorizarProjetoNuvem } from "@/lib/projeto-auth-r2";

const PREFIXO = "painel-funcionarios";

type ProjetoPublico = { projetoId: string; cpfHash: string };

function chaveRegistro(projetoId: string, cpfHash: string): string {
  return `${PREFIXO}/${encodeURIComponent(projetoId)}/${cpfHash}.json`;
}

function chaveHistorico(projetoId: string, publicacaoId: string, cpfHash: string): string {
  return `${PREFIXO}-historico/${encodeURIComponent(projetoId)}/${publicacaoId}/${cpfHash}.json`;
}

function validarProjetoId(projetoId: string): string {
  const valor = projetoId.trim();
  if (!/^[a-zA-Z0-9_-]{8,160}$/.test(valor)) throw new Error("Identificador de projeto inválido.");
  return valor;
}

function validarCpfHash(cpfHash: string): string {
  if (!/^[a-f0-9]{64}$/.test(cpfHash)) throw new Error("Identificador de funcionário inválido.");
  return cpfHash;
}

function validarPublicacao(publicacao: PublicacaoPainelFuncionarios): PublicacaoPainelFuncionarios {
  if (
    publicacao?.formato !== "ALMOXARIFADO_PAINEL_FUNCIONARIOS" ||
    publicacao.versao !== 1 ||
    typeof publicacao.projeto_id !== "string" ||
    !Array.isArray(publicacao.funcionarios) ||
    JSON.stringify(publicacao).length > 15 * 1024 * 1024
  ) {
    throw new Error("A publicação do painel é inválida ou excede o limite permitido.");
  }
  for (const registro of publicacao.funcionarios) {
    validarCpfHash(registro.cpf_hash);
    if (
      (registro.protecao !== "PIN" && registro.protecao !== "CPF") ||
      typeof registro.iv !== "string" ||
      typeof registro.dados !== "string" ||
      (registro.protecao === "PIN" &&
        (typeof registro.pin_hash !== "string" ||
          typeof registro.pin_salt !== "string" ||
          typeof registro.pin_iteracoes !== "number"))
    ) {
      throw new Error("A publicação possui um registro de funcionário inválido.");
    }
  }
  return publicacao;
}

export const publicarPainelFuncionariosNuvem = createServerFn({ method: "POST" })
  .validator(
    (data: { projetoId: string; senha: string; publicacao: PublicacaoPainelFuncionarios }) => ({
      projetoId: validarProjetoId(data.projetoId),
      senha: data.senha,
      publicacao: validarPublicacao(data.publicacao),
    }),
  )
  .handler(async ({ data }) => {
    await autorizarProjetoNuvem(data.projetoId, data.senha);
    if (data.publicacao.projeto_id !== data.projetoId)
      throw new Error("A publicação não pertence ao projeto informado.");

    const publicacaoId = crypto.randomUUID();

    await Promise.all(
      data.publicacao.funcionarios.map((registro) => {
        const corpo: RegistroPublicacaoFuncionario = registro;
        const opcoes = {
          httpMetadata: {
            contentType: "application/json; charset=utf-8",
            cacheControl: "no-store",
          },
          customMetadata: {
            projetoId: data.projetoId,
            atualizadoEm: data.publicacao.atualizado_em,
            publicacaoId,
            historicoImutavel: "true",
          },
        };
        return Promise.all([
          // Índice atual para a consulta rápida. Ele pode ser substituído.
          env.ALMOXARIFADO_BUCKET.put(
            chaveRegistro(data.projetoId, registro.cpf_hash),
            JSON.stringify(corpo),
            opcoes,
          ),
          // Cópia histórica append-only. Nunca é atualizada nem removida.
          env.ALMOXARIFADO_BUCKET.put(
            chaveHistorico(data.projetoId, publicacaoId, registro.cpf_hash),
            JSON.stringify(corpo),
            opcoes,
          ),
        ]);
      }),
    );

    return {
      publicadoEm: data.publicacao.atualizado_em,
      funcionariosPublicados: data.publicacao.funcionarios.length,
      publicacaoId,
    };
  });

export const consultarDesafioPainelFuncionario = createServerFn({ method: "POST" })
  .validator((data: ProjetoPublico) => ({
    projetoId: validarProjetoId(data.projetoId),
    cpfHash: validarCpfHash(data.cpfHash),
  }))
  .handler(async ({ data }) => {
    const objeto = await env.ALMOXARIFADO_BUCKET.get(chaveRegistro(data.projetoId, data.cpfHash));
    if (!objeto) throw new Error("Funcionário não localizado ou painel ainda não atualizado.");
    const registro = (await objeto.json()) as RegistroPublicacaoFuncionario;
    return {
      pinObrigatorio: registro.protecao === "PIN",
      pinSalt: registro.pin_salt ?? null,
      pinIteracoes: registro.pin_iteracoes ?? null,
    };
  });

export const consultarPainelFuncionario = createServerFn({ method: "POST" })
  .validator((data: ProjetoPublico & { credencialHash?: string | null }) => ({
    projetoId: validarProjetoId(data.projetoId),
    cpfHash: validarCpfHash(data.cpfHash),
    credencialHash: data.credencialHash ?? null,
  }))
  .handler(async ({ data }) => {
    const objeto = await env.ALMOXARIFADO_BUCKET.get(chaveRegistro(data.projetoId, data.cpfHash));
    if (!objeto) throw new Error("CPF ou PIN inválido.");
    const registro = (await objeto.json()) as RegistroPublicacaoFuncionario;
    if (
      registro.protecao === "PIN" &&
      (!data.credencialHash || data.credencialHash !== registro.pin_hash)
    ) {
      throw new Error("CPF ou PIN inválido.");
    }
    return {
      protecao: registro.protecao,
      iv: registro.iv,
      dados: registro.dados,
      atualizadoEm: objeto.uploaded.toISOString(),
    };
  });

export const atualizarPinPainelFuncionario = createServerFn({ method: "POST" })
  .validator(
    (data: {
      projetoId: string;
      cpfHash: string;
      pinAtualHash?: string | null;
      pinHash: string;
      pinSalt: string;
      pinIteracoes: number;
      iv: string;
      dados: string;
    }) => {
      const projetoId = validarProjetoId(data.projetoId);
      const cpfHash = validarCpfHash(data.cpfHash);
      if (
        !/^[A-Za-z0-9+/=]{40,60}$/.test(data.pinHash) ||
        !/^[A-Za-z0-9+/=]{20,40}$/.test(data.pinSalt)
      ) {
        throw new Error("O novo PIN não possui um hash válido.");
      }
      if (
        !Number.isInteger(data.pinIteracoes) ||
        data.pinIteracoes < 100_000 ||
        data.pinIteracoes > 200_000
      ) {
        throw new Error("Os parâmetros de segurança do PIN são inválidos.");
      }
      if (!data.iv || !data.dados || data.dados.length > 15 * 1024 * 1024) {
        throw new Error("Os dados protegidos do funcionário são inválidos.");
      }
      return {
        projetoId,
        cpfHash,
        pinAtualHash: data.pinAtualHash ?? null,
        pinHash: data.pinHash,
        pinSalt: data.pinSalt,
        pinIteracoes: data.pinIteracoes,
        iv: data.iv,
        dados: data.dados,
      };
    },
  )
  .handler(async ({ data }) => {
    const nome = chaveRegistro(data.projetoId, data.cpfHash);
    const objeto = await env.ALMOXARIFADO_BUCKET.get(nome);
    if (!objeto) throw new Error("Funcionário não localizado ou painel ainda não atualizado.");
    const atual = (await objeto.json()) as RegistroPublicacaoFuncionario;
    if (atual.protecao === "PIN") {
      if (!data.pinAtualHash || data.pinAtualHash !== atual.pin_hash) {
        throw new Error("O PIN atual não confere.");
      }
    } else if (data.pinAtualHash) {
      throw new Error("Este funcionário ainda não possui PIN. Não informe um PIN atual.");
    }
    const atualizado: RegistroPublicacaoFuncionario = {
      cpf_hash: data.cpfHash,
      protecao: "PIN",
      pin_hash: data.pinHash,
      pin_salt: data.pinSalt,
      pin_iteracoes: data.pinIteracoes,
      iv: data.iv,
      dados: data.dados,
    };
    await env.ALMOXARIFADO_BUCKET.put(nome, JSON.stringify(atualizado), {
      httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "no-store" },
      customMetadata: {
        projetoId: data.projetoId,
        atualizadoEm: new Date().toISOString(),
        origem: "consulta-funcionario",
      },
    });
    return { atualizado: true };
  });
