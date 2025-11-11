import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, Calendar } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const SHIFT_TYPES = ['D1', 'D2', 'MIDA', 'MIDB', 'E', 'N', 'FT AM', 'FT PM', 'FT W'];

export default function ProviderProfile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [provider, setProvider] = useState<any>(null);
  const [constraints, setConstraints] = useState<any>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    targetShifts: 0,
    weekendQuota: 4,
    notes: '',
    allowedShifts: [] as string[],
    disallowedShifts: [] as string[],
    preferredShifts: [] as string[],
    restHours: 12,
    nRecoveryDays: 2,
    blockPattern: '',
    saturdayRestrictions: '',
    sundayRestrictions: '',
  });

  useEffect(() => {
    if (user) {
      loadProviderData();
    }
  }, [user]);

  const loadProviderData = async () => {
    try {
      setLoading(true);
      
      // Get provider by email
      const { data: providerData, error: providerError } = await supabase
        .from('providers')
        .select('*')
        .eq('email', user?.email)
        .maybeSingle();

      if (providerError) throw providerError;

      if (providerData) {
        setProvider(providerData);
        
        // Get constraints
        const { data: constraintsData, error: constraintsError } = await supabase
          .from('provider_constraints')
          .select('*')
          .eq('provider_id', providerData.id)
          .maybeSingle();

        if (constraintsError && constraintsError.code !== 'PGRST116') throw constraintsError;
        
        setConstraints(constraintsData);
        
        setFormData({
          name: providerData.name || '',
          email: providerData.email || '',
          phone: providerData.phone || '',
          targetShifts: providerData.target_shifts || 0,
          weekendQuota: providerData.weekend_quota || 4,
          notes: providerData.notes || '',
          allowedShifts: constraintsData?.allowed_shifts || [],
          disallowedShifts: constraintsData?.disallowed_shifts || [],
          preferredShifts: constraintsData?.preferred_shifts || [],
          restHours: constraintsData?.rest_hours || 12,
          nRecoveryDays: constraintsData?.n_recovery_days || 2,
          blockPattern: constraintsData?.block_pattern || '',
          saturdayRestrictions: constraintsData?.saturday_restrictions || '',
          sundayRestrictions: constraintsData?.sunday_restrictions || '',
        });
      }
    } catch (error: any) {
      console.error('Error loading provider data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load provider profile',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      // Update provider
      const { error: providerError } = await supabase
        .from('providers')
        .update({
          name: formData.name,
          phone: formData.phone,
          target_shifts: formData.targetShifts,
          weekend_quota: formData.weekendQuota,
          notes: formData.notes,
        })
        .eq('id', provider.id);

      if (providerError) throw providerError;

      // Upsert constraints
      const { error: constraintsError } = await supabase
        .from('provider_constraints')
        .upsert({
          id: constraints?.id,
          provider_id: provider.id,
          allowed_shifts: formData.allowedShifts,
          disallowed_shifts: formData.disallowedShifts,
          preferred_shifts: formData.preferredShifts,
          rest_hours: formData.restHours,
          n_recovery_days: formData.nRecoveryDays,
          block_pattern: formData.blockPattern,
          saturday_restrictions: formData.saturdayRestrictions,
          sunday_restrictions: formData.sundayRestrictions,
        });

      if (constraintsError) throw constraintsError;

      toast({
        title: 'Success',
        description: 'Profile updated successfully',
      });
      
      loadProviderData();
    } catch (error: any) {
      console.error('Error saving:', error);
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleShift = (type: 'allowed' | 'disallowed' | 'preferred', shift: string) => {
    const key = type === 'allowed' ? 'allowedShifts' : type === 'disallowed' ? 'disallowedShifts' : 'preferredShifts';
    const current = formData[key];
    
    if (current.includes(shift)) {
      setFormData({ ...formData, [key]: current.filter(s => s !== shift) });
    } else {
      setFormData({ ...formData, [key]: [...current, shift] });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!provider) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card>
          <CardHeader>
            <CardTitle>No Provider Profile Found</CardTitle>
            <CardDescription>
              Your account is not linked to a provider profile. Please contact your administrator.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-3 rounded-xl">
            <Calendar className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Provider Profile</h1>
            <p className="text-muted-foreground">Manage your scheduling preferences and constraints</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="targetShifts">Target Shifts/Month</Label>
                <Input
                  id="targetShifts"
                  type="number"
                  value={formData.targetShifts}
                  onChange={(e) => setFormData({ ...formData, targetShifts: parseInt(e.target.value) })}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="weekendQuota">Weekend Quota</Label>
                <Input
                  id="weekendQuota"
                  type="number"
                  value={formData.weekendQuota}
                  onChange={(e) => setFormData({ ...formData, weekendQuota: parseInt(e.target.value) })}
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Shift Constraints</CardTitle>
            <CardDescription>Select which shifts you can, cannot, or prefer to work</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <Label>Allowed Shifts (you can ONLY work these)</Label>
              <div className="flex flex-wrap gap-2">
                {SHIFT_TYPES.map(shift => (
                  <Badge
                    key={shift}
                    variant={formData.allowedShifts.includes(shift) ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => toggleShift('allowed', shift)}
                  >
                    {shift}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <Label>Disallowed Shifts (you cannot work these)</Label>
              <div className="flex flex-wrap gap-2">
                {SHIFT_TYPES.map(shift => (
                  <Badge
                    key={shift}
                    variant={formData.disallowedShifts.includes(shift) ? 'destructive' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => toggleShift('disallowed', shift)}
                  >
                    {shift}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <Label>Preferred Shifts</Label>
              <div className="flex flex-wrap gap-2">
                {SHIFT_TYPES.map(shift => (
                  <Badge
                    key={shift}
                    variant={formData.preferredShifts.includes(shift) ? 'secondary' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => toggleShift('preferred', shift)}
                  >
                    {shift}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recovery & Rest Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="restHours">Minimum Rest Hours</Label>
                <Input
                  id="restHours"
                  type="number"
                  value={formData.restHours}
                  onChange={(e) => setFormData({ ...formData, restHours: parseInt(e.target.value) })}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="nRecoveryDays">Recovery Days After Night Shift</Label>
                <Input
                  id="nRecoveryDays"
                  type="number"
                  value={formData.nRecoveryDays}
                  onChange={(e) => setFormData({ ...formData, nRecoveryDays: parseInt(e.target.value) })}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="saturdayRestrictions">Saturday Restrictions</Label>
                <Input
                  id="saturdayRestrictions"
                  value={formData.saturdayRestrictions}
                  onChange={(e) => setFormData({ ...formData, saturdayRestrictions: e.target.value })}
                  placeholder="e.g., no-night-shifts"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="sundayRestrictions">Sunday Restrictions</Label>
                <Input
                  id="sundayRestrictions"
                  value={formData.sundayRestrictions}
                  onChange={(e) => setFormData({ ...formData, sundayRestrictions: e.target.value })}
                  placeholder="e.g., avoid-all"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving} size="lg">
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Profile
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}