import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AdminPage } from "./admin/AdminPage";
import { App } from "./App";

const page = window.location.pathname === "/admin" ? <AdminPage /> : <App />;

createRoot(document.getElementById("root")!).render(<StrictMode>{page}</StrictMode>);
