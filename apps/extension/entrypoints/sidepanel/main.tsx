import { initTheme } from "@echo-ui-kit/ui";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./style.css";

// Before render, so a dark-mode user never sees a white panel flash first.
initTheme();

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
