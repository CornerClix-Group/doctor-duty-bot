import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Edit, Trash2, Mail as MailIcon, Send, User } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Provider } from '@/pages/Providers';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface ProviderListProps {
  providers: Provider[];
  loading: boolean;
  onEdit: (provider: Provider) => void;
  onDelete: (id: string) => void;
  onSendInvite: (provider: Provider) => void;
  onRefresh: () => void;
}

export const ProviderList = ({ providers, loading, onEdit, onDelete, onSendInvite, onRefresh }: ProviderListProps) => {
  const { toast } = useToast();

  const handleActiveToggle = async (provider: Provider, checked: boolean) => {
    try {
      const { error } = await supabase
        .from('provider_profiles')
        .update({ active: checked } as any)
        .eq('id', provider.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: `Provider ${checked ? 'activated' : 'deactivated'} successfully`,
      });

      onRefresh();
    } catch (error: any) {
      console.error('Error updating provider status:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update provider status",
        variant: "destructive",
      });
    }
  };
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (providers.length === 0) {
    return (
      <Card className="p-12">
        <div className="text-center space-y-3">
          <div className="mx-auto rounded-full bg-muted w-16 h-16 flex items-center justify-center">
            <User className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">No providers found</h3>
          <p className="text-sm text-muted-foreground">
            Get started by adding your first provider
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {providers.map((provider) => (
        <Card key={provider.id} className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <CardTitle className="flex items-center gap-2">
                  {provider.first_name} {provider.last_name}
                </CardTitle>
                <CardDescription className="mt-1">
                  {provider.email || 'No email'}
                </CardDescription>
              </div>
              <div className="flex flex-col items-end gap-2">
                <Badge variant="default">
                  {provider.role || 'Provider'}
                </Badge>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Active</span>
                  <Switch
                    checked={provider.active ?? true}
                    onCheckedChange={(checked) => handleActiveToggle(provider, checked)}
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Contact Info */}
            <div className="space-y-2 text-sm">
              {provider.email && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MailIcon className="h-4 w-4" />
                  <span className="truncate">{provider.email}</span>
                </div>
              )}
            </div>

            {/* Constraints */}
            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div>
                <p className="text-xs text-muted-foreground">Rest Hours</p>
                <p className="text-2xl font-bold text-foreground">{provider.rest_hours || 12}h</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Recovery Days</p>
                <p className="text-2xl font-bold text-foreground">{provider.n_recovery_days || 2}</p>
              </div>
            </div>

            {/* Shift Preferences */}
            {provider.allowed_shifts && provider.allowed_shifts.length > 0 && (
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground mb-2">Allowed Shifts</p>
                <div className="flex flex-wrap gap-1">
                  {provider.allowed_shifts.slice(0, 5).map((shift) => (
                    <Badge key={shift} variant="secondary" className="text-xs">
                      {shift}
                    </Badge>
                  ))}
                  {provider.allowed_shifts.length > 5 && (
                    <Badge variant="outline" className="text-xs">
                      +{provider.allowed_shifts.length - 5} more
                    </Badge>
                  )}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-4 border-t">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => onEdit(provider)}
              >
                <Edit className="h-4 w-4 mr-1" />
                Edit
              </Button>

              {provider.email && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onSendInvite(provider)}
                >
                  <Send className="h-4 w-4" />
                </Button>
              )}

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Provider</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete {provider.first_name} {provider.last_name}? This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => onDelete(provider.id)}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
