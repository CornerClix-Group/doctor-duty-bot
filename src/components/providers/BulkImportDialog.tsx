import { useState } from "react";
import { Upload, AlertCircle, CheckCircle2, FileText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { parseProviderCSV, type ParsedProvider, type ValidationError } from "@/lib/csvParser";
import { useToast } from "@/hooks/use-toast";

interface BulkImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export const BulkImportDialog = ({ open, onOpenChange, onSuccess }: BulkImportDialogProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ParsedProvider[]>([]);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setIsProcessing(true);

    const result = await parseProviderCSV(selectedFile);
    setPreview(result.providers.slice(0, 5)); // Show first 5 rows
    setErrors(result.errors);
    setIsProcessing(false);
  };

  const handleImport = async () => {
    if (!file) return;

    setIsProcessing(true);

    try {
      const result = await parseProviderCSV(file);

      if (!result.isValid) {
        toast({
          title: "Validation Failed",
          description: `Found ${result.errors.length} validation errors. Please fix them and try again.`,
          variant: "destructive",
        });
        setIsProcessing(false);
        return;
      }

      // Insert providers into database
      const { data, error } = await supabase
        .from("provider_profiles")
        .insert(result.providers)
        .select();

      if (error) {
        if (error.code === "23505") {
          toast({
            title: "Duplicate Email",
            description: "One or more email addresses already exist in the database.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Import Failed",
            description: error.message,
            variant: "destructive",
          });
        }
        setIsProcessing(false);
        return;
      }

      toast({
        title: "Import Successful",
        description: `Successfully imported ${data?.length || 0} providers.`,
      });

      onSuccess();
      onOpenChange(false);
      resetState();
    } catch (error) {
      toast({
        title: "Import Failed",
        description: "An unexpected error occurred during import.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const resetState = () => {
    setFile(null);
    setPreview([]);
    setErrors([]);
  };

  const handleClose = () => {
    resetState();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Import Providers</DialogTitle>
          <DialogDescription>
            Upload a CSV file to import multiple providers at once. Download the template to see the required format.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* File Upload */}
          <div className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 transition-colors">
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
              id="csv-upload"
              disabled={isProcessing}
            />
            <label htmlFor="csv-upload" className="cursor-pointer">
              <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-sm font-medium mb-2">
                {file ? file.name : "Click to upload CSV file"}
              </p>
              <p className="text-xs text-muted-foreground">
                CSV file with provider information
              </p>
            </label>
          </div>

          {/* Validation Errors */}
          {errors.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="font-medium mb-2">
                  Found {errors.length} validation error{errors.length > 1 ? "s" : ""}:
                </div>
                <ul className="list-disc list-inside space-y-1 text-sm max-h-40 overflow-y-auto">
                  {errors.slice(0, 10).map((error, index) => (
                    <li key={index}>
                      Row {error.row}, {error.field}: {error.message}
                    </li>
                  ))}
                  {errors.length > 10 && (
                    <li className="text-muted-foreground">
                      ... and {errors.length - 10} more errors
                    </li>
                  )}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Preview */}
          {preview.length > 0 && errors.length === 0 && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                <div className="font-medium mb-2">
                  Preview (showing first 5 of {preview.length} providers):
                </div>
                <div className="space-y-2 text-sm">
                  {preview.map((provider, index) => (
                    <div key={index} className="flex items-center gap-2 text-xs">
                      <FileText className="h-3 w-3" />
                      <span className="font-medium">
                        {provider.first_name} {provider.last_name}
                      </span>
                      <span className="text-muted-foreground">({provider.email})</span>
                      {provider.allowed_shifts.length > 0 && (
                        <span className="text-muted-foreground">
                          - Shifts: {provider.allowed_shifts.length === 11 ? "All Shifts" : provider.allowed_shifts.join(", ")}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleClose} disabled={isProcessing}>
              Cancel
            </Button>
            <Button
              onClick={handleImport}
              disabled={!file || errors.length > 0 || isProcessing}
            >
              {isProcessing ? "Processing..." : `Import ${preview.length} Providers`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
