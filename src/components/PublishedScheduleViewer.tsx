import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { ScheduleCalendar } from '@/components/ScheduleCalendar';
import { Loader2, Calendar } from 'lucide-react';

export const PublishedScheduleViewer = () => {
  const [loading, setLoading] = useState(true);
  const [schedule, setSchedule] = useState<any>(null);

  useEffect(() => {
    fetchPublishedSchedule();
  }, []);

  const fetchPublishedSchedule = async () => {
    try {
      setLoading(true);
      
      // Get the most recent published schedule
      const { data, error } = await supabase
        .from('schedules')
        .select('*')
        .eq('status', 'published')
        .order('year', { ascending: false })
        .order('month', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      
      setSchedule(data);
    } catch (error) {
      console.error('Error fetching published schedule:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-8">
        <div className="flex flex-col items-center justify-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading published schedule...</p>
        </div>
      </Card>
    );
  }

  if (!schedule) {
    return (
      <Card className="p-8">
        <div className="flex flex-col items-center justify-center gap-4">
          <Calendar className="h-12 w-12 text-muted-foreground" />
          <div className="text-center">
            <h3 className="text-lg font-semibold text-foreground">No Published Schedule</h3>
            <p className="text-sm text-muted-foreground mt-1">
              There are currently no published schedules available.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Current Schedule</h2>
          <p className="text-sm text-muted-foreground">
            Published on {new Date(schedule.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>

      <ScheduleCalendar
        schedule={schedule.schedule_data || []}
        month={`${schedule.month} ${schedule.year}`}
      />
    </div>
  );
};
