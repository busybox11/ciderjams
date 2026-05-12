import { app } from "./app";

const hostname = "0.0.0.0";
const port = Number(process.env.PORT ?? 8787);

app.listen({ port, hostname });

console.log(`ciderjams ://${hostname}:${port}`);
