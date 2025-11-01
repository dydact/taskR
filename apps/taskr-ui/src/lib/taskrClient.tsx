import React, { createContext, useContext, useMemo } from "react";
import {
  createTaskRClient,
  type TaskRClient as BaseTaskRClient,
  type TaskRClientConfig
} from "@dydact/taskr-api-client";

type TaskRClientConfigInput = TaskRClientConfig & {
  baseUrl: string;
};

const sanitizeBaseUrl = (value: string) => value.replace(/\/$/, "");

const TaskRClientContext = createContext<BaseTaskRClient | null>(null);

type TaskRClientProviderProps = {
  config: TaskRClientConfigInput;
  children: React.ReactNode;
};

export const TaskRClientProvider: React.FC<TaskRClientProviderProps> = ({ config, children }) => {
  const client = useMemo(() => {
    const { baseUrl, ...rest } = config;
    return createTaskRClient({
      ...rest,
      baseUrl: sanitizeBaseUrl(baseUrl)
    });
  }, [
    config.baseUrl,
    config.tenantId,
    config.userId,
    config.getToken,
    JSON.stringify(config.defaultHeaders ?? {})
  ]);

  return <TaskRClientContext.Provider value={client}>{children}</TaskRClientContext.Provider>;
};

export const useTaskRClient = () => {
  const ctx = useContext(TaskRClientContext);
  if (!ctx) {
    throw new Error("useTaskRClient must be used within a TaskRClientProvider");
  }
  return ctx;
};

export type TaskRClient = BaseTaskRClient;

