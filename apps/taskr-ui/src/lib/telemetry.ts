import { useCallback } from "react";
import { useTaskRClient } from "./taskrClient";

type TelemetryPayload = {
  name: string;
  properties?: Record<string, unknown>;
};

export const useTelemetry = () => {
  const client = useTaskRClient();

  const track = useCallback(
    async ({ name, properties }: TelemetryPayload) => {
      try {
        await client.request({
          path: "/analytics/events",
          method: "POST",
          body: {
            event: name,
            properties,
            emitted_at: new Date().toISOString()
          }
        });
      } catch (err) {
        // Swallow telemetry errors to avoid impacting UX
        console.warn("Failed to emit telemetry", err);
      }
    },
    [client]
  );

  return { track };
};

