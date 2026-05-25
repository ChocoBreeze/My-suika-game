const { Engine, Render, Runner, World, Bodies, Events, Composite, Body, Vector, Sleeping } = Matter;

const PLANETS = [
    { label: "Asteroid", radius: 18, emoji: "🪨", score: 2, color: "#95a5a6", visualScale: 2.2 },
    { label: "Moon", radius: 25, emoji: "🌝", score: 4, color: "#ecf0f1", visualScale: 2.2 },
    { label: "Mercury", radius: 32, emoji: "🌑", score: 8, color: "#bdc3c7", visualScale: 2.15 },
    { label: "Mars", radius: 40, emoji: "🔴", score: 16, color: "#e67e22", visualScale: 2.15 },
    { label: "Venus", radius: 50, emoji: "🟠", score: 32, color: "#f39c12", visualScale: 2.15 },
    { label: "Earth", radius: 62, emoji: "🌍", score: 64, color: "#3498db", visualScale: 2.2 },
    { label: "Neptune", radius: 75, emoji: "🔵", score: 128, color: "#2980b9", visualScale: 2.15 },
    { label: "Galaxy", radius: 90, emoji: "🌀", score: 256, color: "#a29bfe", visualScale: 2.2 },
    { label: "Uranus", radius: 105, emoji: "💠", score: 512, color: "#a29bfe", visualScale: 2.15 },
    { label: "Jupiter", radius: 125, emoji: "🟤", score: 1024, color: "#d35400", visualScale: 2.15 },
    { label: "Sun", radius: 150, emoji: "☀️", score: 2048, color: "#f1c40f", visualScale: 2.3 },
];

const WIDTH = 450;
const HEIGHT = 750;
const WALL_THICKNESS = 20;
const DEADLINE = 140;

let engine, render, runner, world;
let currentPlanet = null;
let nextPlanetIndex = Math.floor(Math.random() * 3);
let isClickable = true;
let score = 0;
let gameOver = false;
let mouseX = WIDTH / 2;
let floatingTexts = [];
let gameOverTimer = 0;
let comboCount = 0;
let lastMergeTime = 0;
let bestScore = parseInt(localStorage.getItem("cosmic_best_score")) || 0;
let planetCache = {};

const MAX_PARTICLES = 150;
const particlePool = Array.from({ length: MAX_PARTICLES }, () => ({
    active: false, x: 0, y: 0, radius: 0, color: "", vx: 0, vy: 0, life: 0
}));

/** [Sound Manager] **/
const SoundManager = (() => {
    let audioCtx = null;
    let isMuted = false;
    let masterGain = null;

    const initContext = () => {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            masterGain = audioCtx.createGain();
            masterGain.gain.value = 0.5;
            masterGain.connect(audioCtx.destination);
        }
    };

    const playDrop = () => {
        if (isMuted) return;
        initContext();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.connect(gain).connect(masterGain);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
    };

    const playMerge = (index) => {
        if (isMuted) return;
        initContext();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        const freq = 200 + (index * 50);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.5, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
        osc.connect(gain).connect(masterGain);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.2);
    };

    const playExplosion = () => {
        if (isMuted) return;
        initContext();
        const bufferSize = audioCtx.sampleRate * 0.5;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = audioCtx.createBufferSource();
        noise.buffer = buffer;
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(400, audioCtx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.5);
        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
        noise.connect(filter).connect(gain).connect(masterGain);
        noise.start();
    };

    const playVortex = () => {
        if (isMuted) return;
        initContext();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(400, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 1);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1);
        osc.connect(gain).connect(masterGain);
        osc.start();
        osc.stop(audioCtx.currentTime + 1);
    };

    const setVolume = (val) => {
        initContext();
        masterGain.gain.value = val;
    };

    const toggleMute = () => {
        isMuted = !isMuted;
        document.getElementById("audio-icon").innerText = isMuted ? "🔇" : "🔊";
        return isMuted;
    };

    return { playDrop, playMerge, playExplosion, playVortex, setVolume, toggleMute };
})();

/** [UI Hookup] **/
const scoreValueEl = document.getElementById("score-value");
const bestValueEl = document.getElementById("best-value");
const nextPreviewEl = document.getElementById("next-preview");
const gameOverEl = document.getElementById("game-over");
const finalScoreEl = document.getElementById("final-score");
const blackHoleCountEl = document.getElementById("blackhole-count");

bestValueEl.innerText = bestScore;

document.getElementById("audio-toggle").onclick = () => SoundManager.toggleMute();
document.getElementById("volume-slider").oninput = (e) => SoundManager.setVolume(e.target.value);
document.getElementById("help-btn").onclick = () => document.getElementById("help-modal").classList.add("show");

let blackHoleCharges = 2;
document.getElementById("blackhole-btn").onclick = (e) => {
    if (gameOver || blackHoleCharges <= 0) return;
    const bodies = Composite.allBodies(world)
        .filter(b => b.planetIndex !== undefined && !b.isStatic)
        .sort((a, b) => a.planetIndex - b.planetIndex)
        .slice(0, 3);
    if (bodies.length > 0) {
        blackHoleCharges--;
        blackHoleCountEl.innerText = blackHoleCharges;
        if (blackHoleCharges === 0) e.currentTarget.style.opacity = "0.3";
        SoundManager.playVortex();
        shakeCanvas();
        bodies.forEach(body => {
            createExplosion(body.position.x, body.position.y, "#a29bfe", 5);
            World.remove(world, body);
        });
    }
};

function init() {
    engine = Engine.create({ 
        gravity: { y: 1.0 },
        enableSleeping: false
    });
    world = engine.world;
    window.world = world;
    window.engine = engine;
    render = Render.create({
        element: document.getElementById("game-container"),
        engine: engine,
        options: { width: WIDTH, height: HEIGHT, wireframes: false, background: "transparent", pixelRatio: window.devicePixelRatio }
    });
    Render.run(render);
    
    preRenderPlanets();
    
    runner = Runner.create();
    Runner.run(runner, engine);

    window.addEventListener("blur", () => {
        runner.enabled = false;
    });
    window.addEventListener("focus", () => {
        runner.enabled = true;
    });

    const wallOpts = { isStatic: true, render: { fillStyle: "rgba(255, 255, 255, 0.05)" }, friction: 0.1 };
    World.add(world, [
        Bodies.rectangle(WIDTH / 2, HEIGHT + 50, WIDTH, 100, wallOpts),
        Bodies.rectangle(-25, HEIGHT / 2, 50, HEIGHT, wallOpts),
        Bodies.rectangle(WIDTH + 25, HEIGHT / 2, 50, HEIGHT, wallOpts)
    ]);

    spawnPlanet();
    updateNextPreview();

    const canvas = render.canvas;
    const handleMove = (e) => {
        if (gameOver || !currentPlanet || !isClickable || !runner.enabled) return;
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        mouseX = clientX - rect.left;
        const radius = PLANETS[currentPlanet.planetIndex].radius;
        mouseX = Math.max(WALL_THICKNESS + radius, Math.min(mouseX, WIDTH - WALL_THICKNESS - radius));
        Body.setPosition(currentPlanet, { x: mouseX, y: 70 });
    };
    const handleRelease = () => {
        if (gameOver || !currentPlanet || !isClickable || !runner.enabled) return;
        isClickable = false;
        Body.setStatic(currentPlanet, false);
        Body.setDensity(currentPlanet, 0.001);
        Sleeping.set(currentPlanet, false);
        SoundManager.playDrop();
        setTimeout(() => { if (!gameOver) spawnPlanet(); isClickable = true; }, 600);
    };

    canvas.addEventListener("mousemove", handleMove);
    canvas.addEventListener("touchmove", (e) => { e.preventDefault(); handleMove(e); }, { passive: false });
    canvas.addEventListener("mousedown", handleRelease);
    canvas.addEventListener("touchend", (e) => { e.preventDefault(); handleRelease(); }, { passive: false });

    Events.on(engine, "collisionStart", (event) => {
        event.pairs.forEach((pair) => {
            const { bodyA, bodyB } = pair;
            if (bodyA.planetIndex !== undefined && bodyA.planetIndex === bodyB.planetIndex) {
                const index = bodyA.planetIndex;
                if (index === PLANETS.length - 1) {
                    createExplosion(bodyA.position.x, bodyA.position.y, "#fff", 15);
                    World.remove(world, [bodyA, bodyB]);
                    updateScore(PLANETS[index].score * 2, true);
                    SoundManager.playExplosion();
                    return;
                }
                const midX = (bodyA.position.x + bodyB.position.x) / 2;
                const midY = (bodyA.position.y + bodyB.position.y) / 2;
                createExplosion(midX, midY, PLANETS[index].color, 8);
                World.remove(world, [bodyA, bodyB]);
                const newPlanet = createPlanet(midX, midY, index + 1, false);
                World.add(world, newPlanet);
                unlockPlanet(index + 1);
                updateScore(PLANETS[index + 1].score, true);
                shakeCanvas();
                SoundManager.playMerge(index);
            }
        });
    });

    Events.on(render, "afterRender", () => {
        const ctx = render.context;
        if (isClickable && currentPlanet) {
            ctx.beginPath(); ctx.setLineDash([5, 15]);
            ctx.moveTo(currentPlanet.position.x, 70); ctx.lineTo(currentPlanet.position.x, HEIGHT);
            ctx.strokeStyle = "rgba(108, 92, 231, 0.2)"; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);
        }
        ctx.beginPath(); ctx.moveTo(0, DEADLINE); ctx.lineTo(WIDTH, DEADLINE);
        ctx.strokeStyle = gameOverTimer > 0 ? `rgba(214, 48, 49, ${0.2 + (gameOverTimer/2000)*0.6})` : "rgba(255, 255, 255, 0.1)";
        ctx.lineWidth = gameOverTimer > 0 ? 3 : 1; ctx.stroke();

        const dpr = window.devicePixelRatio || 1;
        Composite.allBodies(world).forEach(body => {
            if (body.planetIndex !== undefined) {
                const cache = planetCache[body.planetIndex];
                if (cache) {
                    const scale = (body.renderScale || 1.0) / dpr;
                    const w = cache.width * scale;
                    const h = cache.height * scale;
                    ctx.save();
                    ctx.translate(body.position.x, body.position.y);
                    ctx.rotate(body.angle);
                    ctx.drawImage(cache, -w / 2, -h / 2, w, h);
                    ctx.restore();
                }
            }
        });
        updateParticles(ctx);
        updateFloatingTexts(ctx);
    });

    Events.on(engine, "afterUpdate", (event) => {
        if (gameOver) return;
        let isOverLimit = false;
        Composite.allBodies(world).forEach(body => {
            if (body.planetIndex !== undefined && !body.isStatic && body.position.y < DEADLINE) {
                if (body.position.y > 85 && Math.abs(body.velocity.y) < 0.2) isOverLimit = true;
            }
        });
        if (isOverLimit) {
            gameOverTimer += 16.6;
            if (gameOverTimer > 2000) triggerGameOver();
        } else { gameOverTimer = 0; }
    });
}

function spawnPlanet() {
    currentPlanet = createPlanet(mouseX, 70, nextPlanetIndex, true);
    unlockPlanet(currentPlanet.planetIndex);
    nextPlanetIndex = Math.floor(Math.random() * 4);
    unlockPlanet(nextPlanetIndex);
    World.add(world, currentPlanet);
    updateNextPreview();
}

function unlockPlanet(index) {
    if (index >= 0 && index < PLANETS.length) {
        const el = document.getElementById(`evo-${index}`);
        if (el && !el.classList.contains("unlocked")) {
            el.classList.add("unlocked");
        }
    }
}

function createPlanet(x, y, index, isStatic) {
    const cfg = PLANETS[index];
    const body = Bodies.circle(x, y, cfg.radius, { isStatic: isStatic, restitution: 0.3, friction: 0.1, render: { visible: false } });
    body.planetIndex = index;
    body.renderScale = 0.1; 
    const animate = () => { if (body.renderScale < 1.0) { body.renderScale += 0.1; if (body.renderScale > 1.0) body.renderScale = 1.0; requestAnimationFrame(animate); } };
    animate();
    return body;
}

function updateScore(points, isMerge = false) {
    const now = Date.now();
    let finalPoints = points;
    if (isMerge) {
        if (now - lastMergeTime < 1500) { comboCount++; finalPoints = points * (1 + comboCount * 0.2); }
        else { comboCount = 0; }
        lastMergeTime = now;
    }
    score += Math.floor(finalPoints);
    scoreValueEl.innerText = score;
    scoreValueEl.style.transform = "scale(1.2)";
    setTimeout(() => scoreValueEl.style.transform = "scale(1)", 100);
    if (isMerge && comboCount > 0) createFloatingText(mouseX, 100, `Combo x${comboCount + 1}`, "#f1c40f");
    if (score > bestScore) {
        bestScore = score; bestValueEl.innerText = bestScore;
        localStorage.setItem("cosmic_best_score", bestScore);
        bestValueEl.style.transform = "scale(1.3)";
        setTimeout(() => bestValueEl.style.transform = "scale(1)", 150);
    }
}

function createFloatingText(x, y, text, color) { floatingTexts.push({ x, y, text, color, life: 1.0, vy: -2 }); }
function updateFloatingTexts(ctx) {
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        const t = floatingTexts[i]; t.y += t.vy; t.life -= 0.02;
        if (t.life <= 0) { floatingTexts.splice(i, 1); continue; }
        ctx.save(); ctx.globalAlpha = t.life; ctx.fillStyle = t.color; ctx.font = "bold 24px Arial"; ctx.textAlign = "center"; ctx.fillText(t.text, t.x, t.y); ctx.restore();
    }
}

function updateNextPreview() {
    nextPreviewEl.innerText = PLANETS[nextPlanetIndex].emoji;
    nextPreviewEl.style.transform = "scale(1.3)";
    setTimeout(() => nextPreviewEl.style.transform = "scale(1)", 150);
}

function triggerGameOver() { gameOver = true; finalScoreEl.innerText = score; gameOverEl.classList.add("show"); }
function createExplosion(x, y, color, count) {
    let spawned = 0;
    for (let i = 0; i < MAX_PARTICLES; i++) {
        const p = particlePool[i];
        if (!p.active) {
            p.active = true;
            p.x = x;
            p.y = y;
            p.radius = Math.random() * 4 + 2;
            p.color = color;
            p.vx = (Math.random() - 0.5) * 12;
            p.vy = (Math.random() - 0.5) * 12;
            p.life = 1.0;
            
            spawned++;
            if (spawned >= count) break;
        }
    }
}

function updateParticles(ctx) {
    for (let i = 0; i < MAX_PARTICLES; i++) {
        const p = particlePool[i];
        if (p.active) {
            p.x += p.vx;
            p.y += p.vy;
            p.life -= 0.025;
            if (p.life <= 0) {
                p.active = false;
                continue;
            }
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.life;
            ctx.fill();
        }
    }
    ctx.globalAlpha = 1.0;
}

function shakeCanvas() {
    const wrapper = document.getElementById("game-wrapper");
    wrapper.style.animation = "shake 0.2s ease-in-out";
    setTimeout(() => wrapper.style.animation = "", 200);
}

const style = document.createElement('style');
style.innerHTML = `@keyframes shake { 0% { transform: translate(1px, 1px); } 20% { transform: translate(-3px, 0px); } 40% { transform: translate(3px, 2px); } 60% { transform: translate(-3px, 1px); } 80% { transform: translate(3px, 1px); } 100% { transform: translate(0px, 0px); } }`;
document.head.appendChild(style);

function preRenderPlanets() {
    planetCache = {};
    const dpr = window.devicePixelRatio || 1;
    PLANETS.forEach((planet, index) => {
        const baseSize = Math.ceil(planet.radius * 3.0);
        const size = baseSize * dpr;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        
        ctx.scale(dpr, dpr);
        const center = baseSize / 2;

        ctx.beginPath();
        ctx.arc(center, center, planet.radius * 1.02, 0, Math.PI * 2);
        ctx.fillStyle = planet.color;
        ctx.globalAlpha = 0.12;
        ctx.fill();
        ctx.globalAlpha = 1.0;

        ctx.beginPath();
        ctx.arc(center, center, planet.radius, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.font = `${planet.radius * planet.visualScale}px Arial`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(planet.emoji, center, center);

        planetCache[index] = canvas;
    });
}

init();
