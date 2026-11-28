const STORAGE_KEY = "almoxarifado.face-api.config.v1";
const DEFAULT_API_URL = "http://127.0.0.1:8767";
const MAX_IMAGE_EDGE = 1920;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export type FaceApiConfig = {
  apiUrl: string;
  apiKey: string;
  clientId: string;
  adminKey: string;
  authorizedSubjectIds: string[];
};

export type FaceEnrollmentResult = {
  subjectId: string;
  enrolledImages: number;
  apiUrl: string;
};

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

function normalizarUrl(valor: string): string {
  const url = valor.trim().replace(/\/+$/, "");
  if (!url) throw new Error("Informe a URL base da API facial.");

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("A URL da API facial não é válida.");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("A URL da API facial deve começar com http:// ou https://.");
  }

  return url;
}

export function obterConfiguracaoFaceApi(): FaceApiConfig {
  if (typeof window === "undefined") {
    return {
      apiUrl: DEFAULT_API_URL,
      apiKey: "",
      clientId: "",
      adminKey: "",
      authorizedSubjectIds: [],
    };
  }

  try {
    const valor = window.localStorage.getItem(STORAGE_KEY);
    if (!valor)
      return {
        apiUrl: DEFAULT_API_URL,
        apiKey: "",
        clientId: "",
        adminKey: "",
        authorizedSubjectIds: [],
      };
    const salvo = JSON.parse(valor) as Partial<FaceApiConfig>;
    return {
      apiUrl: normalizarUrl(String(salvo.apiUrl ?? DEFAULT_API_URL)),
      apiKey: String(salvo.apiKey ?? ""),
      clientId: String(salvo.clientId ?? "").trim(),
      adminKey: String(salvo.adminKey ?? "").trim(),
      authorizedSubjectIds: normalizarSubjects(salvo.authorizedSubjectIds),
    };
  } catch {
    return {
      apiUrl: DEFAULT_API_URL,
      apiKey: "",
      clientId: "",
      adminKey: "",
      authorizedSubjectIds: [],
    };
  }
}

function normalizarSubjects(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return [...new Set(valor.map((item) => String(item).trim()).filter(Boolean))];
}

export function salvarConfiguracaoFaceApi(configuracao: FaceApiConfig): FaceApiConfig {
  const normalizada = {
    apiUrl: normalizarUrl(configuracao.apiUrl),
    apiKey: configuracao.apiKey.trim(),
    clientId: configuracao.clientId.trim(),
    adminKey: configuracao.adminKey.trim(),
    authorizedSubjectIds: normalizarSubjects(configuracao.authorizedSubjectIds),
  };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizada));
  }
  return normalizada;
}

function headers(apiKey: string): HeadersInit {
  return apiKey ? { "X-API-Key": apiKey } : {};
}

function mensagemAdministrativa(status: number): string {
  if (status === 401) return "A X-Admin-Key é inválida ou não foi informada.";
  if (status === 403) return "A X-Admin-Key não pode administrar este cliente.";
  if (status === 404) return "O client_id não foi encontrado na API facial.";
  if (status === 422) return "A lista de subject_id enviada para autorização é inválida.";
  return `A API facial respondeu com HTTP ${status} durante a autorização.`;
}

export async function autorizarSubjectFaceApi(subjectId: string): Promise<void> {
  const id = subjectId.trim();
  if (!id) throw new Error("O funcionário não possui um subject_id válido.");
  const configuracao = obterConfiguracaoFaceApi();
  if (!configuracao.clientId || !configuracao.adminKey) {
    throw new Error("Configure o client_id e a X-Admin-Key para autorizar este funcionário.");
  }

  const subjectIds = normalizarSubjects([...configuracao.authorizedSubjectIds, id]);
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(
      `${configuracao.apiUrl}/v1/experimental/clients/${encodeURIComponent(configuracao.clientId)}/subjects`,
      {
        method: "PUT",
        headers: {
          "X-Admin-Key": configuracao.adminKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ subject_ids: subjectIds }),
        cache: "no-store",
        signal: controller.signal,
      },
    );
    if (!response.ok) throw new Error(mensagemAdministrativa(response.status));
    salvarConfiguracaoFaceApi({ ...configuracao, authorizedSubjectIds: subjectIds });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("A API facial não respondeu durante a autorização do funcionário.");
    }
    if (error instanceof Error && error.message.startsWith("A API facial")) throw error;
    throw new Error("Não foi possível autorizar o funcionário. Verifique a URL, a rede e o CORS.");
  } finally {
    window.clearTimeout(timer);
  }
}

async function jsonResponse(response: Response): Promise<Record<string, unknown>> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return {};
  const body = await response.json();
  return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
}

async function requestJson(
  path: string,
  options: RequestInit = {},
  prazoMs = 12_000,
): Promise<{ response: Response; body: Record<string, unknown> }> {
  const configuracao = obterConfiguracaoFaceApi();
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), prazoMs);

  try {
    const response = await fetch(`${configuracao.apiUrl}${path}`, {
      ...options,
      headers: { ...headers(configuracao.apiKey), ...(options.headers ?? {}) },
      cache: "no-store",
      signal: controller.signal,
    });
    return { response, body: await jsonResponse(response) };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("A API facial não respondeu dentro do prazo configurado.");
    }
    throw new Error(
      "Não foi possível conectar à API facial. Verifique a URL, a rede e a configuração de CORS.",
    );
  } finally {
    window.clearTimeout(timer);
  }
}

function mensagemHttp(status: number): string {
  if (status === 401) {
    return "A chave da API facial é inválida ou não foi informada.";
  }
  if (status === 403) {
    return "A API facial recusou o acesso. Confira o escopo necessário e autorize o subject_id deste funcionário para o client_id.";
  }
  if (status === 404) return "O cadastro facial do funcionário não foi encontrado.";
  if (status === 413) return "A imagem excede o limite permitido pela API facial.";
  if (status === 422)
    return "A captura não pôde ser processada. Use uma imagem com apenas um rosto visível.";
  if (status === 503) return "A API facial está temporariamente indisponível.";
  return `A API facial respondeu com HTTP ${status}.`;
}

function numeroOuNulo(valor: unknown): number | null {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : null;
}

export async function testarConexaoFaceApi(): Promise<Record<string, unknown>> {
  const { response, body } = await requestJson("/health", {}, 5_000);
  if (!response.ok) throw new Error(mensagemHttp(response.status));
  return body;
}

async function abrirImagem(
  file: File,
): Promise<{ image: HTMLImageElement; width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    if (typeof image.decode === "function") await image.decode();
    else {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("O navegador não conseguiu abrir a imagem."));
      });
    }
    return { image, width: image.naturalWidth, height: image.naturalHeight };
  } catch {
    throw new Error("Não foi possível abrir a imagem. Tente uma foto JPEG ou PNG menor.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("O navegador não conseguiu preparar a imagem.")),
      "image/jpeg",
      quality,
    );
  });
}

export async function prepararImagemFacial(file: File | undefined): Promise<FaceImagePreparation> {
  if (!file) throw new Error("Capture uma imagem antes de continuar.");
  if (!file.type.startsWith("image/")) throw new Error("Selecione uma imagem JPEG ou PNG.");

  const { image, width, height } = await abrirImagem(file);
  const escala = Math.min(1, MAX_IMAGE_EDGE / Math.max(width, height));
  const precisaReduzir = escala < 1;
  const precisaComprimir = file.size > MAX_IMAGE_BYTES;
  const precisaConverter = !["image/jpeg", "image/png"].includes(file.type);

  if (!precisaReduzir && !precisaComprimir && !precisaConverter) {
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
  }

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
  if (blob.size > MAX_IMAGE_BYTES) {
    throw new Error("A imagem ainda excede 10 MiB após a redução. Escolha uma foto menor.");
  }

  const nome = file.name.replace(/\.[^.]+$/, "") || "captura";
  const preparado = new File([blob], `${nome}.jpg`, {
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

export async function verificarCapturaFacial(file: File): Promise<Record<string, unknown>> {
  const data = new FormData();
  data.append("image", file);
  const { response, body } = await requestJson("/v1/experimental/validate-image", {
    method: "POST",
    body: data,
  });
  if (!response.ok) throw new Error(mensagemHttp(response.status));
  if (body.image_usable !== true || body.face_count !== 1) {
    throw new Error("A captura precisa conter exatamente um rosto utilizável.");
  }
  return body;
}

/**
 * Cadastra as referências faciais de um funcionário.
 *
 * O cadastro usa a URL e a chave de cliente configuradas no próprio PWA,
 * exatamente como a validação da captura e a verificação facial. A chave
 * administrativa da API nunca participa deste fluxo.
 */
export async function cadastrarBiometriaFacial(
  subjectId: string,
  files: File[],
): Promise<FaceEnrollmentResult> {
  if (!subjectId.trim()) throw new Error("O funcionário não possui um identificador válido.");
  if (files.length < 2) throw new Error("Cadastre pelo menos 2 imagens do funcionário.");
  if (files.length > 5) throw new Error("Cadastre no máximo 5 imagens por funcionário.");

  const preparadas: File[] = [];
  for (const file of files) {
    preparadas.push((await prepararImagemFacial(file)).file);
  }

  const data = new FormData();
  data.append("subject_id", subjectId);
  preparadas.forEach((file) => data.append("reference_images", file));
  const configuracao = obterConfiguracaoFaceApi();
  if (configuracao.clientId && configuracao.adminKey) await autorizarSubjectFaceApi(subjectId);
  const { response, body } = await requestJson(
    `/v1/experimental/subjects/${encodeURIComponent(subjectId)}/enroll`,
    { method: "POST", body: data },
  );
  if (!response.ok) throw new Error(mensagemHttp(response.status));

  return {
    subjectId,
    enrolledImages:
      typeof body.enrolled_images === "number" ? body.enrolled_images : preparadas.length,
    apiUrl: configuracao.apiUrl,
  };
}

export async function verificarFuncionarioPorFace(
  subjectId: string,
  file: File,
): Promise<FaceVerificationResult> {
  const captura = await verificarCapturaFacial(file);
  const data = new FormData();
  data.append("probe_image", file);
  const configuracao = obterConfiguracaoFaceApi();
  const { response, body } = await requestJson(
    `/v1/experimental/subjects/${encodeURIComponent(subjectId)}/verify`,
    { method: "POST", body: data },
  );
  if (!response.ok) throw new Error(mensagemHttp(response.status));

  return {
    subjectId,
    apiUrl: configuracao.apiUrl,
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
