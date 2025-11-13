import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Provider } from '@/pages/Providers';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface ProviderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: Provider | null;
  onSuccess: () => void;
}

const AVAILABLE_SHIFTS = ['D1', 'D2', 'MIDA', 'MIDB', 'E', 'N', 'FT AM', 'FT PM', 'FT W', 'C', 'A10'];

export const ProviderDialog = ({ open, onOpenChange, provider, onSuccess }: ProviderDialogProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    role: 'provider',
    rest_hours: 12,
    n_recovery_days: 2,
    allowed_shifts: [] as string[],
    preferred_shifts: [] as string[],
    saturday_restrictions: '',
    sunday_restrictions: '',
    block_pattern: '',
  });

  useEffect(() => {
    if (provider) {
      setFormData({
        first_name: provider.first_name,
        last_name: provider.last_name,
        email: provider.email || '',
        role: provider.role || 'provider',
        rest_hours: provider.rest_hours || 12,
        n_recovery_days: provider.n_recovery_days || 2,
        allowed_shifts: provider.allowed_shifts || [],
        preferred_shifts: provider.preferred_shifts || [],
        saturday_restrictions: provider.saturday_restrictions || '',
        sunday_restrictions: provider.sunday_restrictions || '',
        block_pattern: provider.block_pattern || '',
      });
    } else {
      setFormData({
        first_name: '',
        last_name: '',
        email: '',
        role: 'provider',
        rest_hours: 12,
        n_recovery_days: 2,
        allowed_shifts: [],
        preferred_shifts: [],
        saturday_restrictions: '',
        sunday_restrictions: '',
        block_pattern: '',
      });
    }
  }, [provider, open]);

  const toggleShift = (shift: string, field: 'allowed_shifts' | 'preferred_shifts') => {
    setFormData(prev => ({
      ...prev,
      [field]: prev[field].includes(shift)
        ? prev[field].filter(s => s !== shift)
        : [...prev[field], shift]
    }));
  };

  const selectAllShifts = (field: 'allowed_shifts' | 'preferred_shifts') => {
    setFormData(prev => ({
      ...prev,
      [field]: AVAILABLE_SHIFTS
    }));
  };

  const isAllShiftsSelected = (field: 'allowed_shifts' | 'preferred_shifts') => {
    return formData[field].length === AVAILABLE_SHIFTS.length;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.first_name.trim() || !formData.last_name.trim()) {
      toast({
        title: "Error",
        description: "First name and last name are required",
        variant: "destructive",
      });
      return;
    }

    if (!formData.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      toast({
        title: "Error",
        description: "Valid email is required",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const data = {
        first_name: formData.first_name.trim(),
        last_name: formData.last_name.trim(),
        email: formData.email.trim(),
        role: formData.role,
        rest_hours: formData.rest_hours,
        n_recovery_days: formData.n_recovery_days,
        allowed_shifts: formData.allowed_shifts.length > 0 ? formData.allowed_shifts : null,
        preferred_shifts: formData.preferred_shifts.length > 0 ? formData.preferred_shifts : null,
        saturday_restrictions: formData.saturday_restrictions.trim() || null,
        sunday_restrictions: formData.sunday_restrictions.trim() || null,
        block_pattern: formData.block_pattern.trim() || null,
      };

      if (provider) {
        const { error } = await supabase
          .from('provider_profiles')
          .update(data)
          .eq('id', provider.id);

        if (error) throw error;

        toast({
          title: "Success",
          description: "Provider updated successfully",
        });
      } else {
        const { error } = await supabase
          .from('provider_profiles')
          .insert([data]);

        if (error) throw error;

        toast({
          title: "Success",
          description: "Provider created successfully",
        });
      }

      onSuccess();
    } catch (error: any) {
      console.error('Error saving provider:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to save provider",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{provider ? 'Edit Provider' : 'Add New Provider'}</DialogTitle>
          <DialogDescription>
            {provider ? 'Update provider information and scheduling constraints' : 'Create a new provider profile with scheduling rules'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="basic">Basic Info</TabsTrigger>
              <TabsTrigger value="constraints">Scheduling Constraints</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="first_name">First Name *</Label>
                  <Input
                    id="first_name"
                    value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    placeholder="John"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="last_name">Last Name *</Label>
                  <Input
                    id="last_name"
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    placeholder="Doe"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="john.doe@example.com"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="rest_hours">Rest Hours Between Shifts</Label>
                  <Input
                    id="rest_hours"
                    type="number"
                    min="8"
                    max="24"
                    value={formData.rest_hours}
                    onChange={(e) => setFormData({ ...formData, rest_hours: parseInt(e.target.value) || 12 })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="n_recovery_days">Recovery Days After Night Shift</Label>
                  <Input
                    id="n_recovery_days"
                    type="number"
                    min="1"
                    max="7"
                    value={formData.n_recovery_days}
                    onChange={(e) => setFormData({ ...formData, n_recovery_days: parseInt(e.target.value) || 2 })}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="constraints" className="space-y-4 mt-4">
              <div className="space-y-3">
                <Label>Allowed Shifts</Label>
                <p className="text-sm text-muted-foreground">
                  Click "All Shifts" to select all, or choose individual shifts
                </p>
                <div className="flex items-center gap-2 mb-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => selectAllShifts('allowed_shifts')}
                  >
                    All Shifts
                  </Button>
                  {isAllShiftsSelected('allowed_shifts') && (
                    <span className="text-xs text-muted-foreground">All shifts selected</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_SHIFTS.map((shift) => (
                    <Badge
                      key={shift}
                      variant={formData.allowed_shifts.includes(shift) ? "default" : "outline"}
                      className="cursor-pointer hover:opacity-80"
                      onClick={() => toggleShift(shift, 'allowed_shifts')}
                    >
                      {shift}
                      {formData.allowed_shifts.includes(shift) && (
                        <X className="ml-1 h-3 w-3" />
                      )}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <Label>Preferred Shifts</Label>
                <p className="text-sm text-muted-foreground">Select shifts this provider prefers to work</p>
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_SHIFTS.map((shift) => (
                    <Badge
                      key={shift}
                      variant={formData.preferred_shifts.includes(shift) ? "default" : "outline"}
                      className="cursor-pointer hover:opacity-80"
                      onClick={() => toggleShift(shift, 'preferred_shifts')}
                    >
                      {shift}
                      {formData.preferred_shifts.includes(shift) && (
                        <X className="ml-1 h-3 w-3" />
                      )}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="saturday_restrictions">Saturday Restrictions</Label>
                <Input
                  id="saturday_restrictions"
                  value={formData.saturday_restrictions}
                  onChange={(e) => setFormData({ ...formData, saturday_restrictions: e.target.value })}
                  placeholder="e.g., no_night_shifts"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sunday_restrictions">Sunday Restrictions</Label>
                <Input
                  id="sunday_restrictions"
                  value={formData.sunday_restrictions}
                  onChange={(e) => setFormData({ ...formData, sunday_restrictions: e.target.value })}
                  placeholder="e.g., no_early_morning"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="block_pattern">Block Pattern</Label>
                <Input
                  id="block_pattern"
                  value={formData.block_pattern}
                  onChange={(e) => setFormData({ ...formData, block_pattern: e.target.value })}
                  placeholder="e.g., 3-4 night shifts with 4 days rest"
                />
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {provider ? 'Update Provider' : 'Create Provider'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
