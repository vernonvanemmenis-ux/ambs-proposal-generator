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
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
}
