import { SettingsForm } from "@/components/dashboard/SettingsForm";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm">
          Manage your business settings.
        </p>
      </div>
      <SettingsForm />
    </div>
  );
}
