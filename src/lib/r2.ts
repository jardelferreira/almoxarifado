import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const ALLOWED_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
]);

function sanitizeFileName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_");
}

export const uploadArquivo = createServerFn({
  method: "POST",
})
  .validator((data) => {
    if (!(data instanceof FormData)) {
      throw new Error("Dados inválidos.");
    }

    const file = data.get("file");

    if (!(file instanceof File)) {
      throw new Error("Nenhum arquivo foi enviado.");
    }

    if (file.size === 0) {
      throw new Error("O arquivo está vazio.");
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new Error("O arquivo excede o limite de 10 MB.");
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      throw new Error("Tipo de arquivo não permitido.");
    }

    return {
      file,
    };
  })
  .handler(async ({ data }) => {
    const { file } = data;

    const safeName = sanitizeFileName(file.name);
    const key = `arquivos/${crypto.randomUUID()}-${safeName}`;

    const body = await file.arrayBuffer();

    await env.ALMOXARIFADO_BUCKET.put(key, body, {
      httpMetadata: {
        contentType:
          file.type ||
          "application/octet-stream",
      },
      customMetadata: {
        originalName: file.name,
      },
    });

    return {
      success: true,
      key,
      name: file.name,
      size: file.size,
      type: file.type,
    };
  });