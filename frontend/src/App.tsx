import { Routes, Route, Navigate } from "react-router-dom";
import TopNav from "./components/TopNav";
import UpdateBanner from "./components/UpdateBanner";
import Launcher from "./pages/Launcher";
import Pipeline from "./pages/Pipeline";
import OpportunityForm from "./pages/OpportunityForm";
import Clients from "./pages/Clients";
import Items from "./pages/Items";
import Templates from "./pages/Templates";
import TemplateEditor from "./pages/TemplateEditor";
import Projects from "./pages/Projects";
import ProjectBoard from "./pages/ProjectBoard";
import OpportunityTemplates from "./pages/OpportunityTemplates";
import Salespeople from "./pages/Salespeople";
import Sales from "./pages/Sales";
import Suppliers from "./pages/Suppliers";
import PurchaseOrders from "./pages/PurchaseOrders";
import PurchaseOrderForm from "./pages/PurchaseOrderForm";
import Inventory from "./pages/Inventory";
import Warehouses from "./pages/Warehouses";
import StockTransfers from "./pages/StockTransfers";
import ReorderRulesPage from "./pages/ReorderRules";
import CustomPage from "./pages/CustomPage";

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <TopNav />
      <UpdateBanner />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Launcher />} />
          <Route path="/proposals" element={<Pipeline />} />
          <Route path="/proposals/:id" element={<OpportunityForm />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:id" element={<ProjectBoard />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/items" element={<Items />} />
          <Route path="/templates" element={<Templates />} />
          <Route path="/templates/:id" element={<TemplateEditor />} />
          <Route path="/opportunity-templates" element={<OpportunityTemplates />} />
          <Route path="/hr" element={<Salespeople />} />
          <Route path="/sales" element={<Sales />} />
          <Route path="/suppliers" element={<Suppliers />} />
          <Route path="/purchase-orders" element={<PurchaseOrders />} />
          <Route path="/purchase-orders/:id" element={<PurchaseOrderForm />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/warehouses" element={<Warehouses />} />
          <Route path="/stock-transfers" element={<StockTransfers />} />
          <Route path="/reorder-rules" element={<ReorderRulesPage />} />
          <Route path="/p/:slug" element={<CustomPage />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
}
