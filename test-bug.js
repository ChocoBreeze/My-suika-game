const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

// Create a simple HTTP server to serve game files
const server = http.createServer((req, res) => {
    const urlPath = req.url === '/' ? '/index.html' : req.url;
    const filePath = path.join(__dirname, urlPath);
    const ext = path.extname(filePath);
    let contentType = 'text/html';
    if (ext === '.js') contentType = 'text/javascript';
    else if (ext === '.css') contentType = 'text/css';
    
    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(404);
            res.end('Not found');
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(0, '127.0.0.1', async () => {
    const port = server.address().port;
    console.log(`[TEST] Server running at http://127.0.0.1:${port}/`);
    
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        
        // Go to local server
        await page.goto(`http://127.0.0.1:${port}/`);
        
        // Wait for page to load and game to initialize
        await page.waitForSelector('canvas');
        console.log('[TEST] Game canvas loaded');

        // Let's get the canvas bounding rect
        const canvasElement = await page.$('canvas');
        const box = await canvasElement.boundingBox();
        const centerX = box.x + box.width / 2;
        const centerY = box.y + box.height / 2;

        console.log(`[TEST] Canvas box: x=${box.x}, y=${box.y}, w=${box.width}, h=${box.height}`);

        // 1. Move mouse to center of canvas
        await page.mouse.move(centerX, centerY);
        await new Promise(r => setTimeout(r, 200));

        // Get initial planet position
        let planetsBefore = await page.evaluate(() => {
            return Matter.Composite.allBodies(window.world)
                .filter(b => b.planetIndex !== undefined)
                .map(b => ({ id: b.id, y: b.position.y, isStatic: b.isStatic }));
        });
        console.log('[TEST] Planets before interaction:', planetsBefore);

        // 2. Simulate moving the mouse out of the canvas (to -100, -100)
        console.log('[TEST] Moving mouse out of canvas...');
        await page.mouse.move(0, 0);
        await new Promise(r => setTimeout(r, 200));

        // 3. Simulate blurring the window
        console.log('[TEST] Dispatching window blur event...');
        await page.evaluate(() => window.dispatchEvent(new Event('blur')));
        await new Promise(r => setTimeout(r, 500));

        // 4. Simulate focusing the window back
        console.log('[TEST] Dispatching window focus event...');
        await page.evaluate(() => window.dispatchEvent(new Event('focus')));
        await new Promise(r => setTimeout(r, 500));

        // 5. Return mouse to canvas center and click
        console.log('[TEST] Moving mouse back to canvas center and clicking...');
        await page.mouse.move(centerX, centerY);
        await page.mouse.click(centerX, centerY);

        // 6. Wait 2 seconds
        console.log('[TEST] Waiting 2 seconds for physics to process...');
        await new Promise(r => setTimeout(r, 2000));

        // 7. Check if the planet has fallen or is still stuck at the top
        let planetsAfter = await page.evaluate(() => {
            return Matter.Composite.allBodies(window.world)
                .filter(b => b.planetIndex !== undefined)
                .map(b => ({ id: b.id, y: b.position.y, isStatic: b.isStatic }));
        });
        console.log('[TEST] Planets after interaction:', planetsAfter);

        // Analyze if the planet that was at the top before the click is stuck
        const initialPlanetIds = planetsBefore.map(p => p.id);
        const stuckPlanet = planetsAfter.find(p => initialPlanetIds.includes(p.id) && p.isStatic && Math.abs(p.y - 70) < 5);
        
        if (stuckPlanet) {
            console.error('[TEST] FAIL: The dropped planet is stuck at the top! (Static at y ~ 70)');
            process.exitCode = 1;
        } else {
            console.log('[TEST] SUCCESS: The dropped planet successfully fell down!');
            process.exitCode = 0;
        }

    } catch (err) {
        console.error('[TEST] Error during test execution:', err);
        process.exitCode = 1;
    } finally {
        if (browser) {
            await browser.close();
        }
        server.close();
        console.log('[TEST] Server closed. Exit code:', process.exitCode);
        process.exit(process.exitCode);
    }
});
