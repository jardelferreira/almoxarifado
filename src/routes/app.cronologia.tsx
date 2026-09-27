import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  History,
  MoveRight,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/app/cronologia")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Régua Cronológica — Almoxarifado" },
      {
        name: "description",
        content:
          "Régua de datas relativas para montar históricos retroativos ou planejar janelas futuras no treinamento do Almoxarifado.",
      },
    ],
  }),
  component: CronologiaPage,
});

type Direcao = "passado" | "futuro";

type DataRuler = {
  iso: string;
  offset: number;
  short: string;
  long: string;
  relative: string;
  isToday: boolean;
};

function inicioDoDia(data = new Date()) {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate());
}

function adicionarDias(data: Date, quantidade: number) {
  const resultado = new Date(data);
  resultado.setDate(resultado.getDate() + quantidade);
  return resultado;
}

function paraIso(data: Date) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function formatarCurto(data: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  }).format(data);
}

function formatarCompleto(data: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(data);
}

function CronologiaPage() {
  const [direcao, setDirecao] = useState<Direcao>("passado");
  const [janela, setJanela] = useState(45);
  const [selecionado, setSelecionado] = useState(0);

  const hoje = useMemo(() => inicioDoDia(), []);

  const datas = useMemo<DataRuler[]>(() => {
    const valores: DataRuler[] = [];
    const primeiro = direcao === "passado" ? -janela : 0;
    const ultimo = direcao === "passado" ? 0 : janela;

    for (let offset = primeiro; offset <= ultimo; offset += 1) {
      const data = adicionarDias(hoje, offset);
      const absoluto = Math.abs(offset);
      const relative = offset === 0 ? "Hoje" : `${absoluto} ${absoluto === 1 ? "dia" : "dias"} ${offset < 0 ? "atrás" : "à frente"}`;
      valores.push({
        iso: paraIso(data),
        offset,
        short: formatarCurto(data),
        long: formatarCompleto(data),
        relative,
        isToday: offset === 0,
      });
    }

    return valores;
  }, [direcao, hoje, janela]);

  const dataSelecionada = useMemo(
    () => datas.find((item) => item.offset === selecionado) ?? datas[0],
    [datas, selecionado],
  );

  const resumoJanela = direcao === "passado"
    ? `${formatarCurto(adicionarDias(hoje, -janela))} → ${formatarCurto(hoje)}`
    : `${formatarCurto(hoje)} → ${formatarCurto(adicionarDias(hoje, janela))}`;

  const mudarJanela = (valor: number) => {
    const proximo = Math.max(1, Math.min(365, valor));
    setJanela(proximo);
    setSelecionado(0);
  };

  const alternarDirecao = (novaDirecao: Direcao) => {
    setDirecao(novaDirecao);
    setSelecionado(0);
  };

  const resetar = () => {
    setDirecao("passado");
    setJanela(45);
    setSelecionado(0);
  };

  const copiarData = async () => {
    if (!dataSelecionada) return;

    const texto = `${dataSelecionada.relative} — ${dataSelecionada.iso}`;
    try {
      await navigator.clipboard.writeText(dataSelecionada.iso);
      toast.success(`Data copiada: ${texto}`);
    } catch {
      toast.error("Não foi possível copiar a data automaticamente.");
    }
  };

  const moverSelecao = (delta: number) => {
    if (!dataSelecionada) return;
    const proximoIndice = datas.findIndex((item) => item.offset === dataSelecionada.offset) + delta;
    const proximaData = datas[proximoIndice];
    if (proximaData) setSelecionado(proximaData.offset);
  };

  return (
    <main className="min-h-[calc(100vh-2rem)] bg-background px-4 py-5 md:px-6 md:py-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <section className="relative overflow-hidden rounded-2xl border border-sidebar-primary/15 bg-gradient-to-br from-sidebar-primary/[0.09] via-background to-background p-5 shadow-sm md:p-6">
          <div className="absolute inset-y-0 left-0 w-1.5 bg-sidebar-primary" />
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="relative space-y-3 pl-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="gap-1.5 bg-sidebar-primary text-sidebar-primary-foreground">
                  <Clock3 className="size-3.5" />
                  Ferramenta de apoio
                </Badge>
                <Badge variant="outline" className="gap-1.5 bg-background/70">
                  <CalendarDays className="size-3.5" />
                  Data do dispositivo
                </Badge>
              </div>
              <div>
                <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
                  Régua Cronológica
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground md:text-base">
                  Use esta régua para descobrir as datas exatas enquanto acompanha o tutorial.
                  Você pode voltar no tempo para construir um histórico ou avançar para planejar
                  uma janela futura.
                </p>
              </div>
            </div>

            <div className="relative rounded-xl border border-border/80 bg-background/75 p-4 backdrop-blur-sm lg:min-w-[250px]">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Hoje
              </p>
              <p className="mt-1 font-display text-2xl font-bold uppercase">
                {formatarCurto(hoje)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatarCompleto(hoje)}
              </p>
            </div>
          </div>
        </section>

        <Card className="overflow-hidden border-border/80 shadow-sm">
          <CardHeader className="border-b border-sidebar-primary/10 bg-gradient-to-r from-sidebar-primary/[0.045] via-background to-background">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="relative pl-3 before:absolute before:inset-y-0 before:left-0 before:w-1 before:rounded-full before:bg-sidebar-primary">
                <CardTitle className="flex items-center gap-2 font-display text-xl">
                  <History className="size-5 text-sidebar-primary" />
                  Janela de datas
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  A janela é calculada sempre a partir do dia de hoje.
                </p>
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="janela">Dias</Label>
                  <Input
                    id="janela"
                    type="number"
                    min={1}
                    max={365}
                    value={janela}
                    onChange={(event) => mudarJanela(Number(event.target.value) || 1)}
                    className="w-24"
                    aria-label="Quantidade de dias da janela"
                  />
                </div>

                <div className="flex rounded-lg border border-border/80 bg-muted/35 p-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={direcao === "passado" ? "default" : "ghost"}
                    className="gap-1.5"
                    onClick={() => alternarDirecao("passado")}
                  >
                    <History className="size-4" />
                    Dias atrás
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={direcao === "futuro" ? "default" : "ghost"}
                    className="gap-1.5"
                    onClick={() => alternarDirecao("futuro")}
                  >
                    <Sparkles className="size-4" />
                    Dias à frente
                  </Button>
                </div>

                <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={resetar}>
                  <RotateCcw className="size-4" />
                  45 dias
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-5 p-4 md:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/25 px-4 py-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  Janela atual
                </p>
                <p className="mt-1 font-display text-lg font-semibold uppercase">
                  {resumoJanela}
                </p>
              </div>
              <Badge variant="outline" className="bg-background">
                {datas.length} {datas.length === 1 ? "data" : "datas"} na régua
              </Badge>
            </div>

            <div className="rounded-2xl border border-border/80 bg-background p-3 shadow-inner md:p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="font-display text-lg font-semibold">Régua diária</p>
                  <p className="text-xs text-muted-foreground">
                    Clique em qualquer marca para abrir a data exata.
                  </p>
                </div>
                <div className="hidden text-xs text-muted-foreground md:block">
                  {direcao === "passado" ? "Do mais antigo ao dia atual" : "Do dia atual ao mais futuro"}
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-border/70 bg-muted/15 pb-2">
                <div className="flex min-w-max items-end gap-1 px-3 pt-5">
                  {datas.map((item) => {
                    const selecionadoAtual = item.offset === selecionado;
                    const marcoImportante = item.isToday || Math.abs(item.offset) % 5 === 0;

                    return (
                      <button
                        key={item.iso}
                        type="button"
                        onClick={() => setSelecionado(item.offset)}
                        title={`${item.relative} — ${item.iso}`}
                        className={`group relative flex w-14 shrink-0 flex-col items-center justify-end rounded-lg px-1.5 pb-2 pt-2 transition-colors ${
                          selecionadoAtual
                            ? "bg-sidebar-primary/[0.12] text-foreground"
                            : "hover:bg-muted"
                        }`}
                      >
                        <span
                          className={`mb-1 truncate text-[10px] font-medium uppercase tracking-wide ${
                            item.isToday ? "text-sidebar-primary" : "text-muted-foreground"
                          }`}
                        >
                          {item.isToday ? "Hoje" : `D${item.offset > 0 ? "+" : ""}${item.offset}`}
                        </span>
                        <span
                          className={`w-0.5 rounded-full transition-all ${
                            item.isToday
                              ? "h-11 bg-sidebar-primary"
                              : marcoImportante
                                ? "h-8 bg-primary/55"
                                : "h-5 bg-border"
                          } ${selecionadoAtual ? "ring-2 ring-sidebar-primary/20" : ""}`}
                        />
                        <span className={`mt-1 text-[10px] ${selecionadoAtual ? "font-bold" : "text-muted-foreground"}`}>
                          {item.short}
                        </span>
                        <span
                          className={`absolute inset-x-2 bottom-0 h-0.5 rounded-full transition-all ${
                            selecionadoAtual ? "bg-sidebar-primary" : "bg-transparent"
                          }`}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {dataSelecionada && (
              <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-stretch">
                <div className="rounded-2xl border border-sidebar-primary/15 bg-gradient-to-r from-sidebar-primary/[0.07] via-background to-background p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground">
                        Data selecionada
                      </p>
                      <p className="mt-1 font-display text-3xl font-bold uppercase tracking-tight md:text-4xl">
                        {dataSelecionada.iso}
                      </p>
                      <p className="mt-1 capitalize text-sm text-muted-foreground">
                        {dataSelecionada.long}
                      </p>
                      <Badge className="mt-3 bg-sidebar-primary text-sidebar-primary-foreground">
                        {dataSelecionada.relative}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => moverSelecao(-1)}
                        disabled={!datas.some((item) => item.offset === dataSelecionada.offset - 1)}
                      >
                        <ChevronLeft className="size-4" />
                        Anterior
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => moverSelecao(1)}
                        disabled={!datas.some((item) => item.offset === dataSelecionada.offset + 1)}
                      >
                        Próxima
                        <ChevronRight className="size-4" />
                      </Button>
                      <Button type="button" size="sm" className="gap-1.5" onClick={() => void copiarData()}>
                        <Copy className="size-4" />
                        Copiar data
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-border/80 bg-muted/20 p-5 lg:w-[290px]">
                  <p className="text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground">
                    Uso no tutorial
                  </p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Quando o tutorial pedir uma movimentação retroativa, use a data desta régua em
                    vez de inventar uma data fixa.
                  </p>
                  <div className="mt-4 flex items-start gap-2 rounded-lg border border-border/70 bg-background p-3 text-xs leading-5">
                    <MoveRight className="mt-0.5 size-4 shrink-0 text-sidebar-primary" />
                    <span>
                      Exemplo: <strong>D-30</strong> indica a data de 30 dias atrás em relação ao
                      dia em que você está lendo o tutorial.
                    </span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="border-border/80 shadow-sm">
            <CardHeader>
              <CardTitle className="font-display text-lg">Como usar no histórico</CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-6 text-muted-foreground">
              <p>
                Em uma janela de 45 dias, <strong>D-45</strong> é exatamente 45 dias antes de hoje e
                <strong> D0</strong> é hoje. Assim, o mesmo roteiro continua correto mesmo quando
                for lido em outra data.
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/80 shadow-sm">
            <CardHeader>
              <CardTitle className="font-display text-lg">Como usar para o futuro</CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-6 text-muted-foreground">
              <p>
                Troque para <strong>Dias à frente</strong> para obter datas futuras. Isso pode ser
                usado posteriormente em exercícios de planejamento, previsão e simulação.
              </p>
            </CardContent>
          </Card>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Esta tela é uma ferramenta de apoio e não altera o banco de dados nem as datas do projeto.
          A data de referência vem do relógio local do dispositivo.
        </p>
      </div>
    </main>
  );
}
