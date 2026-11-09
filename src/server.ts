import { createApp } from './app.ts';
import { state } from './store.ts';

const port = Number(process.env.PORT ?? 3001);

createApp(state).listen(port, () => {
  console.log(`dispatch: http://localhost:${port}`);
});
