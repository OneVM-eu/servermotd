const net = require('net');

// Server info
const motd = `\u00a74\u00a7lThis server is offline! \u00a74\u2639\u00a7r\n\u00a72\u00a7lThis server is hosted by \u00a7bOneVM.eu \u00a74\u2764`;
const protocolVersion = 765; // Minecraft 1.20.1
const versionName = '\u00a74\ud83d\udee1 Offline';
const playerCount = 0;
const maxPlayers = 0;
const startPort = 25565;
const endPort = 25565; // You can expand this range if needed
const backendHost = '0.0.0.0';
const backendTimeout = 1000;

// Helper to encode VarInt
function writeVarInt(value) {
    const bytes = [];
    do {
        let temp = value & 0b01111111;
        value >>>= 7;
        if (value !== 0) temp |= 0b10000000;
        bytes.push(temp);
    } while (value !== 0);
    return Buffer.from(bytes);
}

// Check if backend is online
function isBackendOnline(port, callback) {
    const testSocket = net.createConnection({ host: backendHost, port }, () => {
        testSocket.destroy();
        callback(true);
    });
    testSocket.on('error', () => callback(false));
    testSocket.setTimeout(backendTimeout, () => {
        testSocket.destroy();
        callback(false);
    });
}

// Create server for each port
function createPingServer(port) {
    const server = net.createServer((clientSocket) => {
        clientSocket.once('data', (handshake) => {
            clientSocket.once('data', (statusRequest) => {
                isBackendOnline(port, (online) => {
                    if (online) {
                        // Forward connection to backend
                        const backendSocket = net.createConnection({ host: backendHost, port });
                        clientSocket.pipe(backendSocket);
                        backendSocket.pipe(clientSocket);

                        backendSocket.on('error', (err) => {
                            console.error(`Backend error on port ${port}: ${err}`);
                            clientSocket.end();
                        });
                    } else {
                        // Send custom MOTD
                        const response = {
                            version: {
                                name: versionName,
                                protocol: protocolVersion
                            },
                            players: {
                                max: maxPlayers,
                                online: playerCount,
                                sample: []
                            },
                            description: {
                                text: motd
                            }
                        };
                        const json = JSON.stringify(response);
                        const jsonBuffer = Buffer.from(json, 'utf8');
                        const packetId = writeVarInt(0x00);
                        const jsonLength = writeVarInt(jsonBuffer.length);
                        const packetData = Buffer.concat([packetId, jsonLength, jsonBuffer]);
                        const packetLength = writeVarInt(packetData.length);
                        const fullPacket = Buffer.concat([packetLength, packetData]);
                        clientSocket.write(fullPacket);

                        // Handle ping packet
                        clientSocket.once('data', (pingRequest) => {
                            if (pingRequest[0] === 0x01) {
                                const pingPayload = pingRequest.slice(1);
                                const pingResponse = Buffer.concat([
                                    writeVarInt(0x01),
                                    pingPayload
                                ]);
                                const responseLength = writeVarInt(pingResponse.length);
                                const fullPingPacket = Buffer.concat([responseLength, pingResponse]);
                                clientSocket.write(fullPingPacket);
                            }
                            clientSocket.end();
                        });
                    }
                });
            });
        });

        clientSocket.on('error', (err) => {
            console.error(`Socket error on port ${port}: ${err}`);
        });

        clientSocket.on('close', () => {
            console.log(`Connection closed on port ${port}`);
        });
    });

    server.listen(port, () => {
        console.log(`✅ Listening on port ${port}`);
    });

    server.on('error', (err) => {
        console.error(`Server error on port ${port}: ${err}`);
    });
}

// Start servers on port range
for (let port = startPort; port <= endPort; port++) {
    createPingServer(port);
}
