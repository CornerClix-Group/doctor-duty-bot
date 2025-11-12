import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Settings, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';

interface ProviderConstraint {
  provider_id: string;
  provider_name: string;
  allowed_shifts: string[] | null;
  disallowed_shifts: string[] | null;
  preferred_shifts: string[] | null;
  rest_hours: number;
  n_recovery_days: number;
  max_consecutive_n: number | null;
  block_pattern: string | null;
  saturday_restrictions: string | null;
  sunday_restrictions: string | null;
  weekend_rules: string[] | null;
}

const ALL_SHIFTS = ['D1', 'D2', 'MIDA', 'MIDB', 'E', 'N', 'FT AM', 'FT PM', 'FT W'];

export default function ProviderRulesManager() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProviderConstraint[]>([]);
  const [editingProvider, setEditingProvider] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) {
      toast({
        title: "Access Denied",
        description: "Only admins can access this page.",
        variant: "destructive",
      });
      navigate('/');
      return;
    }
    fetchProviders();
  }, [isAdmin]);

  const fetchProviders = async () => {
    try {
      const { data: providersData, error: providersError } = await supabase
        .from('providers')
        .select('id, name')
        .eq('active', true)
        .order('name');

      if (providersError) throw providersError;

      const { data: constraintsData, error: constraintsError } = await supabase
        .from('provider_constraints')
        .select('*');

      if (constraintsError) throw constraintsError;

      const merged = providersData.map(provider => {
        const constraint = constraintsData.find(c => c.provider_id === provider.id);
        return {
          provider_id: provider.id,
          provider_name: provider.name,
          allowed_shifts: constraint?.allowed_shifts || null,
          disallowed_shifts: constraint?.disallowed_shifts || null,
          preferred_shifts: constraint?.preferred_shifts || null,
          rest_hours: constraint?.rest_hours || 12,
          n_recovery_days: constraint?.n_recovery_days || 2,
          max_consecutive_n: constraint?.max_consecutive_n || null,
          block_pattern: constraint?.block_pattern || null,
          saturday_restrictions: constraint?.saturday_restrictions || null,
          sunday_restrictions: constraint?.sunday_restrictions || null,
          weekend_rules: constraint?.weekend_rules || null,
        };
      });

      setProviders(merged);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (providerId: string) => {
    setSaving(providerId);
    const provider = providers.find(p => p.provider_id === providerId);
    if (!provider) return;

    try {
      const { error } = await supabase
        .from('provider_constraints')
        .upsert({
          provider_id: providerId,
          allowed_shifts: provider.allowed_shifts,
          disallowed_shifts: provider.disallowed_shifts,
          preferred_shifts: provider.preferred_shifts,
          rest_hours: provider.rest_hours,
          n_recovery_days: provider.n_recovery_days,
          max_consecutive_n: provider.max_consecutive_n,
          block_pattern: provider.block_pattern,
          saturday_restrictions: provider.saturday_restrictions,
          sunday_restrictions: provider.sunday_restrictions,
          weekend_rules: provider.weekend_rules,
        }, {
          onConflict: 'provider_id'
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: `Rules updated for ${provider.provider_name}`,
      });
      setEditingProvider(null);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(null);
    }
  };

  const updateProvider = (providerId: string, field: keyof ProviderConstraint, value: any) => {
    setProviders(prev => prev.map(p => 
      p.provider_id === providerId ? { ...p, [field]: value } : p
    ));
  };

  const toggleShift = (providerId: string, field: 'allowed_shifts' | 'disallowed_shifts' | 'preferred_shifts', shift: string) => {
    const provider = providers.find(p => p.provider_id === providerId);
    if (!provider) return;

    const currentShifts = provider[field] || [];
    const newShifts = currentShifts.includes(shift)
      ? currentShifts.filter(s => s !== shift)
      : [...currentShifts, shift];

    updateProvider(providerId, field, newShifts.length > 0 ? newShifts : null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading providers...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-3 rounded-xl">
              <Settings className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Provider Rules Manager</h1>
              <p className="text-muted-foreground">Configure scheduling constraints for all providers</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => navigate('/')} size="lg">
            <ArrowLeft className="mr-2 h-5 w-5" />
            Back to Home
          </Button>
        </div>

        {/* Provider Cards */}
        <div className="grid grid-cols-1 gap-6">
          {providers.map((provider) => (
            <Card key={provider.provider_id} className="overflow-hidden">
              <CardHeader className="bg-muted/30">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl">{provider.provider_name}</CardTitle>
                    <CardDescription>Scheduling constraints and preferences</CardDescription>
                  </div>
                  <Button
                    onClick={() => handleSave(provider.provider_id)}
                    disabled={saving === provider.provider_id}
                    size="sm"
                  >
                    {saving === provider.provider_id ? (
                      <>Saving...</>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        Save Changes
                      </>
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                {/* Basic Rules */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor={`rest-${provider.provider_id}`}>Rest Hours Between Shifts</Label>
                    <Input
                      id={`rest-${provider.provider_id}`}
                      type="number"
                      min="0"
                      max="24"
                      value={provider.rest_hours}
                      onChange={(e) => updateProvider(provider.provider_id, 'rest_hours', parseInt(e.target.value) || 12)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`recovery-${provider.provider_id}`}>Night Recovery Days</Label>
                    <Input
                      id={`recovery-${provider.provider_id}`}
                      type="number"
                      min="0"
                      max="7"
                      value={provider.n_recovery_days}
                      onChange={(e) => updateProvider(provider.provider_id, 'n_recovery_days', parseInt(e.target.value) || 2)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`max-n-${provider.provider_id}`}>Max Consecutive Nights</Label>
                    <Input
                      id={`max-n-${provider.provider_id}`}
                      type="number"
                      min="0"
                      max="10"
                      value={provider.max_consecutive_n || ''}
                      onChange={(e) => updateProvider(provider.provider_id, 'max_consecutive_n', e.target.value ? parseInt(e.target.value) : null)}
                      placeholder="No limit"
                    />
                  </div>
                </div>

                {/* Shift Restrictions */}
                <div className="space-y-4">
                  <div>
                    <Label className="mb-3 block">Disallowed Shifts</Label>
                    <div className="flex flex-wrap gap-2">
                      {ALL_SHIFTS.map(shift => (
                        <Badge
                          key={shift}
                          variant={provider.disallowed_shifts?.includes(shift) ? "destructive" : "outline"}
                          className="cursor-pointer"
                          onClick={() => toggleShift(provider.provider_id, 'disallowed_shifts', shift)}
                        >
                          {shift}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label className="mb-3 block">Preferred Shifts</Label>
                    <div className="flex flex-wrap gap-2">
                      {ALL_SHIFTS.map(shift => (
                        <Badge
                          key={shift}
                          variant={provider.preferred_shifts?.includes(shift) ? "default" : "outline"}
                          className="cursor-pointer"
                          onClick={() => toggleShift(provider.provider_id, 'preferred_shifts', shift)}
                        >
                          {shift}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label className="mb-3 block">Allowed Shifts (leave empty for all except disallowed)</Label>
                    <div className="flex flex-wrap gap-2">
                      {ALL_SHIFTS.map(shift => (
                        <Badge
                          key={shift}
                          variant={provider.allowed_shifts?.includes(shift) ? "secondary" : "outline"}
                          className="cursor-pointer"
                          onClick={() => toggleShift(provider.provider_id, 'allowed_shifts', shift)}
                        >
                          {shift}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Weekend & Pattern Rules */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor={`block-${provider.provider_id}`}>Block Pattern</Label>
                    <Input
                      id={`block-${provider.provider_id}`}
                      value={provider.block_pattern || ''}
                      onChange={(e) => updateProvider(provider.provider_id, 'block_pattern', e.target.value || null)}
                      placeholder="e.g., NN-NN-NN"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`sat-${provider.provider_id}`}>Saturday Restrictions</Label>
                    <Input
                      id={`sat-${provider.provider_id}`}
                      value={provider.saturday_restrictions || ''}
                      onChange={(e) => updateProvider(provider.provider_id, 'saturday_restrictions', e.target.value || null)}
                      placeholder="e.g., no_early"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`sun-${provider.provider_id}`}>Sunday Restrictions</Label>
                    <Input
                      id={`sun-${provider.provider_id}`}
                      value={provider.sunday_restrictions || ''}
                      onChange={(e) => updateProvider(provider.provider_id, 'sunday_restrictions', e.target.value || null)}
                      placeholder="e.g., no_night"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
