import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface Opcao {
  value: string;
  label: string;
  hint?: string | undefined;
}

export function Combobox({
  opcoes,
  value,
  onChange,
  placeholder = "Selecionar…",
  vazio = "Nada encontrado",
  disabled = false,
  allowClear = true,
  className,
}: {
  opcoes: Opcao[];
  value: string | null;
  onChange: (v: string | null) => void;
  placeholder?: string;
  vazio?: string;
  disabled?: boolean;
  allowClear?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const atual = opcoes.find((o) => o.value === value);
  const termosBusca = normalizarBusca(busca).split(" ").filter(Boolean);
  const opcoesFiltradas = opcoes.filter((opcao) => {
    if (termosBusca.length === 0) return true;
    const textoPesquisavel = normalizarBusca(`${opcao.label} ${opcao.hint ?? ""}`);
    return termosBusca.every((termo) => textoPesquisavel.includes(termo));
  });

  const fechar = () => {
    setOpen(false);
    setBusca("");
  };

  return (
    <Popover
      open={disabled ? false : open}
      onOpenChange={(proximo) => {
        setOpen(proximo);
        if (!proximo) setBusca("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className={cn("w-full justify-between font-normal", className)}
          disabled={disabled}
        >
          <span className={cn("truncate", !atual && "text-muted-foreground")}>
            {atual ? atual.label : placeholder}
          </span>
          <ChevronsUpDown className="size-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      {!disabled && (
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] overflow-hidden p-0"
          align="start"
          side="bottom"
        >
          <Command shouldFilter={false}>
            <CommandInput placeholder="Pesquisar…" value={busca} onValueChange={setBusca} />
            <CommandList className="max-h-[min(22rem,calc(100vh-10rem))]">
              {opcoesFiltradas.length === 0 && <CommandEmpty>{vazio}</CommandEmpty>}
              <CommandGroup>
                {allowClear && !busca.trim() && (
                  <CommandItem
                    value="__todos__"
                    onSelect={() => {
                      onChange(null);
                      fechar();
                    }}
                  >
                    <Check className={cn("size-4", value ? "opacity-0" : "opacity-100")} />
                    {placeholder}
                  </CommandItem>
                )}
                {opcoesFiltradas.map((o) => (
                  <CommandItem
                    key={o.value}
                    value={`${o.label} ${o.hint ?? ""}`}
                    className="min-w-0 items-start py-2"
                    onSelect={() => {
                      onChange(o.value);
                      fechar();
                    }}
                  >
                    <Check
                      className={cn("size-4", value === o.value ? "opacity-100" : "opacity-0")}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className="block whitespace-normal break-words font-medium leading-5"
                        title={o.label}
                      >
                        {o.label}
                      </span>
                      {o.hint && (
                        <span
                          className="mt-0.5 block whitespace-normal break-words text-xs leading-4 text-muted-foreground"
                          title={o.hint}
                        >
                          {o.hint}
                        </span>
                      )}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      )}
    </Popover>
  );
}

function normalizarBusca(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim()
    .replace(/\s+/g, " ");
}
