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
  const atual = opcoes.find((o) => o.value === value);

  return (
    <Popover open={disabled ? false : open} onOpenChange={setOpen}>
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
          className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] p-0"
          align="start"
          side="bottom"
        >
          <Command>
          <CommandInput placeholder="Pesquisar…" />
          <CommandList>
            <CommandEmpty>{vazio}</CommandEmpty>
            <CommandGroup>
              {allowClear && (
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
              )}
              {opcoes.map((o) => (
                <CommandItem
                  key={o.value}
                  value={`${o.label} ${o.hint ?? ""}`}
                  className="items-start py-2"
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
                  <span className="min-w-0 flex-1">
                    <span className="block whitespace-normal break-words font-medium leading-5" title={o.label}>{o.label}</span>
                    {o.hint && (
                      <span className="mt-0.5 block whitespace-normal break-words text-xs leading-4 text-muted-foreground" title={o.hint}>
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
