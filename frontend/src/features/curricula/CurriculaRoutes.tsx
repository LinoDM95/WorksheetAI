import { Navigate, Route, Routes } from 'react-router-dom';
import { AutoCurriculumWizardPage } from './AutoCurriculumWizardPage';
import { CurriculumContextsPage } from './CurriculumContextsPage';
import { CurriculumContextDetailPage } from './CurriculumContextDetailPage';
import { CurriculumExtractionJobPage } from './CurriculumExtractionJobPage';
import { CurriculumSourcesPage } from './CurriculumSourcesPage';
import { CurriculumSourceDetailPage } from './CurriculumSourceDetailPage';

export function CurriculaRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="auto" replace />} />
      <Route path="auto" element={<AutoCurriculumWizardPage />} />
      <Route path="sources" element={<CurriculumSourcesPage />} />
      <Route path="sources/:id" element={<CurriculumSourceDetailPage />} />
      <Route path="jobs/:id" element={<CurriculumExtractionJobPage />} />
      <Route path="contexts" element={<CurriculumContextsPage />} />
      <Route path="contexts/:id" element={<CurriculumContextDetailPage />} />
      <Route path="*" element={<Navigate to="auto" replace />} />
    </Routes>
  );
}
