import { createFileRoute, redirect } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Kanban, Users, Zap, MoveRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "var(--gradient-primary)" }}>
              <Kanban className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold">Kanflow</span>
          </div>
          <Button asChild variant="ghost"><Link to="/auth">Sign in</Link></Button>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-24 text-center">
        <div
          className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-1.5 text-xs font-medium text-muted-foreground"
        >
          <Zap className="h-3.5 w-3.5" /> Realtime collaboration
        </div>
        <h1 className="bg-clip-text text-5xl font-bold tracking-tight text-transparent sm:text-6xl" style={{ backgroundImage: "var(--gradient-hero)" }}>
          Kanban boards your team will love
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          “Work in your own flow — move tasks, share ideas, and see everything fall into place.”
        </p>
        <div className="mt-10 flex justify-center gap-3">
          <Button asChild size="lg">
            <Link to="/auth">Get started <MoveRight className="ml-2 h-4 w-4" /></Link>
          </Button>
        </div>

        <div className="mt-20 grid gap-6 sm:grid-cols-3">
          {[
            { icon: Kanban, title: "Drag & drop", text: "Move cards between Todo, In Progress, and Done with smooth drag-and-drop." },
            { icon: Users, title: "Team boards", text: "Invite members and assign tasks. Everyone sees the same board." },
            { icon: Zap, title: "Realtime", text: "Edits and moves sync instantly across all collaborators." },
          ].map((f) => (
            <div key={f.title} className="rounded-xl border bg-card p-6 text-left shadow-[var(--shadow-card)]">
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
