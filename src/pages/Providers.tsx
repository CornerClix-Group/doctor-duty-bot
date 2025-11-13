import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, ArrowLeft, Home, Plus, Search, Users as UsersIcon, Download, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ProviderList } from '@/components/providers/ProviderList';
import { ProviderDialog } from '@/components/providers/ProviderDialog';
import { BulkImportDialog } from '@/components/providers/BulkImportDialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { generateProviderCSVTemplate } from '@/lib/csvTemplateGenerator';

export interface Provider {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string | null;
  rest_hours: number | null;
  n_recovery_days: number | null;
  allowed_shifts: string[] | null;
  preferred_shifts: string[] | null;
  saturday_restrictions: string | null;
  sunday_restrictions: string | null;
  block_pattern: string | null;
  created_at: string;
  updated_at: string;
  user_id: string | null;
}

const Providers = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);

  const fetchProviders = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('provider_profiles')
        .select('*')
        .order('last_name, first_name');

      if (error) throw error;
      setProviders(data || []);
    } catch (error) {
      console.error('Error fetching providers:', error);
      toast({
        title: "Error",
        description: "Failed to load providers",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProviders();
  }, []);

  const handleAddProvider = () => {
    setSelectedProvider(null);
    setIsDialogOpen(true);
  };

  const handleEditProvider = (provider: Provider) => {
    setSelectedProvider(provider);
    setIsDialogOpen(true);
  };

  const handleSendInvite = async (provider: Provider) => {
    try {
      const { error } = await supabase.functions.invoke("send-invitation", {
        body: {
          providerId: provider.id,
          email: provider.email,
          name: `${provider.first_name} ${provider.last_name}`,
        },
      });

      if (error) throw error;

      toast({
        title: "Invitation sent",
        description: `Invitation email sent to ${provider.email}`,
      });

      fetchProviders();
    } catch (error: any) {
      console.error("Error sending invitation:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to send invitation",
        variant: "destructive",
      });
    }
  };

  const handleDeleteProvider = async (id: string) => {
    try {
      const { error } = await supabase
        .from('provider_profiles')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Provider deleted successfully",
      });
      
      fetchProviders();
    } catch (error) {
      console.error('Error deleting provider:', error);
      toast({
        title: "Error",
        description: "Failed to delete provider",
        variant: "destructive",
      });
    }
  };

  const filteredProviders = providers.filter(provider =>
    provider.first_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    provider.last_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    provider.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
                <UsersIcon className="h-8 w-8 text-white" />
              </div>
              <div>
              <h1 className="text-3xl font-bold text-foreground">
                Provider Management
              </h1>
              <p className="text-sm text-muted-foreground">
                Manage provider profiles, constraints, and preferences
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
        <div className="space-y-6">
          {/* Actions Bar */}
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search providers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={generateProviderCSVTemplate}>
                <Download className="mr-2 h-4 w-4" />
                Download Template
              </Button>
              <Button variant="outline" onClick={() => setIsBulkImportOpen(true)}>
                <Upload className="mr-2 h-4 w-4" />
                Bulk Import
              </Button>
              <Button onClick={handleAddProvider}>
                <Plus className="mr-2 h-4 w-4" />
                Add Provider
              </Button>
            </div>
          </div>

          {/* Provider List */}
          <ProviderList
            providers={filteredProviders}
            loading={loading}
            onEdit={handleEditProvider}
            onDelete={handleDeleteProvider}
            onSendInvite={handleSendInvite}
          />

          {/* Provider Dialog */}
          <ProviderDialog
            open={isDialogOpen}
            onOpenChange={setIsDialogOpen}
            provider={selectedProvider}
            onSuccess={() => {
              fetchProviders();
              setIsDialogOpen(false);
            }}
          />

          {/* Bulk Import Dialog */}
          <BulkImportDialog
            open={isBulkImportOpen}
            onOpenChange={setIsBulkImportOpen}
            onSuccess={fetchProviders}
          />
        </div>
      </main>
    </div>
  );
};

export default Providers;
