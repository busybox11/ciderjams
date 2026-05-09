import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 8787);

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("ciderjams sync\n");
});

httpServer.listen(port, () => {
  console.log(`http://127.0.0.1:${port}`);
});
