import { ConnectionsPanel } from "@/components/settings/connections-panel";
import { RemoteSitesPanel } from "@/components/settings/remote-sites-panel";

export default function SettingsPage() {
  return (
    <div className="space-y-8 sm:space-y-10">
      <ConnectionsPanel />
      <RemoteSitesPanel />
    </div>
  );
}
