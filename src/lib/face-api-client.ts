import { clienteFaceApiRepo } from "@/services/cliente-face-api-repo";

const STORAGE_KEY = "almoxarifado.face-api.config.v1";
const DEFAULT_API_URL = "http://127.0.0.1:8767";
const MAX_IMAGE_EDGE = 1920;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export const FACE_API_SCOPES = [
  "capture:validate",
  "face:compare",
  "template:read",
  "template:verify",
  "template:enroll",
  "template:delete",
] as const;
export type FaceApiScope = (typeof FACE_API_SCOPES)[number];
export type FaceApiConfig = { apiUrl: string; apiKey: string; adminKey: string };
export type FaceEnrollmentResult = { subjectId: string; enrolledImages: number; apiUrl: string };
export type FaceImagePreparation = {
  file: File;
  info: {
    originalName: string;
    originalDimensions: string;
    preparedDimensions: string;
    originalSizeBytes: number;
    preparedSizeBytes: number;
    changed: boolean;
  };
};
export type FaceVerificationResult = {
  subjectId: string;
  apiUrl: string;
  httpStatus: number;
  captureValid: boolean;
  verificationReceived: boolean;
  meanReferenceSimilarity: number | null;
  medianReferenceSimilarity: number | null;
  centroidCosineSimilarity: number | null;
};

function normalizarUrl(valor: string) {
  const url = valor.trim().replace(/\/+$/, "");
  if (!url) throw new Error("Informe a URL base da API facial.");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("A URL da API facial não é válida.");
  }
  if (!["http:", "https:"].includes(parsed.protocol))
    throw new Error("A URL da API facial deve começar com http:// ou https://.");
  return url;
}
const configVazia = (): FaceApiConfig => ({ apiUrl: DEFAULT_API_URL, apiKey: "", adminKey: "" });
export function obterConfiguracaoFaceApi(): FaceApiConfig {
  if (typeof window === "undefined") return configVazia();
  try {
    const salvo = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? "null",
    ) as Partial<FaceApiConfig> | null;
    return {
      apiUrl: normalizarUrl(String(salvo?.apiUrl ?? DEFAULT_API_URL)),
      apiKey: String(salvo?.apiKey ?? "").trim(),
      adminKey: String(salvo?.adminKey ?? "").trim(),
    };
  } catch {
    return configVazia();
  }
}
export function salvarConfiguracaoFaceApi(configuracao: FaceApiConfig) {
  const normalizada = {
    apiUrl: normalizarUrl(configuracao.apiUrl),
    apiKey: configuracao.apiKey.trim(),
    adminKey: configuracao.adminKey.trim(),
  };
  if (typeof window !== "undefined")
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizada));
  return normalizada;
}
function erroAdmin(status: number) {
  if (status === 401) return "A X-Admin-Key é inválida ou não foi informada.";
  if (status === 403) return "A X-Admin-Key não tem permissão para esta operação.";
  if (status === 404) return "O client facial não foi encontrado na API.";
  if (status === 409) return "Já existe um client facial ativo para este projeto.";
  return `A API facial respondeu com HTTP ${status} na operação administrativa.`;
}
function erroHttp(status: number) {
  if (status === 401) return "A chave da API facial é inválida ou não foi informada.";
  if (status === 403)
    return "A API recusou o acesso. Confira o escopo e se o subject_id está autorizado.";
  if (status === 404) return "O cadastro facial não foi encontrado.";
  if (status === 413) return "A imagem excede o limite permitido pela API facial.";
  if (status === 422) return "A captura precisa conter exatamente um rosto utilizável.";
  return `A API facial respondeu com HTTP ${status}.`;
}
async function bodyJson(response: Response): Promise<Record<string, unknown>> {
  if (!(response.headers.get("content-type") ?? "").includes("application/json")) return {};
  const body = await response.json();
  return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
}
async function fetchApi(path: string, options: RequestInit = {}, key?: string, prazoMs = 12000) {
  const cfg = obterConfiguracaoFaceApi();
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), prazoMs);
  try {
    const response = await fetch(`${cfg.apiUrl}${path}`, {
      ...options,
      headers: { ...(key ? { "X-API-Key": key } : {}), ...(options.headers ?? {}) },
      cache: "no-store",
      signal: controller.signal,
    });
    return { response, body: await bodyJson(response) };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw new Error("A API facial não respondeu dentro do prazo configurado.");
    throw new Error("Não foi possível conectar à API facial. Verifique a URL, a rede e o CORS.");
  } finally {
    window.clearTimeout(timer);
  }
}
async function fetchAdmin(path: string, options: RequestInit = {}) {
  const cfg = obterConfiguracaoFaceApi();
  if (!cfg.adminKey) throw new Error("Informe a X-Admin-Key nas configurações da API facial.");
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${cfg.apiUrl}${path}`, {
      ...options,
      headers: { "X-Admin-Key": cfg.adminKey, ...(options.headers ?? {}) },
      cache: "no-store",
      signal: controller.signal,
    });
    const body = await bodyJson(response);
    if (!response.ok) throw new Error(erroAdmin(response.status));
    return body;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw new Error("A API facial não respondeu durante a operação administrativa.");
    if (error instanceof Error && error.message.includes("API facial")) throw error;
    throw new Error(
      "Não foi possível administrar o client facial. Verifique a URL, a chave e o CORS.",
    );
  } finally {
    window.clearTimeout(timer);
  }
}
function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
}
export async function obterClienteFaceApi(projetoId: string) {
  return clienteFaceApiRepo.obter(projetoId);
}
export async function criarClienteFaceApi(
  projetoId: string,
  displayName: string,
  scopes: string[],
  subjectIds: string[],
) {
  if (await clienteFaceApiRepo.obter(projetoId))
    throw new Error(
      "Este projeto já possui um client facial. Revogue o client atual antes de criar outro.",
    );
  const cfg = obterConfiguracaoFaceApi();
  const body = await fetchAdmin("/v1/experimental/clients", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      display_name: displayName.trim() || `PWA ${projetoId.slice(0, 8)}`,
      scopes: [...new Set(scopes)],
    }),
  });
  const clientId = String(body.client_id ?? body.id ?? "").trim();
  const apiKey = String(body.api_key ?? "").trim();
  if (!clientId || !apiKey)
    throw new Error("A API não retornou client_id e api_key para o novo client.");
  try {
    await fetchAdmin(`/v1/experimental/clients/${encodeURIComponent(clientId)}/subjects`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject_ids: strings(subjectIds) }),
    });
  } catch (error) {
    try {
      await fetchAdmin(`/v1/experimental/clients/${encodeURIComponent(clientId)}`, {
        method: "DELETE",
      });
    } catch {
      /* rollback best effort */
    }
    throw error;
  }
  await clienteFaceApiRepo.salvar(projetoId, {
    client_id: clientId,
    display_name: String(body.display_name ?? displayName),
    api_key: apiKey,
    scopes: strings(body.scopes).length ? strings(body.scopes) : [...new Set(scopes)],
    ativo: true,
  });
  return { client_id: clientId, api_key: apiKey };
}
export async function listarSubjectsFaceApi(projetoId: string) {
  const cliente = await clienteFaceApiRepo.obter(projetoId);
  if (!cliente) throw new Error("Este projeto ainda não possui client facial.");
  const body = await fetchAdmin(
    `/v1/experimental/clients/${encodeURIComponent(cliente.client_id)}/subjects`,
  );
  return strings(body.subject_ids ?? body.subjects);
}
export async function autorizarSubjectFaceApi(projetoId: string, subjectId: string) {
  const id = subjectId.trim();
  const cliente = await clienteFaceApiRepo.obter(projetoId);
  if (!id) throw new Error("O funcionário não possui um subject_id válido.");
  if (!cliente) throw new Error("Este projeto ainda não possui client facial ativo.");
  const atuais = await listarSubjectsFaceApi(projetoId);
  if (atuais.includes(id)) return;
  await fetchAdmin(`/v1/experimental/clients/${encodeURIComponent(cliente.client_id)}/subjects`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subject_ids: [...atuais, id] }),
  });
}
export async function sincronizarFuncionarioComClienteFaceApi(
  projetoId: string,
  funcionarioId: string,
) {
  if (await clienteFaceApiRepo.obter(projetoId))
    await autorizarSubjectFaceApi(projetoId, funcionarioId);
}
export async function atualizarEscoposClienteFaceApi(projetoId: string, scopes: string[]) {
  const cliente = await clienteFaceApiRepo.obter(projetoId);
  if (!cliente) throw new Error("Client facial não configurado.");
  await fetchAdmin(`/v1/experimental/clients/${encodeURIComponent(cliente.client_id)}/scopes`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scopes: [...new Set(scopes)] }),
  });
  return clienteFaceApiRepo.salvar(projetoId, { ...cliente, scopes: [...new Set(scopes)] });
}
export async function rotacionarClienteFaceApi(projetoId: string) {
  const cliente = await clienteFaceApiRepo.obter(projetoId);
  if (!cliente) throw new Error("Client facial não configurado.");
  const body = await fetchAdmin(
    `/v1/experimental/clients/${encodeURIComponent(cliente.client_id)}/rotate`,
    { method: "POST" },
  );
  const apiKey = String(body.api_key ?? "").trim();
  if (!apiKey) throw new Error("A API não retornou a nova API-key.");
  await clienteFaceApiRepo.salvar(projetoId, { ...cliente, api_key: apiKey });
  return apiKey;
}
export async function revogarClienteFaceApi(projetoId: string) {
  const cliente = await clienteFaceApiRepo.obter(projetoId);
  if (!cliente) return;
  await fetchAdmin(`/v1/experimental/clients/${encodeURIComponent(cliente.client_id)}`, {
    method: "DELETE",
  });
  await clienteFaceApiRepo.limpar(projetoId);
}
export async function testarConexaoFaceApi() {
  const { response, body } = await fetchApi("/health", {}, obterConfiguracaoFaceApi().apiKey, 5000);
  if (!response.ok) throw new Error(erroHttp(response.status));
  return body;
}
async function abrirImagem(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    if (typeof image.decode === "function") await image.decode();
    else
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error());
      });
    return { image, width: image.naturalWidth, height: image.naturalHeight };
  } catch {
    throw new Error("Não foi possível abrir a imagem. Tente uma foto JPEG ou PNG menor.");
  } finally {
    URL.revokeObjectURL(url);
  }
}
function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("O navegador não conseguiu preparar a imagem.")),
      "image/jpeg",
      quality,
    ),
  );
}
export async function prepararImagemFacial(file: File | undefined): Promise<FaceImagePreparation> {
  if (!file) throw new Error("Capture uma imagem antes de continuar.");
  if (!file.type.startsWith("image/")) throw new Error("Selecione uma imagem JPEG ou PNG.");
  const { image, width, height } = await abrirImagem(file);
  const escala = Math.min(1, MAX_IMAGE_EDGE / Math.max(width, height));
  const mudou =
    escala < 1 || file.size > MAX_IMAGE_BYTES || !["image/jpeg", "image/png"].includes(file.type);
  if (!mudou)
    return {
      file,
      info: {
        originalName: file.name,
        originalDimensions: `${width}x${height}`,
        preparedDimensions: `${width}x${height}`,
        originalSizeBytes: file.size,
        preparedSizeBytes: file.size,
        changed: false,
      },
    };
  const targetWidth = Math.max(1, Math.round(width * escala));
  const targetHeight = Math.max(1, Math.round(height * escala));
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Este navegador não oferece suporte ao preparo da imagem.");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, targetWidth, targetHeight);
  context.drawImage(image, 0, 0, targetWidth, targetHeight);
  let blob = await canvasBlob(canvas, 0.9);
  if (blob.size > MAX_IMAGE_BYTES) blob = await canvasBlob(canvas, 0.8);
  if (blob.size > MAX_IMAGE_BYTES) throw new Error("A imagem ainda excede 10 MiB após a redução.");
  const preparado = new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "captura"}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
  return {
    file: preparado,
    info: {
      originalName: file.name,
      originalDimensions: `${width}x${height}`,
      preparedDimensions: `${targetWidth}x${targetHeight}`,
      originalSizeBytes: file.size,
      preparedSizeBytes: blob.size,
      changed: true,
    },
  };
}
export async function verificarCapturaFacial(file: File, projetoId?: string) {
  const key = projetoId
    ? (await clienteFaceApiRepo.obter(projetoId))?.api_key
    : obterConfiguracaoFaceApi().apiKey;
  if (!key) throw new Error("Configure ou crie o client facial antes de validar a imagem.");
  const data = new FormData();
  data.append("image", file);
  const { response, body } = await fetchApi(
    "/v1/experimental/validate-image",
    { method: "POST", body: data },
    key,
  );
  if (!response.ok) throw new Error(erroHttp(response.status));
  if (body.image_usable !== true || body.face_count !== 1)
    throw new Error("A captura precisa conter exatamente um rosto utilizável.");
  return body;
}
export async function cadastrarBiometriaFacial(
  projetoId: string,
  subjectId: string,
  files: File[],
): Promise<FaceEnrollmentResult> {
  if (files.length < 2 || files.length > 5)
    throw new Error("Cadastre de 2 a 5 imagens por funcionário.");
  const cliente = await clienteFaceApiRepo.obter(projetoId);
  if (!cliente) throw new Error("Crie o client facial deste projeto antes do cadastro.");
  await autorizarSubjectFaceApi(projetoId, subjectId);
  const preparadas: File[] = [];
  for (const file of files) {
    const preparado = await prepararImagemFacial(file);
    await verificarCapturaFacial(preparado.file, projetoId);
    preparadas.push(preparado.file);
  }
  const data = new FormData();
  preparadas.forEach((file) => data.append("reference_images", file));
  const { response, body } = await fetchApi(
    `/v1/experimental/subjects/${encodeURIComponent(subjectId)}/enroll`,
    { method: "POST", body: data },
    cliente.api_key,
  );
  if (!response.ok) throw new Error(erroHttp(response.status));
  return {
    subjectId,
    enrolledImages:
      typeof body.enrolled_images === "number" ? body.enrolled_images : preparadas.length,
    apiUrl: obterConfiguracaoFaceApi().apiUrl,
  };
}
function numeroOuNulo(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
export async function verificarFuncionarioPorFace(
  projetoId: string,
  subjectId: string,
  file: File,
): Promise<FaceVerificationResult> {
  const cliente = await clienteFaceApiRepo.obter(projetoId);
  if (!cliente) throw new Error("Crie o client facial deste projeto antes da verificação.");
  const captura = await verificarCapturaFacial(file, projetoId);
  const data = new FormData();
  data.append("probe_image", file);
  const { response, body } = await fetchApi(
    `/v1/experimental/subjects/${encodeURIComponent(subjectId)}/verify`,
    { method: "POST", body: data },
    cliente.api_key,
  );
  if (!response.ok) throw new Error(erroHttp(response.status));
  return {
    subjectId,
    apiUrl: obterConfiguracaoFaceApi().apiUrl,
    httpStatus: response.status,
    captureValid: captura.image_usable === true && captura.face_count === 1,
    verificationReceived:
      typeof body.centroid_cosine_similarity === "number" ||
      typeof body.mean_reference_similarity === "number",
    meanReferenceSimilarity: numeroOuNulo(body.mean_reference_similarity),
    medianReferenceSimilarity: numeroOuNulo(body.median_reference_similarity),
    centroidCosineSimilarity: numeroOuNulo(body.centroid_cosine_similarity),
  };
}
