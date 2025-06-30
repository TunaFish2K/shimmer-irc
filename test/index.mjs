import ShimmerIRC, { createNodeStreams } from "../dist/index.js";
import { createServer, Socket } from "net";

const HOST = "localhost";
const PORT = 8080;

const USERNAME = "TestUser";

function test() {
    const socket = new Socket();
    socket.connect(PORT, HOST, () => {
        console.log(`Connected to ${HOST}:${PORT}`);
    });

    const { readableStream, writableStream } = createNodeStreams(socket);
    const irc = new ShimmerIRC({
        readableStream,
        writableStream,
        username: USERNAME,
        verbose: true
    });
    irc.addEventListener("error", (e) => {
        console.error(e.detail);
        socket.end();
    });

    irc.start();
    irc.addEventListener("verified", async () => {
        console.log("ready");
        console.log(await irc.getPlayerList());
    });

    irc.addEventListener("close", () => {
        socket.end();
    });

    irc.addEventListener("stop", () => {
        socket.end();
    });

    irc.addEventListener("message", (message) => {
        console.log(`${message.detail.player} > ${message.detail.message}`);
    });
    
    process.on("beforeExit", () => {
        irc.stop();
        socket.end();
    });
}

test();