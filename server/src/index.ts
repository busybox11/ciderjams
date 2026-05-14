import { app } from "./app";
import { log } from "./logger";

const hostname = "0.0.0.0";
const port = Number(process.env.PORT ?? 8787);

app.listen({ port, hostname });

log.log(`listening ://${hostname}:${port}`);
