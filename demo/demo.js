// run with: node demo.js

const PORT = 39000;

if (typeof window === 'undefined' && process && process.versions && process.versions.node) {
    const http = require('http');
    const fs = require('fs');
    const WebSocket = require('ws');
    const { parse: parseUrl } = require('url');

    const messages = [];
    // Create WebSocket server
    let wss;

    let checkIndex = 0;
    let msgId = 0;

    function getMessageId () {
        return msgId++;
    }

    function waitForMessage(id, timeout = 1000){
        return new Promise((resolve, reject) => {
            const check = () => {
                for(let i = checkIndex; i < messages.length; i++){
                    if(messages[i].id === id){
                        checkIndex = i + 1;
                        resolve(messages[i]);
                        return;
                    }
                }
                setTimeout(check, 100);
            }
            setTimeout(() => {
                reject('timeout');
            }, timeout);
            check();
        });
    }

    // Create HTTP server
    const server = http.createServer((req, res) => {
        const { url, method } = req;
        const { pathname, searchParams } = new URL(url, "http://localhost");
        
        if(pathname === '/' && method === 'GET') {
            // send demo.html in path
            res.writeHead(200, { 'Content-Type': 'text/html' });
            fs.createReadStream('./demo.html').pipe(res);
        }
        // check if websocket connected
        else if (pathname === '/connected' && method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            const connected = wss.clients.size > 0;
            res.end(JSON.stringify({ connected }));
        }
        else if (pathname === '/messages' && method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            if(searchParams.has('start')){
                const start = parseInt(searchParams.get('start'));
                res.end(JSON.stringify(messages.slice(start)));
            }else{
                res.end(JSON.stringify(messages));
            }
        } else if (pathname === '/messages' && method === 'DELETE') {
            messages.splice(0, messages.length);
            checkIndex = 0;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
        }
        else if (pathname === '/messages' && method === 'POST') {
            let body = '';
            req.on('data', (chunk) => {
                body += chunk.toString();
            });
            req.on('end', () => {
                const message = JSON.parse(body);
                messages.push(message);
                wss.clients.forEach((client) => {
                    client.send(JSON.stringify(message));
                });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            });
        } else if(pathname === '/all_ui' && method === 'GET'){
            const msg = {'type': 'get_all_ui', 'id': getMessageId()}
            messages.push(msg);
            // send msg to ws
            wss.clients.forEach((client) => {
                client.send(JSON.stringify(msg));
            });
            // wait for response_get_all_ui
            waitForMessage(msg.id, 20000).then((msg) => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(msg));
            }).catch((err) => {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err }));
            });
        } else if (pathname === '/ui' && method === 'GET'){
            const msg = {
                type: 'get_ui',
                id: getMessageId(),
                query: searchParams.get('query')
            };
            messages.push(msg);
            wss.clients.forEach((client) => {
                client.send(JSON.stringify(msg));
            });
            waitForMessage(msg.id, 20000).then((msg) => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(msg));
            }
            ).catch((err) => {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err }));
            }
            );
        } else if(pathname === '/ui' && method === 'POST'){
            let body = '';
            req.on('data', (chunk) => {
                body += chunk.toString();
            });
            req.on('end', () => {
                const msg = JSON.parse(body);
                msg.type = 'set_ui';
                msg.id = getMessageId();
                messages.push(msg);
                // send msg to ws
                wss.clients.forEach((client) => {
                    client.send(JSON.stringify(msg));
                });
                // wait for response_get_ui
                waitForMessage(msg.id, 20000).then((msg) => {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(msg));
                }).catch((err) => {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: err }));
                });
            });
        }
        else {
            res.writeHead(404);
            res.end('Not Found');
        }
    });

    wss = new WebSocket.Server({ server });

    wss.on('connection', (ws) => {
        ws.on('message', (message) => {
            const msg = JSON.parse(message);
            messages.push(msg);
            if(msg.type === 'open'){
                const reply = { type: 'reply', message: 'Hello from server!' }
                ws.send(JSON.stringify(reply));
                messages.push(reply);
            }
        });

        ws.on('close', () => {
            messages.push({ type: 'close' });
        });
    });

    // Start server
    server.listen(PORT, () => {
        console.log('Server started on http://localhost:39000');
    });
}
