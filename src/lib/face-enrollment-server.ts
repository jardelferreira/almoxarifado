import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";

const MAX_IMAGES = 5;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

type FaceEnrollmentEnv = {
  FACE_API_URL?: string;
  FACE_API_KEY?: string;
};

const faceEnv = env as typeof env & FaceEnrollmentEnv;

function validarSubjectId(valor: unknown): string {
  const subjectId = String(valor ?? "").trim();
  if (!subjectId || subjectId.length > 160) throw new Error("Funcionário inválido para cadastro facial.");
  return subjectId;
}

function normalizarApiUrl(valor: string): string {
  const url = valor.trim().replace(/\/+$/, "");
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
  } catch {
    throw new Error("FACE_API_URL não está configurada com uma URL válida no servidor.");
  }
  return url;
}

async function jsonBody(response: Response): Promise<Record<string, unknown>> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return {};
  const body = await response.json();
  return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
}

function mensagemApi(status: number): string {
  if (status === 401) return "A chave de cliente para cadastro facial é inválida.";
  if (status === 403) return "A chave de cliente não possui o escopo template:enroll ou não está autorizada para este funcionário.";
  if (status === 404) return "O endpoint de cadastro facial não foi encontrado na API configurada.";
  if (status === 413) return "As imagens excedem o limite permitido pela API facial.";
  if (status === 422) return "As imagens não puderam ser processadas. Use fotos com apenas um rosto visível.";
  return `A API facial respondeu com HTTP ${status}.`;
}

export const cadastrarBiometriaFacialNoBackend = createServerFn({ method: "POST" })
  .validator((data) => {
    if (!(data instanceof FormData)) throw new Error("Dados do cadastro facial inválidos.");
    const subjectId = validarSubjectId(data.get("subject_id"));
    const arquivos = data.getAll("reference_images");
    if (arquivos.length < 2 || arquivos.length > MAX_IMAGES) {
      throw new Error("O cadastro facial exige entre 2 e 5 imagens.");
    }
    for (const arquivo of arquivos) {
      if (!(arquivo instanceof File) || !arquivo.type.startsWith("image/")) {
        throw new Error("Todas as referências devem ser imagens.");
      }
      if (arquivo.size === 0 || arquivo.size > MAX_IMAGE_SIZE) {
        throw new Error("Cada imagem deve ter até 10 MiB.");
      }
    }
    return { subjectId, arquivos: arquivos as File[] };
  })
  .handler(async ({ data }) => {
    const apiUrl = normalizarApiUrl(String(faceEnv.FACE_API_URL ?? ""));
    const apiKey = String(faceEnv.FACE_API_KEY ?? "").trim();
    if (!apiKey) throw new Error("FACE_API_KEY não está configurada no servidor.");

    const form = new FormData();
    data.arquivos.forEach((arquivo) => form.append("reference_images", arquivo, arquivo.name));
    const response = await fetch(
      `${apiUrl}/v1/experimental/subjects/${encodeURIComponent(data.subjectId)}/enroll`,
      { method: "POST", headers: { "X-API-Key": apiKey }, body: form },
    );
    const body = await jsonBody(response);
    if (!response.ok) throw new Error(mensagemApi(response.status));
    return {
      subjectId: data.subjectId,
      enrolledImages: typeof body.enrolled_images === "number" ? body.enrolled_images : data.arquivos.length,
      apiUrl,
    };
  });
