import Header from './components/Header.tsx';
import Viewport from './components/Viewport.tsx';

/**
 * App shell only — composition, no 3D logic, no state yet.
 *
 * Milestone 1 adds the left view/zoom column and the right shapes panel
 * around <Viewport /> here; Milestone 5 adds design state (name, save,
 * undo) above this component. Nothing in the shell reaches into the
 * Three.js scene directly.
 */
export default function App() {
  return (
    <div className="app">
      <Header />
      <main className="app-main">
        <Viewport />
      </main>
    </div>
  );
}
