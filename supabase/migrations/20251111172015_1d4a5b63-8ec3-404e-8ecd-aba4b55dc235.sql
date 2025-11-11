-- Create app_role enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'provider', 'read_only');

-- Create user_roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Create schedules table to store generated schedules
CREATE TABLE public.schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month TEXT NOT NULL,
  year INTEGER NOT NULL,
  schedule_data JSONB NOT NULL,
  provider_totals JSONB,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(month, year)
);

-- Create shift_change_requests table
CREATE TABLE public.shift_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID REFERENCES public.schedules(id) ON DELETE CASCADE NOT NULL,
  requesting_provider_id UUID REFERENCES public.providers(id) NOT NULL,
  target_provider_id UUID REFERENCES public.providers(id) NOT NULL,
  shift_date DATE NOT NULL,
  shift_type TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  admin_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create chat_channels table
CREATE TABLE public.chat_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'public' CHECK (type IN ('public', 'private', 'dm')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create chat_messages table
CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES public.chat_channels(id) ON DELETE CASCADE NOT NULL,
  sender_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create chat_participants table (for private channels and DMs)
CREATE TABLE public.chat_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES public.chat_channels(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(channel_id, user_id)
);

-- Create notifications table
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data JSONB,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles"
ON public.user_roles FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for schedules
CREATE POLICY "Everyone can view schedules"
ON public.schedules FOR SELECT
USING (true);

CREATE POLICY "Admins can manage schedules"
ON public.schedules FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for shift_change_requests
CREATE POLICY "Users can view their own requests"
ON public.shift_change_requests FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.providers p
    WHERE p.id = requesting_provider_id
    AND p.email = (SELECT email FROM auth.users WHERE id = auth.uid())
  )
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Providers can create requests"
ON public.shift_change_requests FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.providers p
    WHERE p.id = requesting_provider_id
    AND p.email = (SELECT email FROM auth.users WHERE id = auth.uid())
  )
);

CREATE POLICY "Admins can update requests"
ON public.shift_change_requests FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for chat_channels
CREATE POLICY "Everyone can view public channels"
ON public.chat_channels FOR SELECT
USING (type = 'public' OR auth.uid() IN (
  SELECT user_id FROM public.chat_participants WHERE channel_id = id
));

CREATE POLICY "Users can create channels"
ON public.chat_channels FOR INSERT
WITH CHECK (auth.uid() = created_by);

-- RLS Policies for chat_messages
CREATE POLICY "Users can view messages in their channels"
ON public.chat_messages FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.chat_channels c
    WHERE c.id = channel_id
    AND (c.type = 'public' OR auth.uid() IN (
      SELECT user_id FROM public.chat_participants WHERE channel_id = c.id
    ))
  )
);

CREATE POLICY "Users can send messages to their channels"
ON public.chat_messages FOR INSERT
WITH CHECK (
  auth.uid() = sender_id
  AND EXISTS (
    SELECT 1 FROM public.chat_channels c
    WHERE c.id = channel_id
    AND (c.type = 'public' OR auth.uid() IN (
      SELECT user_id FROM public.chat_participants WHERE channel_id = c.id
    ))
  )
);

-- RLS Policies for chat_participants
CREATE POLICY "Users can view channel participants"
ON public.chat_participants FOR SELECT
USING (true);

CREATE POLICY "Users can join channels"
ON public.chat_participants FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- RLS Policies for notifications
CREATE POLICY "Users can view their own notifications"
ON public.notifications FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications"
ON public.notifications FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "System can create notifications"
ON public.notifications FOR INSERT
WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_schedules_month_year ON public.schedules(month, year);
CREATE INDEX idx_shift_requests_status ON public.shift_change_requests(status);
CREATE INDEX idx_shift_requests_schedule ON public.shift_change_requests(schedule_id);
CREATE INDEX idx_chat_messages_channel ON public.chat_messages(channel_id);
CREATE INDEX idx_chat_messages_created ON public.chat_messages(created_at DESC);
CREATE INDEX idx_notifications_user ON public.notifications(user_id);
CREATE INDEX idx_notifications_read ON public.notifications(read);

-- Create triggers for updated_at
CREATE TRIGGER update_schedules_updated_at
BEFORE UPDATE ON public.schedules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_shift_requests_updated_at
BEFORE UPDATE ON public.shift_change_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create default Announcements channel
INSERT INTO public.chat_channels (name, type, created_by)
VALUES ('Announcements', 'public', NULL);

-- Enable realtime for chat and notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;