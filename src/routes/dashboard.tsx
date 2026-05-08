import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Kanban, Plus, LogOut, Users } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/dashboard")({ component: Dashboard });

type Board = { id: string; title: string; description: string | null; color: string | null; owner_id: string };

const COLORS = ["board-1", "board-2", "board-3", "board-4", "board-5", "board-6"];

function Dashboard() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [boards, setBoards] = useState<Board[]>([]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(COLORS[0]);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  const load = async () => {
    const { data, error } = await supabase.from("boards").select("*").order("created_at", { ascending: false });
    if (error) return toast.error(error.message);
    setBoards(data ?? []);
  };

  useEffect(() => { if (user) load(); }, [user]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const { error } = await supabase
      .from("boards")
      .insert({ title, description: description || null, color, owner_id: user.id });
    if (error) return toast.error(error.message);
    // Fetch the just-created board (membership trigger has now run, so RLS SELECT passes)
    const { data: created } = await supabase
      .from("boards")
      .select("id")
      .eq("owner_id", user.id)
      .eq("title", title)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setOpen(false); setTitle(""); setDescription(""); setColor(COLORS[0]);
    toast.success("Board created");
    if (created?.id) navigate({ to: "/board/$id", params: { id: created.id } });
    else load();
  };

  if (loading || !user) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "var(--gradient-primary)" }}>
              <Kanban className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold">Kanflow</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">{user.email}</span>
            <Button variant="ghost" size="sm" onClick={() => supabase.auth.signOut().then(() => navigate({ to: "/" }))}>
              <LogOut className="mr-1.5 h-4 w-4" /> Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Your boards</h1>
            <p className="mt-1 text-sm text-muted-foreground">Organize work and collaborate with your team.</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-1.5 h-4 w-4" /> New board</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create a new board</DialogTitle></DialogHeader>
              <form onSubmit={create} className="space-y-4">
                <div><Label>Title</Label><Input required value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} /></div>
                <div><Label>Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} /></div>
                <div>
                  <Label>Color</Label>
                  <div className="mt-2 flex gap-2">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setColor(c)}
                        className={`h-8 w-8 rounded-full ring-offset-2 transition ${color === c ? "ring-2 ring-ring" : ""}`}
                        style={{ backgroundColor: `var(--${c})` }}
                      />
                    ))}
                  </div>
                </div>
                <DialogFooter><Button type="submit">Create</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {boards.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-card/50 p-16 text-center">
            <Kanban className="mx-auto h-10 w-10 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">No boards yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">Create your first board to get started.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {boards.map((b) => (
              <Link
                key={b.id}
                to="/board/$id"
                params={{ id: b.id }}
                className="group relative overflow-hidden rounded-xl border bg-card p-5 shadow-[var(--shadow-card)] transition hover:shadow-[var(--shadow-elevated)]"
              >
                <div className="absolute inset-x-0 top-0 h-1.5" style={{ backgroundColor: `var(--${b.color || "board-1"})` }} />
                <h3 className="mt-2 font-semibold group-hover:text-primary">{b.title}</h3>
                {b.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{b.description}</p>}
                <div className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Users className="h-3.5 w-3.5" /> {b.owner_id === user.id ? "Owner" : "Member"}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
