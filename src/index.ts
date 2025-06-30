import Stream from "stream";

const PLAYER_LIST_REGEXP = /\#playerList(\|[^\|]+)*/;
const PLAYER_JOIN_REGEXP = /\#newPlayerJoin\|[^\|]+/;
const PLAYER_LEAVE_REGEXP = /\#playerLeave\|[^\|]+/;
const CHAT_MESSAGE_REGEXP = /\#ChatMessage\|[^\|]+\|[^\|]+/;

export default class ShimmerIRC extends EventTarget {
    readableStream: ReadableStream;
    writableStream: WritableStream;

    username: string;
    verbose: boolean;
    #alive: boolean = true;

    get alive() {
        return this.#alive;
    }

    constructor({
        readableStream,
        writableStream,
        username,
        verbose,
    }: {
        username: string;
        readableStream: ReadableStream;
        writableStream: WritableStream;
        verbose: boolean;
    }) {
        super();
        this.readableStream = readableStream;
        this.writableStream = writableStream;
        this.username = username;
        this.verbose = verbose;
    }

    start() {
        const reader = this.readableStream.getReader();
        const writer = this.writableStream.getWriter();
        let data: string = "";
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();

        const socketLoop = async () => {
            while (true) {
                if (!this.#alive) {
                    reader.releaseLock();
                    writer.releaseLock();
                    break;
                }

                try {
                    const result = await reader.read();
                    if (result.done) {
                        this.#alive = false;
                        this.dispatchEvent(new Event("close"));
                        continue;
                    }
                    data += decoder.decode(result.value, {
                        stream: true,
                    });
                } catch (e) {
                    this.#alive = false;
                    this.dispatchEvent(
                        new CustomEvent<unknown>("error", { detail: e }),
                    );
                }
            }
        };

        const writeLine = async (line: string) => {
            if (!line.endsWith("\n")) line += "\n";
            await writer.write(encoder.encode(line));
            if (this.verbose && !line.includes("#CatGirl")) {
                console.log(`[Wrote] "${line.replace("\n", "\\n")}"`);
            }
        };

        const receiveLine = async (text: string) => {
            text = text.trim();

            if (this.verbose && !text.includes("#CatGirl")) {
                console.log(`[Read] "${text}"`);
            }
            if (text === "#requestUsername") {
                return await writeLine(`#Username ${this.username}\n`);
            }
            if (text === "#CatGirl") {
                return await writeLine("#CatGirl\n");
            }

            if (text === "#noVerify") {
                this.dispatchEvent(new Event("noVerify"));
            }

            if (PLAYER_LIST_REGEXP.test(text)) {
                this.dispatchEvent(
                    new CustomEvent("playerList", {
                        detail: text.split("|").slice(1),
                    }),
                );
            }

            if (PLAYER_JOIN_REGEXP.test(text)) {
                const name = text.split("|")[1];
                if (name === this.username)
                    this.dispatchEvent(new Event("verified"));
                return this.dispatchEvent(
                    new CustomEvent("playerJoin", {
                        detail: name,
                    }),
                );
            }

            if (PLAYER_LEAVE_REGEXP.test(text)) {
                return this.dispatchEvent(
                    new CustomEvent("playerLeave", {
                        detail: text.split("|")[1],
                    }),
                );
            }

            if (CHAT_MESSAGE_REGEXP.test(text)) {
                const [_, player, message] = text.split("|");
                return this.dispatchEvent(
                    new CustomEvent("message", {
                        detail: {
                            player,
                            message,
                        },
                    }),
                );
            }
        };

        socketLoop();
        const handleInterval = setInterval(async () => {
            try {
                const newLine = data.indexOf("\n");
                if (newLine === -1) return;
                const line = data.slice(0, newLine);
                data = data.slice(newLine + 1);
                await receiveLine(line);
            } catch (e) {
                console.error(e);
                this.#alive = false;
                this.dispatchEvent(
                    new CustomEvent<unknown>("error", { detail: e }),
                );
                clearInterval(handleInterval);
            }
        }, 50);

        const sendInterval = setInterval(async () => {
            try {
                const toSend = this.messages.shift();
                toSend && (await writeLine(toSend));
            } catch (e) {
                console.error(e);
                this.#alive = false;
                this.dispatchEvent(
                    new CustomEvent<unknown>("error", { detail: e }),
                );
                clearInterval(sendInterval);
            }
        }, 50);
    }

    messages: string[] = [];

    getPlayerList() {
        return new Promise((resolve, reject) => {
            this.sendMessage("#requestPlayerList");
            this.addEventListener("playerList", (data) => {
                resolve((data as unknown as {detail: string[]}).detail);
            }, {
                once: true,
            });
        });
    }

    sendMessage(text: string) {
        if (!text.endsWith("\n")) text = text + "\n";
        this.messages.push(text);
    }

    stop() {
        this.dispatchEvent(new Event("stop"));
        this.#alive = false;
    }
}

export function createNodeStreams(stream: Stream.Duplex) {
    return {
        readableStream: new ReadableStream({
            start(controller) {
                stream.on("data", (chunk) => {
                    controller.enqueue(chunk);
                });
                stream.on("close", () => {
                    try {
                        controller.close();
                    } catch (ignored) {}
                });
                stream.on("end", () => {
                    try {
                        controller.close();
                    } catch (ignored) {}
                });
                stream.on("error", (e) => {
                    controller.error(e);
                });
            },
        }),
        writableStream: new WritableStream({
            write(chunk, controller) {
                stream.write(chunk, (e) => {
                    if (e !== null) {
                        controller.error(e);
                    }
                });
            },
        }),
    };
}
