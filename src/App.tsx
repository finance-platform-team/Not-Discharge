import { lazy, Suspense, useState } from 'react';
import { NotDischargedScreen } from './features/notDischarged/NotDischargedScreen';
import type { AppPage } from './features/notDischarged/components/Sidebar';

// The TMS page is only downloaded the first time someone opens it.
const TmsHandoffScreen = lazy(() =>
  import('./features/tmsHandoff/TmsHandoffScreen').then((m) => ({ default: m.TmsHandoffScreen })),
);

// The Escalation Config page too.
const EscalationConfigScreen = lazy(() =>
  import('./features/escalationConfig/EscalationConfigScreen').then((m) => ({ default: m.EscalationConfigScreen })),
);

function App() {
  const [page, setPage] = useState<AppPage>('cases');
  if (page === 'config')
    return (
      <Suspense fallback={null}>
        <EscalationConfigScreen onNavigate={setPage} />
      </Suspense>
    );
  return page === 'tms' ? (
    <Suspense fallback={null}>
      <TmsHandoffScreen onNavigate={setPage} />
    </Suspense>
  ) : (
    <NotDischargedScreen onNavigate={setPage} />
  );
}

export default App;
