import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Home, Mail, Send, Loader2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';

interface Provider {
  id: string;
  name: string;
  email: string;
}

export default function Broadcast() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedProviders, setSelectedProviders] = useState<Set<string>>(new Set());
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [fromEmail, setFromEmail] = useState('onboarding@resend.dev');
  const [fromName, setFromName] = useState('ShiftPro Team');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetchProviders();
  }, []);

  const fetchProviders = async () => {
    try {
      const { data, error } = await supabase
        .from('providers')
        .select('id, name, email')
        .eq('active', true)
        .not('email', 'is', null)
        .order('name');

      if (error) throw error;
      setProviders(data || []);
      
      // Select all by default
      setSelectedProviders(new Set(data?.map(p => p.id) || []));
    } catch (error) {
      console.error('Error fetching providers:', error);
      toast({
        title: 'Error',
        description: 'Failed to load providers',
        variant: 'destructive',
      });
    }
  };

  const toggleProvider = (id: string) => {
    const newSelected = new Set(selectedProviders);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedProviders(newSelected);
  };

  const toggleAll = () => {
    if (selectedProviders.size === providers.length) {
      setSelectedProviders(new Set());
    } else {
      setSelectedProviders(new Set(providers.map(p => p.id)));
    }
  };

  const handleSend = async () => {
    if (!subject.trim() || !message.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Subject and message are required',
        variant: 'destructive',
      });
      return;
    }

    if (selectedProviders.size === 0) {
      toast({
        title: 'Validation Error',
        description: 'Please select at least one recipient',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSending(true);

      // Get selected provider details
      const audience = providers
        .filter(p => selectedProviders.has(p.id))
        .map(p => ({
          first_name: p.name.split(' ')[0],
          last_name: p.name.split(' ').slice(1).join(' '),
          email: p.email,
        }));

      console.log('Preparing emails...');

      // Step 1: Prepare personalized emails using AI
      const { data: emailsData, error: prepareError } = await supabase.functions.invoke(
        'prepare-broadcast-emails',
        {
          body: { subject, message, audience },
        }
      );

      if (prepareError) throw prepareError;

      console.log('Sending emails...', emailsData);

      // Step 2: Send emails using Resend
      const { data: sendData, error: sendError } = await supabase.functions.invoke(
        'send-broadcast-emails',
        {
          body: {
            emails: emailsData.emails,
            fromEmail,
            fromName,
          },
        }
      );

      if (sendError) throw sendError;

      toast({
        title: 'Broadcast Sent!',
        description: `Successfully sent ${sendData.success} emails${sendData.failed > 0 ? `, ${sendData.failed} failed` : ''}`,
      });

      // Reset form
      setSubject('');
      setMessage('');
    } catch (error: any) {
      console.error('Error sending broadcast:', error);
      toast({
        title: 'Send Failed',
        description: error.message || 'Failed to send broadcast',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

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
                <Mail className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-foreground">
                  Broadcast Emails
                </h1>
                <p className="text-sm text-muted-foreground">
                  Send personalized emails to providers
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
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Email Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Email Settings</CardTitle>
              <CardDescription>Configure sender information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="fromName">From Name</Label>
                  <Input
                    id="fromName"
                    value={fromName}
                    onChange={(e) => setFromName(e.target.value)}
                    placeholder="ShiftPro Team"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fromEmail">From Email</Label>
                  <Input
                    id="fromEmail"
                    type="email"
                    value={fromEmail}
                    onChange={(e) => setFromEmail(e.target.value)}
                    placeholder="onboarding@resend.dev"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Message Compose */}
          <Card>
            <CardHeader>
              <CardTitle>Compose Message</CardTitle>
              <CardDescription>Write your broadcast message (Markdown supported)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="January 2026 Schedule Posted"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="message">Message</Label>
                <Textarea
                  id="message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="The January 2026 schedule is now available in ShiftPro..."
                  rows={8}
                />
                <p className="text-xs text-muted-foreground">
                  Tip: Use Markdown for formatting. Each email will be personalized with the provider&apos;s name.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Recipients */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Recipients</CardTitle>
                  <CardDescription>
                    {selectedProviders.size} of {providers.length} providers selected
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={toggleAll}>
                  {selectedProviders.size === providers.length ? 'Deselect All' : 'Select All'}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {providers.map((provider) => (
                  <div
                    key={provider.id}
                    className="flex items-center space-x-3 p-2 hover:bg-muted/50 rounded-lg"
                  >
                    <Checkbox
                      checked={selectedProviders.has(provider.id)}
                      onCheckedChange={() => toggleProvider(provider.id)}
                    />
                    <div className="flex-1">
                      <p className="font-medium text-sm">{provider.name}</p>
                      <p className="text-xs text-muted-foreground">{provider.email}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Send Button */}
          <Button
            onClick={handleSend}
            disabled={sending || selectedProviders.size === 0}
            size="lg"
            className="w-full"
          >
            {sending ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Sending Broadcast...
              </>
            ) : (
              <>
                <Send className="mr-2 h-5 w-5" />
                Send to {selectedProviders.size} Provider{selectedProviders.size !== 1 ? 's' : ''}
              </>
            )}
          </Button>
        </div>
      </main>
    </div>
  );
}
