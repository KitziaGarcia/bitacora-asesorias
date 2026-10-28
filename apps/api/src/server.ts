import 'dotenv/config';
import { createApp } from './app';

const port = Number(process.env.PORT ?? 3000);
createApp().listen(port, '0.0.0.0', () => {
  console.log(`API listening on http://0.0.0.0:${port}`);
});
