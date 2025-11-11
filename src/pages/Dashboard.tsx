import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Activity, 
  Calendar, 
  Users, 
  Clock, 
  TrendingUp, 
  FileSpreadsheet,
  Plus,
  History,
  Settings
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const Dashboard = () => {
  const navigate = useNavigate();

  const stats = [
    {
      title: 'Active Providers',
      value: '15',
      change: '+2 this month',
      icon: Users,
      color: 'text-primary'
    },
    {
      title: 'Schedules Created',
      value: '8',
      change: 'Last 30 days',
      icon: Calendar,
      color: 'text-secondary'
    },
    {
      title: 'Avg Fill Rate',
      value: '98.5%',
      change: '+2.4% from last month',
      icon: TrendingUp,
      color: 'text-accent'
    },
    {
      title: 'Hours Scheduled',
      value: '2,480',
      change: 'This month',
      icon: Clock,
      color: 'text-medical-teal'
    }
  ];

  const quickActions = [
    {
      title: 'Create New Schedule',
      description: 'Upload template and generate AI-optimized schedule',
      icon: Plus,
      action: () => navigate('/schedule'),
      variant: 'default' as const
    },
    {
      title: 'View Schedule History',
      description: 'Access and manage previous schedules',
      icon: History,
      action: () => {},
      variant: 'outline' as const
    },
    {
      title: 'Provider Management',
      description: 'Manage provider constraints and preferences',
      icon: Users,
      action: () => {},
      variant: 'outline' as const
    },
    {
      title: 'Settings',
      description: 'Configure scheduling rules and preferences',
      icon: Settings,
      action: () => {},
      variant: 'outline' as const
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* Header */}
      <header className="border-b border-border/40 bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-gradient-to-br from-primary to-secondary p-3 shadow-lg">
                <Activity className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-foreground">
                  MedScheduler AI
                </h1>
                <p className="text-sm text-muted-foreground">
                  Intelligent Physician Scheduling Platform
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="space-y-8">
          {/* Welcome Section */}
          <div>
            <h2 className="text-2xl font-bold text-foreground mb-2">Welcome back!</h2>
            <p className="text-muted-foreground">
              Here's an overview of your scheduling operations
            </p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {stats.map((stat, index) => (
              <Card key={index} className="overflow-hidden transition-all hover:shadow-lg">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {stat.title}
                  </CardTitle>
                  <stat.icon className={`h-5 w-5 ${stat.color}`} />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-foreground">{stat.value}</div>
                  <p className="text-xs text-muted-foreground mt-1">{stat.change}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Quick Actions */}
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
                        <CardDescription className="mt-1">
                          {action.description}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-primary" />
                Recent Activity
              </CardTitle>
              <CardDescription>Your latest scheduling operations</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  { date: '2026-01-15', action: 'Generated January 2026 schedule', status: 'Completed' },
                  { date: '2025-12-28', action: 'Exported December 2025 schedule', status: 'Completed' },
                  { date: '2025-12-20', action: 'Updated provider constraints', status: 'Completed' }
                ].map((item, index) => (
                  <div 
                    key={index} 
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="rounded-full bg-success/20 p-2">
                        <Calendar className="h-4 w-4 text-success" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{item.action}</p>
                        <p className="text-xs text-muted-foreground">{item.date}</p>
                      </div>
                    </div>
                    <span className="text-xs font-medium text-success">{item.status}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-16 border-t border-border/40 bg-card/30 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              Powered by advanced AI scheduling algorithms
            </p>
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
