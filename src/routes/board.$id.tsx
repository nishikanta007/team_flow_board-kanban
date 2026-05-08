import DayNightLoader from "@/components/ui/dayNightLoader";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Plus, Trash2, Kanban, ArrowLeft, UserPlus, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/board/$id")({ component: BoardPage });

type Board = { id: string; title: string; owner_id: string; color: string | null };
type List = { id: string; title: string; position: number; board_id: string };
type Task = {
  id: string; title: string; description: string | null; list_id: string; board_id: string;
  position: number; assignee_id: string | null; created_by: string;
};
type Profile = { id: string; email: string | null; display_name: string | null };

const initials = (p?: Profile | null) => {
  const n = p?.display_name || p?.email || "?";
  return n.split(/[\s@]/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("");
};

function BoardPage() {
  const { id: boardId } = Route.useParams();
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  const [board, setBoard] = useState<Board | null>(null);
  const [lists, setLists] = useState<List[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [newTaskFor, setNewTaskFor] = useState<string | null>(null);
  const [membersOpen, setMembersOpen] = useState(false);

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);

  const loadAll = async () => {
    const [{ data: b }, { data: l }, { data: t }, { data: m }] = await Promise.all([
      supabase.from("boards").select("*").eq("id", boardId).maybeSingle(),
      supabase.from("lists").select("*").eq("board_id", boardId).order("position"),
      supabase.from("tasks").select("*").eq("board_id", boardId).order("position"),
      supabase.from("board_members").select("user_id").eq("board_id", boardId),
    ]);
    if (!b) { toast.error("Board not found"); navigate({ to: "/dashboard" }); return; }
    setBoard(b as Board);
    setLists((l ?? []) as List[]);
    setTasks((t ?? []) as Task[]);
    const memberIds = (m ?? []).map((x: { user_id: string }) => x.user_id);
    if (memberIds.length) {
      const { data: profs } = await supabase.from("profiles").select("*").in("id", memberIds);
      const arr = (profs ?? []) as Profile[];
      setMembers(arr);
      setProfiles(Object.fromEntries(arr.map((p) => [p.id, p])));
    }
  };

  useEffect(() => { if (user) loadAll(); }, [user, boardId]);

  // Realtime
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`board:${boardId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `board_id=eq.${boardId}` }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "lists", filter: `board_id=eq.${boardId}` }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "board_members", filter: `board_id=eq.${boardId}` }, () => loadAll())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, boardId]);

  const tasksByList = useMemo(() => {
    const m: Record<string, Task[]> = {};
    for (const l of lists) m[l.id] = [];
    for (const t of [...tasks].sort((a, b) => a.position - b.position)) (m[t.list_id] ??= []).push(t);
    return m;
  }, [lists, tasks]);

  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const moving = tasks.find((t) => t.id === draggableId);
    if (!moving) return;

    // optimistic
    const next = tasks.filter((t) => t.id !== draggableId);
    const targetTasks = next.filter((t) => t.list_id === destination.droppableId).sort((a, b) => a.position - b.position);
    const updated = { ...moving, list_id: destination.droppableId };
    targetTasks.splice(destination.index, 0, updated);
    const repositioned = targetTasks.map((t, i) => ({ ...t, position: i }));
    const others = next.filter((t) => t.list_id !== destination.droppableId);
    setTasks([...others, ...repositioned]);

    // persist all positions in target list + moved task's list_id
    const updates = repositioned.map((t) =>
      supabase.from("tasks").update({ list_id: destination.droppableId, position: t.position }).eq("id", t.id)
    );
    const results = await Promise.all(updates);
    const err = results.find((r) => r.error);
    if (err?.error) { toast.error(err.error.message); loadAll(); }
  };

  const addTask = async (listId: string, title: string) => {
    if (!user || !title.trim()) return;
    const pos = (tasksByList[listId]?.length ?? 0);
    const { error } = await supabase.from("tasks").insert({
      board_id: boardId, list_id: listId, title: title.trim(), position: pos, created_by: user.id,
    });
    if (error) toast.error(error.message);
    setNewTaskFor(null);
  };

  const updateTask = async (id: string, patch: Partial<Task>) => {
    const { error } = await supabase.from("tasks").update(patch).eq("id", id);
    if (error) toast.error(error.message);
  };

  const deleteTask = async (id: string) => {
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) toast.error(error.message);
    setOpenTask(null);
  };

  const addList = async () => {
    const title = prompt("List name?");
    if (!title) return;
    const { error } = await supabase.from("lists").insert({ board_id: boardId, title, position: lists.length });
    if (error) toast.error(error.message);
  };

  const deleteList = async (id: string) => {
    if (!confirm("Delete this list and all its tasks?")) return;
    const { error } = await supabase.from("lists").delete().eq("id", id);
    if (error) toast.error(error.message);
  };

if (loading || !user || !board) return <dayNightLoader/>;

  const isOwner = board.owner_id === user.id;
  const accent = `var(--${board.color || "board-1"})`;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <Link to="/dashboard" className="rounded-md p-1.5 hover:bg-accent"><ArrowLeft className="h-4 w-4" /></Link>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: accent }} />
              <h1 className="text-lg font-bold">{board.title}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex -space-x-2">
              {members.slice(0, 5).map((m) => (
                <Avatar key={m.id} className="h-8 w-8 border-2 border-card">
                  <AvatarFallback className="bg-primary/15 text-xs">{initials(m)}</AvatarFallback>
                </Avatar>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={() => setMembersOpen(true)}>
              <UserPlus className="mr-1.5 h-4 w-4" /> Members
            </Button>
            <Link to="/dashboard" className="flex items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground">
              <Kanban className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-x-auto" style={{ background: `linear-gradient(180deg, color-mix(in oklab, ${accent} 14%, var(--background)) 0%, var(--background) 320px)` }}>
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex h-full items-start gap-4 p-6">
            {lists.map((list) => (
              <div key={list.id} className="flex w-72 shrink-0 flex-col rounded-xl bg-column shadow-[var(--shadow-card)]">
                <div className="flex items-center justify-between px-3 py-2.5">
                  <h3 className="text-sm font-semibold">{list.title}<span className="ml-2 text-xs text-muted-foreground">{tasksByList[list.id]?.length ?? 0}</span></h3>
                  <button onClick={() => deleteList(list.id)} className="rounded p-1 text-muted-foreground opacity-0 transition hover:bg-background hover:text-destructive group-hover:opacity-100" title="Delete list">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <Droppable droppableId={list.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`flex min-h-[40px] flex-col gap-2 px-2 pb-2 transition ${snapshot.isDraggingOver ? "bg-accent/40" : ""}`}
                    >
                      {(tasksByList[list.id] ?? []).map((task, index) => {
                        const assignee = task.assignee_id ? profiles[task.assignee_id] : null;
                        return (
                          <Draggable key={task.id} draggableId={task.id} index={index}>
                            {(p, snap) => (
                              <div
                                ref={p.innerRef}
                                {...p.draggableProps}
                                {...p.dragHandleProps}
                                onClick={() => setOpenTask(task)}
                                className={`group cursor-pointer rounded-lg border bg-card p-3 text-sm shadow-sm transition hover:border-primary/40 ${snap.isDragging ? "rotate-1 shadow-[var(--shadow-elevated)]" : ""}`}
                              >
                                <div className="font-medium">{task.title}</div>
                                {task.description && <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{task.description}</div>}
                                {assignee && (
                                  <div className="mt-2 flex justify-end">
                                    <Avatar className="h-6 w-6"><AvatarFallback className="bg-primary/15 text-[10px]">{initials(assignee)}</AvatarFallback></Avatar>
                                  </div>
                                )}
                              </div>
                            )}
                          </Draggable>
                        );
                      })}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
                <div className="px-2 pb-2">
                  {newTaskFor === list.id ? (
                    <NewTaskForm onCancel={() => setNewTaskFor(null)} onSubmit={(t) => addTask(list.id, t)} />
                  ) : (
                    <button
                      onClick={() => setNewTaskFor(list.id)}
                      className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-background hover:text-foreground"
                    >
                      <Plus className="h-4 w-4" /> Add a card
                    </button>
                  )}
                </div>
              </div>
            ))}

            <button
              onClick={addList}
              className="flex w-72 shrink-0 items-center justify-center gap-2 rounded-xl border border-dashed bg-card/50 px-3 py-3 text-sm text-muted-foreground hover:bg-card"
            >
              <Plus className="h-4 w-4" /> Add list
            </button>
          </div>
        </DragDropContext>
      </main>

      {openTask && (
        <TaskModal
          task={openTask}
          members={members}
          lists={lists}
          onClose={() => setOpenTask(null)}
          onSave={(patch) => updateTask(openTask.id, patch)}
          onDelete={() => deleteTask(openTask.id)}
        />
      )}

      <MembersDialog
        open={membersOpen}
        onOpenChange={setMembersOpen}
        boardId={boardId}
        isOwner={isOwner}
        members={members}
        onChanged={loadAll}
      />
    </div>
  );
}

function NewTaskForm({ onCancel, onSubmit }: { onCancel: () => void; onSubmit: (title: string) => void }) {
  const [v, setV] = useState("");
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit(v); setV(""); }}
      className="rounded-md border bg-card p-2"
    >
      <Textarea autoFocus value={v} onChange={(e) => setV(e.target.value)} placeholder="Card title…" className="min-h-[60px] text-sm" />
      <div className="mt-2 flex items-center gap-2">
        <Button type="submit" size="sm">Add</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}><X className="h-4 w-4" /></Button>
      </div>
    </form>
  );
}

function TaskModal({
  task, members, lists, onClose, onSave, onDelete,
}: {
  task: Task; members: Profile[]; lists: List[];
  onClose: () => void; onSave: (p: Partial<Task>) => void; onDelete: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [assignee, setAssignee] = useState(task.assignee_id ?? "none");
  const [listId, setListId] = useState(task.list_id);

  const save = () => {
    onSave({
      title: title.trim() || task.title,
      description: description || null,
      assignee_id: assignee === "none" ? null : assignee,
      list_id: listId,
    });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit task</DialogTitle>
          <DialogDescription>Update details, assignee, or move between lists.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div><Label>Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>List</Label>
              <Select value={listId} onValueChange={setListId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {lists.map((l) => <SelectItem key={l.id} value={l.id}>{l.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Assignee</Label>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.display_name || m.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter className="flex justify-between sm:justify-between">
          <Button variant="destructive" onClick={onDelete}><Trash2 className="mr-1.5 h-4 w-4" /> Delete</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MembersDialog({
  open, onOpenChange, boardId, isOwner, members, onChanged,
}: {
  open: boolean; onOpenChange: (o: boolean) => void;
  boardId: string; isOwner: boolean; members: Profile[]; onChanged: () => void;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { data: prof, error } = await supabase.from("profiles").select("id, email").eq("email", email.trim().toLowerCase()).maybeSingle();
    if (error) { setBusy(false); return toast.error(error.message); }
    if (!prof) { setBusy(false); return toast.error("No user with that email. Ask them to sign up first."); }
    const { error: insErr } = await supabase.from("board_members").insert({ board_id: boardId, user_id: prof.id, role: "member" });
    setBusy(false);
    if (insErr) return toast.error(insErr.message);
    setEmail(""); toast.success("Member added"); onChanged();
  };

  const remove = async (uid: string) => {
    const { error } = await supabase.from("board_members").delete().eq("board_id", boardId).eq("user_id", uid);
    if (error) return toast.error(error.message);
    onChanged();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Board members</DialogTitle>
          <DialogDescription>{isOwner ? "Invite teammates by email." : "Only the board owner can manage members."}</DialogDescription>
        </DialogHeader>
        {isOwner && (
          <form onSubmit={invite} className="flex gap-2">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@email.com" required />
            <Button type="submit" disabled={busy}><UserPlus className="mr-1.5 h-4 w-4" /> Invite</Button>
          </form>
        )}
        <div className="space-y-2">
          {members.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-md border p-2">
              <div className="flex items-center gap-2">
                <Avatar className="h-8 w-8"><AvatarFallback className="bg-primary/15 text-xs">{initials(m)}</AvatarFallback></Avatar>
                <div>
                  <div className="text-sm font-medium">{m.display_name || m.email}</div>
                  <div className="text-xs text-muted-foreground">{m.email}</div>
                </div>
              </div>
              {isOwner && (
                <Button size="sm" variant="ghost" onClick={() => remove(m.id)}><X className="h-4 w-4" /></Button>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
