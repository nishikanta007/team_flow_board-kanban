
-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles viewable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Trigger to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)));
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Boards
CREATE TABLE public.boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT 'indigo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.boards ENABLE ROW LEVEL SECURITY;

-- Board members
CREATE TABLE public.board_members (
  board_id UUID NOT NULL REFERENCES public.boards ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (board_id, user_id)
);
ALTER TABLE public.board_members ENABLE ROW LEVEL SECURITY;

-- Security definer to check membership (avoids recursion)
CREATE OR REPLACE FUNCTION public.is_board_member(_board_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.boards WHERE id = _board_id AND owner_id = _user_id
    UNION
    SELECT 1 FROM public.board_members WHERE board_id = _board_id AND user_id = _user_id
  );
$$;

-- Boards policies
CREATE POLICY "Members can view boards" ON public.boards FOR SELECT TO authenticated
  USING (public.is_board_member(id, auth.uid()));
CREATE POLICY "Authenticated can create boards" ON public.boards FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners can update boards" ON public.boards FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id);
CREATE POLICY "Owners can delete boards" ON public.boards FOR DELETE TO authenticated
  USING (auth.uid() = owner_id);

-- Auto-add owner as member
CREATE OR REPLACE FUNCTION public.add_owner_as_member()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.board_members (board_id, user_id, role) VALUES (NEW.id, NEW.owner_id, 'owner');
  -- Default lists
  INSERT INTO public.lists (board_id, title, position) VALUES
    (NEW.id, 'Todo', 0), (NEW.id, 'In Progress', 1), (NEW.id, 'Done', 2);
  RETURN NEW;
END; $$;

-- Board members policies
CREATE POLICY "Members can view membership" ON public.board_members FOR SELECT TO authenticated
  USING (public.is_board_member(board_id, auth.uid()));
CREATE POLICY "Owners can add members" ON public.board_members FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.boards WHERE id = board_id AND owner_id = auth.uid()));
CREATE POLICY "Owners can remove members" ON public.board_members FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.boards WHERE id = board_id AND owner_id = auth.uid()));

-- Lists
CREATE TABLE public.lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES public.boards ON DELETE CASCADE,
  title TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.lists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view lists" ON public.lists FOR SELECT TO authenticated
  USING (public.is_board_member(board_id, auth.uid()));
CREATE POLICY "Members can insert lists" ON public.lists FOR INSERT TO authenticated
  WITH CHECK (public.is_board_member(board_id, auth.uid()));
CREATE POLICY "Members can update lists" ON public.lists FOR UPDATE TO authenticated
  USING (public.is_board_member(board_id, auth.uid()));
CREATE POLICY "Members can delete lists" ON public.lists FOR DELETE TO authenticated
  USING (public.is_board_member(board_id, auth.uid()));

CREATE TRIGGER on_board_created AFTER INSERT ON public.boards FOR EACH ROW EXECUTE FUNCTION public.add_owner_as_member();

-- Tasks
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID NOT NULL REFERENCES public.lists ON DELETE CASCADE,
  board_id UUID NOT NULL REFERENCES public.boards ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  assignee_id UUID REFERENCES auth.users ON DELETE SET NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_by UUID NOT NULL REFERENCES auth.users,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view tasks" ON public.tasks FOR SELECT TO authenticated
  USING (public.is_board_member(board_id, auth.uid()));
CREATE POLICY "Members can insert tasks" ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (public.is_board_member(board_id, auth.uid()) AND auth.uid() = created_by);
CREATE POLICY "Members can update tasks" ON public.tasks FOR UPDATE TO authenticated
  USING (public.is_board_member(board_id, auth.uid()));
CREATE POLICY "Members can delete tasks" ON public.tasks FOR DELETE TO authenticated
  USING (public.is_board_member(board_id, auth.uid()));

-- Realtime
ALTER TABLE public.lists REPLICA IDENTITY FULL;
ALTER TABLE public.tasks REPLICA IDENTITY FULL;
ALTER TABLE public.board_members REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lists;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.board_members;
