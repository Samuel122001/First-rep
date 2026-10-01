// Entry point for the claude.ai artifact build.
import { render } from 'preact';
import { App } from './app.jsx';
import { init } from './store.js';
import { createClaudeBackend } from './backend/claude.js';

render(<App />, document.getElementById('app'));
createClaudeBackend().then(init);
