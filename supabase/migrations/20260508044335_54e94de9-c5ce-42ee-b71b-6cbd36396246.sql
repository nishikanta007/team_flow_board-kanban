DROP POLICY IF EXISTS "Authenticated can create boards" ON public.boards;
CREATE POLICY "Users can insert own boards"
ON public.boards
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = owner_id);