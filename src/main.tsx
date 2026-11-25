import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./style.css";
import "./design-system/tokens.css";
import "./design-system/motion.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

import "./design-system/app-shell.css";
