import { useEffect, useState } from "react";
import { CheckCircle2, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  obterConfiguracaoFaceApi,
  salvarConfiguracaoFaceApi,
  testarConexaoFaceApi,
} from "@/lib/face-api-client";

export function FaceApiSettings() {
  const [apiUrl, setApiUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [testando, setTestando] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    const configuracao = obterConfiguracaoFaceApi();
    setApiUrl(configuracao.apiUrl);
    setApiKey(configuracao.apiKey);
  }, []);

  function salvar() {
    try {
      salvarConfiguracaoFaceApi({ apiUrl, apiKey });
      setStatus("Configuração salva somente neste navegador.");
      toast.success("Configuração da API facial salva.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar a configuração.");
    }
  }

  async function testar() {
    setTestando(true);
    setStatus("Consultando /health…");
    try {
      salvarConfiguracaoFaceApi({ apiUrl, apiKey });
      const resposta = await testarConexaoFaceApi();
      setStatus(`API disponível${typeof resposta.service === "string" ? `: ${resposta.service}` : "."}`);
      toast.success("Conexão com a API facial estabelecida.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Não foi possível conectar à API facial.");
      toast.error("Falha ao testar a API facial.");
    } finally {
      setTestando(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
      <div className="flex items-start gap-3">
        {status?.startsWith("API disponível") ? (
          <CheckCircle2 className="mt-0.5 size-5 text-emerald-600" aria-hidden="true" />
        ) : (
          <Wifi className="mt-0.5 size-5 text-primary" aria-hidden="true" />
        )}
        <div>
          <p className="font-medium">Conexão com a Face Verification API</p>
          <p className="text-xs leading-5 text-muted-foreground">
            Esta configuração é local do navegador e não é enviada para o R2 nem para outros dispositivos.
          </p>
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="face-api-url">URL base da API</Label>
          <Input
            id="face-api-url"
            type="url"
            value={apiUrl}
            onChange={(event) => setApiUrl(event.target.value)}
            placeholder="http://127.0.0.1:8767"
            autoComplete="url"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="face-api-key">Chave da API</Label>
          <Input
            id="face-api-key"
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="X-API-Key"
            autoComplete="off"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={salvar} disabled={testando}>
          Salvar neste navegador
        </Button>
        <Button type="button" onClick={() => void testar()} disabled={testando}>
          {testando ? <WifiOff className="mr-2 size-4 animate-pulse" /> : <Wifi className="mr-2 size-4" />}
          {testando ? "Testando…" : "Testar conexão"}
        </Button>
      </div>
      {status && <p className="text-xs leading-5 text-muted-foreground" aria-live="polite">{status}</p>}
    </div>
  );
}
