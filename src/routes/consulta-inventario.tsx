import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { ClipboardCheck, Loader2, LockKeyhole, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  consultarDesafioPainelInventario,
  consultarPainelInventario,
  salvarPainelInventario,
} from "@/lib/painel-inventario-r2";
import {
  descriptografarPainelInventario,
  criptografarPainelInventario,
} from "@/services/painel-inventario";
import { hashCpf } from "@/services/painel-funcionarios";
import {
  derivarHashPin,
  formatarCpf,
  normalizarCpf,
  validarCpf,
  validarPin,
} from "@/utils/seguranca";
import type { AtualizacaoPainelInventario, PainelInventarioDados } from "@/types";

export const Route = createFileRoute("/consulta-inventario")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    projeto: typeof search.projeto === "string" ? search.projeto : "",
  }),
  head: () => ({ meta: [{ title: "Painel de inventário — Almoxarifado" }] }),
  component: ConsultaInventarioPage,
});

function ConsultaInventarioPage() {
  const { projeto } = useSearch({ from: "/consulta-inventario" });
  const [cpf, setCpf] = useState("");
  const [pin, setPin] = useState("");
  const [cpfHash, setCpfHash] = useState("");
  const [pinHash, setPinHash] = useState("");
  const [dados, setDados] = useState<PainelInventarioDados[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState<string | null>(null);

  const consultar = async () => {
    const normalizado = normalizarCpf(cpf);
    if (!projeto || !normalizado || !validarCpf(normalizado) || !validarPin(pin)) {
      toast.error("Informe um CPF válido e um PIN de 4 a 8 números.");
      return;
    }
    try {
      setCarregando(true);
      const cpfDigest = await hashCpf(normalizado);
      const desafios = await consultarDesafioPainelInventario({
        data: { projetoId: projeto, cpfHash: cpfDigest },
      });
      const credencial = await derivarHashPin(
        pin,
        desafios[0]?.pin_salt ?? "",
        desafios[0]?.pin_iteracoes ?? 0,
      );
      const carregados = await Promise.all(
        desafios.map(async (desafio) => {
          const resposta = await consultarPainelInventario({
            data: {
              projetoId: projeto,
              inventarioId: desafio.inventario_id,
              cpfHash: cpfDigest,
              credencialHash: credencial,
            },
          });
          const base = await descriptografarPainelInventario(
            projeto,
            desafio.inventario_id,
            cpfDigest,
            credencial,
            resposta,
          );
          const maisRecente = new Map(
            ((resposta.atualizacoes ?? []) as AtualizacaoPainelInventario[]).map((item) => [
              item.item_id,
              item,
            ]),
          );
          return {
            ...base,
            itens: base.itens.map((item) => {
              const atualizacao = maisRecente.get(item.id);
              return atualizacao
                ? {
                    ...item,
                    quantidade_contada: atualizacao.quantidade_contada,
                    observacao: atualizacao.observacao ?? null,
                  }
                : item;
            }),
          };
        }),
      );
      setCpfHash(cpfDigest);
      setPinHash(credencial);
      setDados(carregados.filter((item) => item.inventario.status === "ABERTO"));
      setPin("");
      toast.success(`${carregados.length} inventário(s) aberto(s) localizado(s).`);
    } catch (error) {
      setDados([]);
      toast.error(
        error instanceof Error ? error.message : "Não foi possível consultar os inventários.",
      );
    } finally {
      setCarregando(false);
    }
  };

  const salvar = async (
    inventario: PainelInventarioDados,
    itemId: string,
    valor: string,
    observacao: string,
  ) => {
    if (!projeto || !cpfHash || !pinHash) return;
    const quantidade = Number(valor);
    if (!Number.isFinite(quantidade) || quantidade < 0) {
      toast.error("Informe uma quantidade válida.");
      return;
    }
    const atualizado: PainelInventarioDados = {
      ...inventario,
      itens: inventario.itens.map((item) =>
        item.id === itemId
          ? { ...item, quantidade_contada: quantidade, observacao: observacao.trim() || null }
          : item,
      ),
      atualizado_em: new Date().toISOString(),
    };
    try {
      setSalvando(`${inventario.inventario.id}:${itemId}`);
      const protegido = await criptografarPainelInventario(
        projeto,
        inventario.inventario.id,
        cpfHash,
        pinHash,
        atualizado,
      );
      await salvarPainelInventario({
        data: {
          projetoId: projeto,
          inventarioId: inventario.inventario.id,
          cpfHash,
          credencialHash: pinHash,
          itemId,
          quantidade,
          observacao: observacao.trim() || null,
          ...protegido,
        },
      });
      setDados((atual) =>
        atual.map((item) => (item.inventario.id === inventario.inventario.id ? atualizado : item)),
      );
      toast.success("Conferência registrada.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível salvar a conferência.",
      );
    } finally {
      setSalvando(null);
    }
  };

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-5xl space-y-5">
        <header className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="border-l-4 border-l-amber-500 p-5 sm:p-7">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              <ShieldCheck className="size-4" /> Painel de inventário
            </div>
            <h1 className="mt-2 font-display text-2xl font-bold sm:text-3xl">
              Conferência de estoque
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">
              Informe seu CPF e PIN para acessar os inventários abertos vinculados ao seu nome.
            </p>
          </div>
        </header>
        {!dados.length ? (
          <Card className="border-l-4 border-l-sky-500 shadow-sm">
            <CardHeader className="border-b bg-muted/20">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                  <UserRound className="size-5" />
                </div>
                <div>
                  <h2 className="font-semibold">Identifique-se</h2>
                  <p className="text-sm text-muted-foreground">
                    O PIN é usado apenas para validar seu acesso aos inventários.
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 p-5 sm:grid-cols-2 sm:p-7">
              <label className="space-y-2">
                <span className="text-sm font-medium">CPF</span>
                <Input
                  value={formatarCpf(cpf)}
                  onChange={(e) => setCpf(e.target.value)}
                  placeholder="000.000.000-00"
                  inputMode="numeric"
                  className="h-12 text-lg"
                />
              </label>
              <label className="space-y-2">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <LockKeyhole className="size-4 text-primary" /> PIN
                </span>
                <Input
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                  type="password"
                  inputMode="numeric"
                  placeholder="4 a 8 números"
                  className="h-12 text-lg"
                />
              </label>
              <Button
                className="h-12 sm:col-span-2"
                onClick={() => void consultar()}
                disabled={carregando}
              >
                {carregando ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Consultando…
                  </>
                ) : (
                  <>
                    <ClipboardCheck className="mr-2 size-4" />
                    Acessar inventários
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-semibold">Inventários vinculados</h2>
                <p className="text-sm text-muted-foreground">
                  Registre a contagem física e a observação de cada posição.
                </p>
              </div>
              <Button variant="outline" onClick={() => setDados([])}>
                Trocar funcionário
              </Button>
            </div>
            {dados.map((inventario) => (
              <Card key={inventario.inventario.id} className="border-l-4 border-l-amber-500">
                <CardHeader className="border-b bg-amber-50/40">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-display text-lg font-semibold">
                        {inventario.inventario.escopo}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {inventario.funcionario.nome} · aberto em{" "}
                        {new Date(inventario.inventario.data_abertura).toLocaleString("pt-BR")}
                      </p>
                    </div>
                    <Badge className="bg-amber-100 text-amber-800">Aberto</Badge>
                  </div>
                  {inventario.inventario.observacao ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {inventario.inventario.observacao}
                    </p>
                  ) : null}
                </CardHeader>
                <CardContent className="space-y-3 p-4 sm:p-6">
                  {inventario.itens.map((item) => (
                    <div key={item.id} className="rounded-xl border bg-background p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{item.produto}</p>
                          <p className="text-sm text-muted-foreground">
                            {item.codigo ?? "Sem código"} · {item.equipe ?? "Equipe"} · Sistema:{" "}
                            {item.quantidade_sistema} {item.unidade ?? ""}
                          </p>
                        </div>
                        <Badge variant="outline">
                          {item.quantidade_contada == null ? "Pendente" : "Conferido"}
                        </Badge>
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)_auto]">
                        <Input
                          type="number"
                          min="0"
                          step="any"
                          defaultValue={item.quantidade_contada ?? ""}
                          id={`qtd-${item.id}`}
                          placeholder="Quantidade"
                        />
                        <Textarea
                          defaultValue={item.observacao ?? ""}
                          id={`obs-${item.id}`}
                          placeholder="Observação da conferência"
                          className="min-h-10"
                        />
                        <Button
                          onClick={() =>
                            void salvar(
                              inventario,
                              item.id,
                              (document.getElementById(`qtd-${item.id}`) as HTMLInputElement)
                                ?.value ?? "",
                              (document.getElementById(`obs-${item.id}`) as HTMLTextAreaElement)
                                ?.value ?? "",
                            )
                          }
                          disabled={salvando === `${inventario.inventario.id}:${item.id}`}
                        >
                          {salvando === `${inventario.inventario.id}:${item.id}` ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            "Salvar"
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
