import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, ArrowLeft, Home, Users, Calendar, MessageSquare, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const Admin = () => {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [pendingRequests, setPendingRequests] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [totalUsers, setTotalUsers] = useState(0);

  useEffect(() => {
    if (!isAdmin) {
      navigate('/');
      return;
    }

    fetchStats();
  }, [isAdmin, navigate]);

  const fetchStats = async () => {
    // Fetch pending shift requests
    const { count: requestCount } = await supabase
      .from('shift_change_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    setPendingRequests(requestCount || 0);

    // Fetch user count
    const { data: roles } = await supabase
      .from('user_roles')
      .select('user_id', { count: 'exact' });

    setTotalUsers(roles?.length || 0);
  };

  const adminModules = [
    {
      title: 'Schedule Manager',
      description: 'Create, edit, and manage monthly schedules',
      icon: Calendar,
      color: 'text-primary',
      action: () => navigate('/schedule'),
    },
    {
      title: 'Pending Requests',
      description: `${pendingRequests} shift change requests awaiting review`,
      icon: Bell,
      color: 'text-warning',
      badge: pendingRequests,
      action: () => navigate('/admin/requests'),
    },
    {
      title: 'User Management',
      description: `Manage roles and permissions for ${totalUsers} users`,
      icon: Users,
      color: 'text-secondary',
      action: () => navigate('/admin/users'),
    },
    {
      title: 'Communications',
      description: 'View and respond to messages',
      icon: MessageSquare,
      color: 'text-accent',
      badge: unreadMessages,
      action: () => navigate('/chat'),
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* Header */}
      <header className="border-b border-border/40 bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => navigate('/')}
                className="mr-2"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="rounded-xl bg-gradient-to-br from-primary to-secondary p-3 shadow-lg">
                <Activity className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-foreground">
                  Admin Dashboard
                </h1>
                <p className="text-sm text-muted-foreground">
                  Master control center for EMSchedule
                </p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <Home className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="space-y-8">
          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Users</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground">{totalUsers}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Pending Requests</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-warning">{pendingRequests}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Active Schedules</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-success">1</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Active Providers</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-primary">0</div>
              </CardContent>
            </Card>
          </div>

          {/* Admin Modules */}
          <div>
            <h2 className="text-2xl font-bold text-foreground mb-6">Admin Tools</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {adminModules.map((module, index) => (
                <Card 
                  key={index}
                  className="cursor-pointer hover:shadow-lg transition-all hover:border-primary/50 group"
                  onClick={module.action}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4">
                        <div className={`rounded-lg bg-primary/10 p-3 group-hover:bg-primary/20 transition-colors`}>
                          <module.icon className={`h-6 w-6 ${module.color}`} />
                        </div>
                        <div className="flex-1">
                          <CardTitle className="text-lg group-hover:text-primary transition-colors">
                            {module.title}
                          </CardTitle>
                          <CardDescription className="mt-1">
                            {module.description}
                          </CardDescription>
                        </div>
                      </div>
                      {module.badge !== undefined && module.badge > 0 && (
                        <Badge variant="destructive" className="ml-2">
                          {module.badge}
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Latest actions across the platform</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground text-center py-8">
                  No recent activity to display
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default Admin;
