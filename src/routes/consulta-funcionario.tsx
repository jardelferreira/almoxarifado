import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import {
  AlertTriangle,
  ClipboardList,
  Loader2,
  LockKeyhole,
  PackageCheck,
  Search,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  consultarDesafioPainelFuncionario,
  consultarPainelFuncionario,
} from "@/lib/painel-funcionarios-r2";
import {
  descriptografarPainelFuncionario,
  hashCpf,
  hashCpfParaCredencial,
} from "@/services/painel-funcionarios";
import { derivarHashPin, formatarCpf, normalizarCpf, validarCpf } from "@/utils/seguranca";
import type { PainelFuncionarioDados } from "@/types";

export const Route = createFileRoute("/consulta-funcionario")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    projeto: typeof search["projeto"] === "string" ? search["projeto"] : "",
  }),
  head: () => ({ meta: [{ title: "Consulta do funcionário — Almoxarifado" }] }),
  component: ConsultaFuncionarioPage,
});

type ModoConsulta = "EQUIPAMENTOS" | "MATERIAIS";

function ConsultaFuncionarioPage() {
  const { projeto } = useSearch({ from: "/consulta-funcionario" });
  const [cpf, setCpf] = useState("");
  const [pin, setPin] = useState("");
  const [dados, setDados] = useState<PainelFuncionarioDados | null>(null);
  const [modo, setModo] = useState<ModoConsulta>("EQUIPAMENTOS");
  const [carregando, setCarregando] = useState(false);

  const consultar = async () => {
    const cpfNormalizado = normalizarCpf(cpf);
    if (!projeto) {
      toast.error("Este link não identifica um projeto válido.");
      return;
    }
    if (!cpfNormalizado || !validarCpf(cpfNormalizado)) {
      toast.error("Informe um CPF válido.");
      return;
    }
    try {
      setCarregando(true);
      const cpfHash = await hashCpf(cpfNormalizado);
      const desafio = await consultarDesafioPainelFuncionario({
        data: { projetoId: projeto, cpfHash },
      });
      if (desafio.pinObrigatorio && !pin) {
        toast.error("Este cadastro exige o PIN de segurança.");
        return;
      }
      const credencialHash = desafio.pinObrigatorio
        ? await derivarHashPin(pin, desafio.pinSalt ?? "", desafio.pinIteracoes ?? 0)
        : hashCpfParaCredencial(cpfHash);
      const resposta = await consultarPainelFuncionario({
        data: { projetoId: projeto, cpfHash, credencialHash },
      });
      const protegido = await descriptografarPainelFuncionario(
        projeto,
        cpfHash,
        credencialHash,
        resposta,
      );
      setDados(protegido);
      setPin("");
      toast.success("Ficha carregada com segurança.");
    } catch (error) {
      setDados(null);
      toast.error(error instanceof Error ? error.message : "Não foi possível consultar a ficha.");
    } finally {
      setCarregando(false);
    }
  };

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-4xl space-y-5">
        <header className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="border-l-4 border-l-primary p-5 sm:p-7">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              <ShieldCheck className="size-4" /> Consulta segura
            </div>
            <h1 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
              Minha ficha de almoxarifado
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              Consulte os equipamentos em seu nome e o histórico de materiais movimentados para
              você.
            </p>
          </div>
        </header>

        {!dados ? (
          <Card className="border-l-4 border-l-sky-500 shadow-sm">
            <CardHeader className="border-b bg-muted/20">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                  <UserRound className="size-5" />
                </div>
                <div>
                  <h2 className="font-semibold">Identifique-se</h2>
                  <p className="text-sm text-muted-foreground">
                    Informe seu CPF. O PIN só será solicitado se estiver cadastrado.
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 p-5 sm:p-7">
              <label className="block space-y-2">
                <span className="text-sm font-medium">CPF</span>
                <Input
                  value={formatarCpf(cpf)}
                  onChange={(event) => setCpf(event.target.value)}
                  placeholder="000.000.000-00"
                  inputMode="numeric"
                  autoComplete="off"
                  className="h-12 text-lg"
                />
              </label>
              <label className="block space-y-2">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <LockKeyhole className="size-4 text-primary" /> PIN de segurança{" "}
                  <span className="font-normal text-muted-foreground">(se solicitado)</span>
                </span>
                <Input
                  value={pin}
                  onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 8))}
                  placeholder="Digite somente se possuir PIN"
                  inputMode="numeric"
                  type="password"
                  autoComplete="one-time-code"
                  className="h-12 text-lg"
                />
              </label>
              <Button
                className="h-12 w-full text-base"
                onClick={() => void consultar()}
                disabled={carregando}
              >
                {carregando ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <Search className="size-5" />
                )}{" "}
                Consultar minha ficha
              </Button>
              <p className="text-center text-xs leading-5 text-muted-foreground">
                Seus dados são consultados somente para este projeto e não ficam armazenados neste
                dispositivo.
              </p>
            </CardContent>
          </Card>
        ) : (
          <FichaResultado
            dados={dados}
            modo={modo}
            setModo={setModo}
            onNovaConsulta={() => setDados(null)}
          />
        )}
      </div>
    </main>
  );
}

function FichaResultado({
  dados,
  modo,
  setModo,
  onNovaConsulta,
}: {
  dados: PainelFuncionarioDados;
  modo: ModoConsulta;
  setModo: (modo: ModoConsulta) => void;
  onNovaConsulta: () => void;
}) {
  return (
    <div className="space-y-5">
      <Card className="border-l-4 border-l-emerald-500 shadow-sm">
        <CardContent className="grid gap-4 p-5 sm:grid-cols-3 sm:p-6">
          <div className="sm:col-span-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Funcionário</p>
            <p className="text-xl font-bold sm:text-2xl">{dados.funcionario.nome}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {[
                dados.funcionario.matricula && `Matrícula: ${dados.funcionario.matricula}`,
                dados.funcionario.funcao,
                dados.funcionario.equipe,
              ]
                .filter(Boolean)
                .join(" · ") || "Dados cadastrais"}
            </p>
          </div>
          <div className="flex items-end justify-start sm:justify-end">
            <Button variant="outline" onClick={onNovaConsulta}>
              Nova consulta
            </Button>
          </div>
        </CardContent>
      </Card>
      {painelDesatualizado(dados.atualizado_em) && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <p>
            <strong>Informação possivelmente desatualizada.</strong> Esta é a última ficha publicada
            pelo almoxarifado. A consulta continua disponível até uma nova atualização.
          </p>
        </div>
      )}
      <Tabs value={modo} onValueChange={(value) => setModo(value as ModoConsulta)}>
        <TabsList className="grid h-auto w-full grid-cols-2 rounded-xl border bg-card p-1">
          <TabsTrigger
            value="EQUIPAMENTOS"
            className="gap-2 py-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            <PackageCheck className="size-4" /> Equipamentos
          </TabsTrigger>
          <TabsTrigger
            value="MATERIAIS"
            className="gap-2 py-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            <ClipboardList className="size-4" /> Materiais
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {modo === "EQUIPAMENTOS" ? (
        <Card>
          <CardHeader>
            <h2 className="font-semibold">Equipamentos em seu nome</h2>
          </CardHeader>
          <CardContent className="space-y-3">
            {dados.equipamentos.length ? (
              dados.equipamentos.map((item) => (
                <div
                  key={`${item.nome}-${item.identificacao}`}
                  className="rounded-xl border border-l-4 border-l-emerald-500 p-4"
                >
                  <div className="flex flex-col justify-between gap-2 sm:flex-row">
                    <div>
                      <p className="font-semibold">{item.nome}</p>
                      <p className="text-sm text-muted-foreground">
                        {[item.marca, item.modelo].filter(Boolean).join(" · ") ||
                          "Sem marca ou modelo"}
                      </p>
                      <p className="mt-2 text-sm">{item.identificacao}</p>
                    </div>
                    <Badge variant="outline">Quantidade: {item.quantidade}</Badge>
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                Nenhum equipamento está apropriado em seu nome.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <h2 className="font-semibold">Histórico de materiais</h2>
          </CardHeader>
          <CardContent className="space-y-3">
            {dados.materiais.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-sm">
                  <thead className="bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-3">Data</th>
                      <th className="px-3 py-3">Material</th>
                      <th className="px-3 py-3">Movimentação</th>
                      <th className="px-3 py-3 text-right">Quantidade</th>
                      <th className="px-3 py-3">Local</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {dados.materiais.map((item) => (
                      <tr key={item.id}>
                        <td className="px-3 py-3 whitespace-nowrap">{item.data}</td>
                        <td className="px-3 py-3">
                          <p className="font-medium">{item.produto}</p>
                          <p className="text-xs text-muted-foreground">
                            {[item.codigo, item.unidade].filter(Boolean).join(" · ")}
                          </p>
                        </td>
                        <td className="px-3 py-3">
                          <Badge variant={item.tipo === "DEVOLUCAO" ? "outline" : "secondary"}>
                            {item.tipo === "DEVOLUCAO"
                              ? "Devolução"
                              : item.tipo === "SAIDA"
                                ? "Saída"
                                : "Movimentação"}
                          </Badge>
                        </td>
                        <td className="px-3 py-3 text-right font-semibold">{item.quantidade}</td>
                        <td className="px-3 py-3 text-muted-foreground">
                          {item.local ?? item.equipe ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                Nenhuma movimentação de material vinculada ao seu CPF.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function painelDesatualizado(atualizadoEm: string): boolean {
  const data = Date.parse(atualizadoEm);
  return Number.isFinite(data) && Date.now() - data > 24 * 60 * 60 * 1000;
}
