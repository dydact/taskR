import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { ClaimsView } from "./ClaimsView";
import { DocsView } from "./DocsView";

type ClaimsServicesTab = "claims" | "services";

type ClaimsServicesViewProps = {
  tenantId: string;
  userId: string;
  claimsBaseUrl?: string;
  defaultTab?: ClaimsServicesTab;
};

const STORAGE_KEY = "taskr_claims_services_tab";

export const ClaimsServicesView: React.FC<ClaimsServicesViewProps> = ({
  tenantId,
  userId,
  claimsBaseUrl,
  defaultTab = "claims"
}) => {
  const [activeTab, setActiveTab] = useState<ClaimsServicesTab>(defaultTab);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "claims" || stored === "services") {
        setActiveTab(stored);
        return;
      }
    } catch {
      // Ignore storage access errors (SSR/private mode).
    }
    setActiveTab(defaultTab);
  }, [defaultTab]);

  const handleTabChange = (value: string) => {
    const nextTab: ClaimsServicesTab = value === "services" ? "services" : "claims";
    setActiveTab(nextTab);
    try {
      window.localStorage.setItem(STORAGE_KEY, nextTab);
    } catch {
      // Non-fatal if storage is unavailable.
    }
  };

  const claimsProps = useMemo(
    () => ({
      baseUrl: claimsBaseUrl,
      tenantId,
      userId
    }),
    [claimsBaseUrl, tenantId, userId]
  );

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
      <TabsList>
        <TabsTrigger value="claims">Claims</TabsTrigger>
        <TabsTrigger value="services">Service Catalogue</TabsTrigger>
      </TabsList>
      <TabsContent value="claims">
        {activeTab === "claims" ? (
          <div className="mt-4">
            <ClaimsView {...claimsProps} />
          </div>
        ) : null}
      </TabsContent>
      <TabsContent value="services">
        {activeTab === "services" ? (
          <div className="mt-4">
            <DocsView />
          </div>
        ) : null}
      </TabsContent>
    </Tabs>
  );
};

