import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import { TaskRClientProvider } from "./lib/client";
import { env } from "./config/env";
import { ShellProvider } from "./context/ShellContext";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <TaskRClientProvider
      config={{
        baseUrl: env.taskrApiBase,
        tenantId: env.tenantId,
        userId: env.userId
      }}
    >
      <ShellProvider>
        <App />
      </ShellProvider>
    </TaskRClientProvider>
  </React.StrictMode>
);
