import { useEffect, useState } from "react";
import { CheckCircle2, Copy, KeyRound, ShieldCheck, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { clienteFaceApiRepo } from "@/services/cliente-face-api-repo";
import { getDB } from "@/db/db";
import {
  FACE_API_SCOPES,
  obterClienteFaceApi,
  obterConfiguracaoFaceApi,
  salvarConfiguracaoFaceApi,
  testarConexaoFaceApi,
  criarClienteFaceApi,
  atualizarEscoposClienteFaceApi,
  rotacionarClienteFaceApi,
  revogarClienteFaceApi,
} from "@/lib/face-api-client";
import type { ClienteFaceApi } from "@/types";

const labels: Record<string, string> = {
  "capture:validate": "Validar imagem",
  "face:compare": "Comparar rosto",
  "template:read": "Ler biometria",
  "template:verify": "Verificar biometria",
  "template:enroll": "Cadastrar biometria",
  "template:delete": "Excluir biometria",
};

export function FaceApiSettings({ projetoId }: { projetoId: string }) {
  const [apiUrl, setApiUrl] = useState("");
  const [adminKey, setAdminKey] = useState("");
  const [displayName, setDisplayName] = useState("PWA Almoxarifado");
  const [scopes, setScopes] = useState<string[]>([...FACE_API_SCOPES]);
  const [cliente, setCliente] = useState<ClienteFaceApi | undefined>();
  const [testando, setTestando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [novaChave, setNovaChave] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  useEffect(() => {
    const cfg = obterConfiguracaoFaceApi();
    setApiUrl(cfg.apiUrl);
    setAdminKey(cfg.adminKey);
    if (projetoId) void obterClienteFaceApi(projetoId).then(setCliente);
  }, [projetoId]);
  const salvarBase = () =>
    salvarConfiguracaoFaceApi({ apiUrl, apiKey: cliente?.api_key ?? "", adminKey });
  async function testar() {
    setTestando(true);
    try {
      salvarBase();
      const result = await testarConexaoFaceApi();
      setStatus(
        `API disponível${typeof result.service === "string" ? `: ${result.service}` : "."}`,
      );
      toast.success("Conexão com a API facial estabelecida.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao conectar.");
      toast.error("Falha ao testar a API facial.");
    } finally {
      setTestando(false);
    }
  }
  async function criar() {
    if (!projetoId) return;
    setSalvando(true);
    try {
      salvarBase();
      const funcionarios = await getDB()
        .funcionarios.where("projeto_id")
        .equals(projetoId)
        .toArray();
      const result = await criarClienteFaceApi(
        projetoId,
        displayName,
        scopes,
        funcionarios.map((f) => f.id),
      );
      const salvo = await clienteFaceApiRepo.obter(projetoId);
      setCliente(salvo);
      setNovaChave(result.api_key);
      toast.success(`${funcionarios.length} funcionário(s) autorizado(s) no novo client.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível criar o client.");
    } finally {
      setSalvando(false);
    }
  }
  async function atualizarEscopos() {
    if (!projetoId) return;
    setSalvando(true);
    try {
      salvarBase();
      const salvo = await atualizarEscoposClienteFaceApi(projetoId, scopes);
      setCliente(salvo);
      toast.success("Escopos atualizados.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível atualizar os escopos.",
      );
    } finally {
      setSalvando(false);
    }
  }
  async function rotacionar() {
    if (!projetoId || !window.confirm("Rotacionar a chave? A chave atual deixará de funcionar."))
      return;
    setSalvando(true);
    try {
      const key = await rotacionarClienteFaceApi(projetoId);
      setCliente(await clienteFaceApiRepo.obter(projetoId));
      setNovaChave(key);
      toast.success("Chave rotacionada. Guarde a nova chave exibida.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível rotacionar a chave.");
    } finally {
      setSalvando(false);
    }
  }
  async function revogar() {
    if (
      !projetoId ||
      !window.confirm(
        "Revogar este client? As operações faciais deste projeto deixarão de funcionar.",
      )
    )
      return;
    setSalvando(true);
    try {
      await revogarClienteFaceApi(projetoId);
      setCliente(undefined);
      setNovaChave(null);
      toast.success("Client revogado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível revogar o client.");
    } finally {
      setSalvando(false);
    }
  }
  function copiar() {
    if (novaChave) {
      void navigator.clipboard.writeText(novaChave);
      toast.success("API-key copiada.");
    }
  }
  return (
    <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 size-5 text-primary" />
        <div>
          <p className="font-medium">Client facial deste projeto</p>
          <p className="text-xs leading-5 text-muted-foreground">
            Existe apenas um client por projeto. A X-Admin-Key administra o client; a API-key
            armazenada localmente executa as operações faciais.
          </p>
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="face-api-url">URL base da API</Label>
          <Input
            id="face-api-url"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            placeholder="http://127.0.0.1:8767"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="face-admin-key">X-Admin-Key</Label>
          <Input
            id="face-admin-key"
            type="password"
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            placeholder="Chave administrativa"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            salvarBase();
            toast.success("Configuração salva neste navegador.");
          }}
          disabled={salvando}
        >
          Salvar configuração
        </Button>
        <Button type="button" onClick={() => void testar()} disabled={testando}>
          {testando ? (
            <WifiOff className="mr-2 size-4 animate-pulse" />
          ) : (
            <Wifi className="mr-2 size-4" />
          )}
          {testando ? "Testando…" : "Testar conexão"}
        </Button>
      </div>
      {cliente ? (
        <div className="space-y-4 rounded-md border border-emerald-300/70 bg-emerald-50/50 p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-emerald-600" />
            <strong>Client ativo: {cliente.display_name}</strong>
          </div>
          <p className="text-xs text-muted-foreground">
            Client ID: <code>{cliente.client_id}</code>. Funcionários novos são autorizados
            automaticamente.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {FACE_API_SCOPES.map((scope) => (
              <label key={scope} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={scopes.includes(scope)}
                  onCheckedChange={(checked) =>
                    setScopes((current) =>
                      checked
                        ? [...new Set([...current, scope])]
                        : current.filter((item) => item !== scope),
                    )
                  }
                />
                {labels[scope]}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void atualizarEscopos()} disabled={salvando}>
              Atualizar escopos
            </Button>
            <Button variant="outline" onClick={() => void rotacionar()} disabled={salvando}>
              <KeyRound className="mr-2 size-4" />
              Rotacionar chave
            </Button>
            <Button variant="destructive" onClick={() => void revogar()} disabled={salvando}>
              Revogar client
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 rounded-md border border-amber-300/70 bg-amber-50/60 p-4">
          <div>
            <Label htmlFor="face-client-name">Nome do client</Label>
            <Input
              id="face-client-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="PWA Almoxarifado"
            />
          </div>
          <p className="text-sm text-amber-950 dark:text-amber-100">
            Ao criar, todos os funcionários atuais serão autorizados na API. Os seis escopos ficam
            marcados por padrão.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {FACE_API_SCOPES.map((scope) => (
              <label key={scope} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={scopes.includes(scope)}
                  onCheckedChange={(checked) =>
                    setScopes((current) =>
                      checked
                        ? [...new Set([...current, scope])]
                        : current.filter((item) => item !== scope),
                    )
                  }
                />
                {labels[scope]}
              </label>
            ))}
          </div>
          <Button onClick={() => void criar()} disabled={salvando || !adminKey.trim()}>
            Criar client e autorizar funcionários
          </Button>
        </div>
      )}
      {novaChave && (
        <div className="rounded-md border border-sky-300 bg-sky-50 p-3 text-sm">
          <strong>Guarde esta API-key — ela só é exibida uma vez.</strong>
          <div className="mt-2 flex gap-2">
            <Input readOnly value={novaChave} />
            <Button variant="outline" size="icon" onClick={copiar} aria-label="Copiar API-key">
              <Copy className="size-4" />
            </Button>
          </div>
        </div>
      )}
      {status && (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {status}
        </p>
      )}
    </div>
  );
}
