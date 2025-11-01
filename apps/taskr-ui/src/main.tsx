
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { TaskRClientProvider } from "./lib/taskrClient";
import { ShellProvider } from "./context/ShellContext";
import { env } from "./config/env";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Unable to find root element for TaskR UI");
}

createRoot(rootElement).render(
  <React.StrictMode>
    <TaskRClientProvider
      config={{
        baseUrl: env.taskrApiBase || window.location.origin,
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
