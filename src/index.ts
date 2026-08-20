import { createApp } from './http/app.js';

const port = Number(process.env.PORT ?? 3000);
const app = createApp();
app.listen(port, '0.0.0.0', (err?: Error) => {
  if (err) throw err;
  console.log(`teachspark listening on :${port}`);
});
