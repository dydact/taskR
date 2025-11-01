import React, { createContext, useContext, useMemo } from "react";
import {
  createTaskRClient,
  type TaskRClient as BaseTaskRClient,
  type TaskRClientConfig
} from "@dydact/taskr-api-client";

type TaskRClientConfigInput = Omit<TaskRClientConfig, "baseUrl"> & {
  baseUrl: string;
};

export type TaskRClient = BaseTaskRClient;

type TaskRClientProviderProps = {
  children: React.ReactNode;
  config: TaskRClientConfigInput;
};

const sanitizeBaseUrl = (value: string) => value.replace(/\/$/, "");

const TaskRClientContext = createContext<TaskRClient | null>(null);

export const TaskRClientProvider: React.FC<TaskRClientProviderProps> = ({ children, config }) => {
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

