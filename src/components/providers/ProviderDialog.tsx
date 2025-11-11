import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Provider } from '@/pages/Providers';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

interface ProviderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: Provider | null;
  onSuccess: () => void;
}

export const ProviderDialog = ({ open, onOpenChange, provider, onSuccess }: ProviderDialogProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    target_shifts: 0,
    weekend_quota: 0,
    notes: '',
    active: true,
  });

  useEffect(() => {
    if (provider) {
      setFormData({
        name: provider.name,
        email: provider.email || '',
        phone: provider.phone || '',
        target_shifts: provider.target_shifts,
        weekend_quota: provider.weekend_quota,
        notes: provider.notes || '',
        active: provider.active,
      });
    } else {
      setFormData({
        name: '',
        email: '',
        phone: '',
        target_shifts: 0,
        weekend_quota: 0,
        notes: '',
        active: true,
      });
    }
  }, [provider, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast({
        title: "Error",
        description: "Provider name is required",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const data = {
        name: formData.name.trim(),
        email: formData.email.trim() || null,
        phone: formData.phone.trim() || null,
        target_shifts: formData.target_shifts,
        weekend_quota: formData.weekend_quota,
        notes: formData.notes.trim() || null,
        active: formData.active,
      };

      if (provider) {
        // Update existing provider
        const { error } = await supabase
          .from('providers')
          .update(data)
          .eq('id', provider.id);

        if (error) throw error;

        toast({
          title: "Success",
          description: "Provider updated successfully",
        });
      } else {
        // Create new provider
        const { error } = await supabase
          .from('providers')
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{provider ? 'Edit Provider' : 'Add New Provider'}</DialogTitle>
          <DialogDescription>
            {provider ? 'Update provider information and settings' : 'Create a new provider profile'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="basic">Basic Info</TabsTrigger>
              <TabsTrigger value="schedule">Schedule Settings</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Dr. John Doe"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="john.doe@example.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+1 (555) 123-4567"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Additional information about the provider..."
                  rows={3}
                />
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-0.5">
                  <Label htmlFor="active">Active Status</Label>
                  <p className="text-sm text-muted-foreground">
                    Include this provider in scheduling
                  </p>
                </div>
                <Switch
                  id="active"
                  checked={formData.active}
                  onCheckedChange={(checked) => setFormData({ ...formData, active: checked })}
                />
              </div>
            </TabsContent>

            <TabsContent value="schedule" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="target_shifts">Target Shifts Per Month</Label>
                <Input
                  id="target_shifts"
                  type="number"
                  min="0"
                  value={formData.target_shifts}
                  onChange={(e) => setFormData({ ...formData, target_shifts: parseInt(e.target.value) || 0 })}
                />
                <p className="text-xs text-muted-foreground">
                  Number of shifts this provider should work per month
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="weekend_quota">Weekend Quota Per Month</Label>
                <Input
                  id="weekend_quota"
                  type="number"
                  min="0"
                  value={formData.weekend_quota}
                  onChange={(e) => setFormData({ ...formData, weekend_quota: parseInt(e.target.value) || 0 })}
                />
                <p className="text-xs text-muted-foreground">
                  Number of weekend shifts this provider should work per month
                </p>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {provider ? 'Update' : 'Create'} Provider
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
