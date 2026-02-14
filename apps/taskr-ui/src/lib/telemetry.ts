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
        const occurredAt = new Date().toISOString();
        await client.request({
          path: "/analytics/events",
          method: "POST",
          body: {
            event_type: name,
            payload: properties ?? {},
            occurred_at: occurredAt
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
