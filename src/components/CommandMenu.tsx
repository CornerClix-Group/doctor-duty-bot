import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Calendar,
  LayoutDashboard,
  Users,
  ShieldCheck,
  MessageSquare,
  Send,
  Sparkles,
  UserCircle,
} from "lucide-react";

/**
 * Global ⌘K / Ctrl+K command palette.
 * Mounted once at the App root.
 */
export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search EMSchedule… (try 'generate', 'providers', 'broadcast')" />
      <CommandList>
        <CommandEmpty>No matching action.</CommandEmpty>
        <CommandGroup heading="Navigate">
          <CommandItem onSelect={() => go("/")}>
            <LayoutDashboard className="mr-2 h-4 w-4" /> Dashboard
          </CommandItem>
          <CommandItem onSelect={() => go("/schedule")}>
            <Calendar className="mr-2 h-4 w-4" /> Schedules
          </CommandItem>
          <CommandItem onSelect={() => go("/generate")}>
            <Sparkles className="mr-2 h-4 w-4" /> Generate schedule
          </CommandItem>
          <CommandItem onSelect={() => go("/providers")}>
            <Users className="mr-2 h-4 w-4" /> Providers
          </CommandItem>
          <CommandItem onSelect={() => go("/profile")}>
            <UserCircle className="mr-2 h-4 w-4" /> My profile
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Communicate">
          <CommandItem onSelect={() => go("/chat")}>
            <MessageSquare className="mr-2 h-4 w-4" /> Team chat
          </CommandItem>
          <CommandItem onSelect={() => go("/broadcast")}>
            <Send className="mr-2 h-4 w-4" /> Send broadcast
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Admin">
          <CommandItem onSelect={() => go("/admin")}>
            <ShieldCheck className="mr-2 h-4 w-4" /> Admin console
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}