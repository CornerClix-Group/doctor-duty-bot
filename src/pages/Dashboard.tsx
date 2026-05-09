import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import {
  Activity,
  Calendar,
  Users,
  FileSpreadsheet,
  History,
  Settings,
  LogOut,
  Sparkles,
  UserCircle,
  Mail,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { PublishedScheduleViewer } from '@/components/PublishedScheduleViewer';
import { HeroNextPeriod } from '@/components/dashboard/HeroNextPeriod';
import { getNextMonthAndYear } from '@/lib/dateUtils';

type HeroState = {
  month: string;
  year: number;
  status: string;
  errorCount: number;
  warnCount: number;
  lockedAt: string | null;
  publishedAt: string | null;
  lastUpdated: string | null;
};

type ScheduleActivityRow = {
  id: string;
  month: string;
  year: number;
  status: string;
  updated_at: string;
  created_by: string | null;
  actor_email: string | null;
};

function defaultHeroState(): HeroState {
  const { month, year } = getNextMonthAndYear();
  return {
    month,
    year,
    status: 'not_started',
    errorCount: 0,
    warnCount: 0,
    lockedAt: null,
    publishedAt: null,
    lastUpdated: null,
  };
}

function activityStatusBadge(status: string) {
  switch (status) {
    case 'published':
      return <Badge className="bg-green-600 hover:bg-green-600 capitalize">{status}</Badge>;
    case 'locked':
      return <Badge variant="secondary" className="capitalize">{status}</Badge>;
    case 'draft':
    case 'validated':
    case 'solved':
      return <Badge variant="outline" className="capitalize">{status}</Badge>;
    default:
      return <Badge variant="outline" className="capitalize">{status}</Badge>;
  }
}

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, role, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    toast({
      title: 'Signed out',
      description: 'You have been successfully signed out.',
    });
  };

  const [activeProviders, setActiveProviders] = useState<number | null>(null);
  const [hero, setHero] = useState<HeroState>(defaultHeroState);
  const [activityState, setActivityState] = useState<'pending' | 'hidden' | 'ready'>('pending');
  const [activityRows, setActivityRows] = useState<ScheduleActivityRow[]>([]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      const { count, error } = await (supabase as any)
        .from('provider_profiles')
        .select('id', { count: 'exact', head: true })
        .eq('active', true)
        .eq('role', 'provider');
      if (!error && isMounted) setActiveProviders(count ?? 0);
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const { data, error } = await supabase.rpc('get_next_open_period');
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        if (!isMounted) return;
        if (row && typeof row === 'object' && 'month' in row) {
          setHero({
            month: row.month as string,
            year: row.year as number,
            status: row.status as string,
            errorCount: (row.error_count as number) ?? 0,
            warnCount: (row.warn_count as number) ?? 0,
            lockedAt: (row.locked_at as string | null) ?? null,
            publishedAt: (row.published_at as string | null) ?? null,
            lastUpdated: (row.updated_at as string | null) ?? null,
          });
        } else {
          setHero(defaultHeroState());
        }
      } catch {
        if (!isMounted) return;
        setHero(defaultHeroState());
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const { data, error } = await supabase.rpc('get_recent_schedule_activity', {
          limit_n: 5,
        });
        if (error) throw error;
        if (!isMounted) return;
        setActivityRows((data as ScheduleActivityRow[]) ?? []);
        setActivityState('ready');
      } catch {
        if (!isMounted) return;
        setActivityState('hidden');
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  const allActions = [
    {
      title: 'AI Schedule Generator',
      description: 'Generate optimized schedules using AI',
      icon: Sparkles,
      action: () => navigate('/generate'),
      variant: 'default' as const,
      roles: ['admin'],
    },
    {
      title: 'Provider Management',
      description: 'Manage provider profiles and constraints',
      icon: Users,
      action: () => navigate('/providers'),
      variant: 'outline' as const,
      roles: ['admin'],
    },
    {
      title: 'Admin Dashboard',
      description: 'Access admin tools and manage system',
      icon: Settings,
      action: () => navigate('/admin'),
      variant: 'outline' as const,
      roles: ['admin'],
    },
    {
      title: 'Broadcast Emails',
      description: 'Send announcements to all providers',
      icon: Mail,
      action: () => navigate('/broadcast'),
      variant: 'outline' as const,
      roles: ['admin'],
    },
    {
      title: 'My Profile',
      description: 'Edit your scheduling preferences',
      icon: UserCircle,
      action: () => navigate('/profile'),
      variant: 'outline' as const,
      roles: ['provider'],
    },
    {
      title: 'Team Chat',
      description: 'Communicate with colleagues and admins',
      icon: History,
      action: () => navigate('/chat'),
      variant: 'outline' as const,
      roles: ['admin', 'provider'],
    },
    {
      title: 'View Schedule History',
      description: 'Access and manage previous schedules',
      icon: History,
      action: () => {
        toast({
          title: 'Coming Soon',
          description: 'Schedule history feature will be available soon.',
        });
      },
      variant: 'outline' as const,
      roles: ['admin', 'provider'],
    },
    {
      title: 'Request Shift Change',
      description: 'Submit a shift swap request for approval',
      icon: Settings,
      action: () => {
        toast({
          title: 'Coming Soon',
          description: 'Shift change request feature will be available soon.',
        });
      },
      variant: 'outline' as const,
      roles: ['provider'],
    },
  ];

  const quickActions = allActions.filter(
    (action) => !action.roles || (role && action.roles.includes(role)),
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <header className="border-b border-border/40 bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-gradient-to-br from-primary to-secondary p-3 shadow-lg">
                <Activity className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-foreground">EMSchedule</h1>
                <p className="text-sm text-muted-foreground">Effortless physician scheduling</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right mr-4">
                <p className="text-sm font-medium text-foreground">{user?.email}</p>
                <p className="text-xs text-muted-foreground">
                  {role === 'admin' ? 'Master Admin' : role === 'provider' ? 'Provider' : 'Read Only'}
                </p>
              </div>
              <Button variant="outline" size="icon" onClick={handleSignOut}>
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="space-y-8">
          <div>
            <h2 className="text-2xl font-bold text-foreground mb-2">Welcome back!</h2>
            <p className="text-muted-foreground">Here&apos;s an overview of your scheduling operations</p>
          </div>

          <HeroNextPeriod
            month={hero.month}
            year={hero.year}
            status={hero.status}
            errorCount={hero.errorCount}
            warnCount={hero.warnCount}
            lockedAt={hero.lockedAt}
            publishedAt={hero.publishedAt}
            activeProviders={activeProviders}
            lastUpdated={hero.lastUpdated}
          />

          <div>
            <h3 className="text-xl font-bold text-foreground mb-4">Quick Actions</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {quickActions.map((action, index) => (
                <Card
                  key={index}
                  className="overflow-hidden transition-all hover:shadow-lg hover:border-primary/50 cursor-pointer group"
                  onClick={action.action}
                >
                  <CardHeader>
                    <div className="flex items-start gap-4">
                      <div className="rounded-lg bg-primary/10 p-3 group-hover:bg-primary/20 transition-colors">
                        <action.icon className="h-6 w-6 text-primary" />
                      </div>
                      <div className="flex-1">
                        <CardTitle className="text-lg group-hover:text-primary transition-colors">
                          {action.title}
                        </CardTitle>
                        <CardDescription className="mt-1">{action.description}</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>

          <div className="mb-8">
            <PublishedScheduleViewer />
          </div>

          {activityState === 'ready' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5 text-primary" />
                  Recent Activity
                </CardTitle>
                <CardDescription>Latest schedule updates in your workspace</CardDescription>
              </CardHeader>
              <CardContent>
                {activityRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No schedules yet. Start your first month above.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {activityRows.map((row) => (
                      <div
                        key={row.id}
                        className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="rounded-full bg-primary/15 p-2 shrink-0">
                            <Calendar className="h-4 w-4 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">
                              {row.month} {row.year}
                              {row.actor_email ? (
                                <span className="text-muted-foreground font-normal">
                                  {' '}
                                  · {row.actor_email}
                                </span>
                              ) : null}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(row.updated_at), { addSuffix: true })}
                            </p>
                          </div>
                        </div>
                        {activityStatusBadge(row.status)}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      <footer className="mt-16 border-t border-border/40 bg-card/30 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">Powered by advanced AI scheduling algorithms</p>
            <p className="text-xs text-muted-foreground">
              Ensuring optimal staff distribution while respecting all provider constraints
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Dashboard;
