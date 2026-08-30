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
}: {
  opcoes: Opcao[];
  value: string | null;
  onChange: (v: string | null) => void;
  placeholder?: string;
  vazio?: string;
}) {
  const [open, setOpen] = useState(false);
  const atual = opcoes.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !atual && "text-muted-foreground")}>
            {atual ? atual.label : placeholder}
          </span>
          <ChevronsUpDown className="size-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Pesquisar…" />
          <CommandList>
            <CommandEmpty>{vazio}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__todos__"
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <Check className={cn("size-4", value ? "opacity-0" : "opacity-100")} />
                {placeholder}
              </CommandItem>
              {opcoes.map((o) => (
                <CommandItem
                  key={o.value}
                  value={`${o.label} ${o.hint ?? ""}`}
                  onSelect={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "size-4",
                      value === o.value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate">{o.label}</span>
                  {o.hint && (
                    <span className="ml-auto text-xs text-muted-foreground">{o.hint}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
