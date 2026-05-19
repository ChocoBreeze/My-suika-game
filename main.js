const { Engine, Render, Runner, World, Bodies, Events, Composite, Body, Vector } = Matter;

const PLANETS = [
    { label: "Meteorite", radius: 18, emoji: "☄️", score: 2, color: "#95a5a6" },
    { label: "Moon", radius: 25, emoji: "🌙", score: 4, color: "#ecf0f1" },
    { label: "Mercury", radius: 32, emoji: "🌑", score: 8, color: "#bdc3c7" },
    { label: "Mars", radius: 40, emoji: "🔴", score: 16, color: "#e67e22" },
    { label: "Venus", radius: 50, emoji: "🟠", score: 32, color: "#f39c12" },
    { label: "Earth", radius: 62, emoji: "🌍", score: 64, color: "#3498db" },
    { label: "Neptune", radius: 75, emoji: "🔵", score: 128, color: "#2980b9" },
    { label: "Saturn", radius: 90, emoji: "🪐", score: 256, color: "#f1c40f" },
    { label: "Uranus", radius: 105, emoji: "💠", score: 512, color: "#a29bfe" },
    { label: "Jupiter", radius: 125, emoji: "🟤", score: 1024, color: "#d35400" },
    { label: "Sun", radius: 150, emoji: "☀️", score: 2048, color: "#f1c40f" },
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
let particles = [];
let gameOverTimer = 0; // 게임 오버 지연 타이머

/** [Sound Manager] Web Audio API를 활용한 효과음 생성 **/
const SoundManager = (() => {
    let audioCtx = null;
    let isMuted = false;
    let bgmNode = null;

    const initContext = () => {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
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
        osc.connect(gain).connect(audioCtx.destination);
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
        osc.connect(gain).connect(audioCtx.destination);
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

        noise.connect(filter).connect(gain).connect(audioCtx.destination);
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
        osc.connect(gain).connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 1);
    };

    const toggleMute = () => {
        isMuted = !isMuted;
        const icon = document.getElementById("audio-icon");
        icon.innerText = isMuted ? "🔇" : "🔊";
        if (isMuted && audioCtx) audioCtx.suspend();
        else if (audioCtx) audioCtx.resume();
        return isMuted;
    };

    return { playDrop, playMerge, playExplosion, playVortex, toggleMute, initContext };
})();

/** [Black Hole] 특수 능력 **/
let blackHoleCharges = 2;
document.getElementById("blackhole-btn").onclick = (e) => {
    if (gameOver || blackHoleCharges <= 0) return;
    
    // 화면에서 가장 작은 행성 3개 찾기
    const bodies = Composite.allBodies(world)
        .filter(b => b.planetIndex !== undefined && !b.isStatic)
        .sort((a, b) => a.planetIndex - b.planetIndex)
        .slice(0, 3);

    if (bodies.length > 0) {
        blackHoleCharges--;
        document.getElementById("blackhole-count").innerText = blackHoleCharges;
        if (blackHoleCharges === 0) e.currentTarget.style.opacity = "0.3";
        
        SoundManager.playVortex();
        shakeCanvas();
        
        bodies.forEach(body => {
            createExplosion(body.position.x, body.position.y, "#a29bfe", 10);
            World.remove(world, body);
        });
    }
    e.currentTarget.blur();
};

document.getElementById("audio-toggle").onclick = (e) => {
    SoundManager.toggleMute();
    e.currentTarget.blur();
};

const scoreValueEl = document.getElementById("score-value");
const nextPreviewEl = document.getElementById("next-preview");
const gameOverEl = document.getElementById("game-over");
const finalScoreEl = document.getElementById("final-score");

function init() {
    engine = Engine.create({ gravity: { y: 1.0 } });
    world = engine.world;

    render = Render.create({
        element: document.getElementById("game-container"),
        engine: engine,
        options: {
            width: WIDTH,
            height: HEIGHT,
            wireframes: false,
            background: "transparent",
            pixelRatio: window.devicePixelRatio
        }
    });

    Render.run(render);
    runner = Runner.create();
    Runner.run(runner, engine);

    const wallOpts = { 
        isStatic: true, 
        render: { fillStyle: "rgba(255, 255, 255, 0.05)" },
        friction: 0.1
    };

    World.add(world, [
        Bodies.rectangle(WIDTH / 2, HEIGHT + 50, WIDTH, 100, wallOpts),
        Bodies.rectangle(-25, HEIGHT / 2, 50, HEIGHT, wallOpts),
        Bodies.rectangle(WIDTH + 25, HEIGHT / 2, 50, HEIGHT, wallOpts)
    ]);

    spawnPlanet();
    updateNextPreview();

    const canvas = render.canvas;

    const handleMove = (e) => {
        if (gameOver || !currentPlanet || !isClickable) return;
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        mouseX = clientX - rect.left;
        
        const radius = PLANETS[currentPlanet.planetIndex].radius;
        mouseX = Math.max(WALL_THICKNESS + radius, Math.min(mouseX, WIDTH - WALL_THICKNESS - radius));
        
        Body.setPosition(currentPlanet, { x: mouseX, y: 70 });
    };

    const handleRelease = () => {
        if (gameOver || !currentPlanet || !isClickable) return;
        isClickable = false;
        Body.setStatic(currentPlanet, false);
        SoundManager.playDrop();
        
        setTimeout(() => {
            if (!gameOver) {
                spawnPlanet();
                isClickable = true;
            }
        }, 600);
    };

    // ... (rest of events)
    // 충돌 및 합성
    Events.on(engine, "collisionStart", (event) => {
        event.pairs.forEach((pair) => {
            const { bodyA, bodyB } = pair;
            if (bodyA.planetIndex !== undefined && bodyA.planetIndex === bodyB.planetIndex) {
                const index = bodyA.planetIndex;
                if (index === PLANETS.length - 1) { // 태양끼리 만나면 대폭발
                    createExplosion(bodyA.position.x, bodyA.position.y, "#fff", 30);
                    World.remove(world, [bodyA, bodyB]);
                    updateScore(PLANETS[index].score * 2);
                    SoundManager.playExplosion();
                    return;
                }

                const midX = (bodyA.position.x + bodyB.position.x) / 2;
                const midY = (bodyA.position.y + bodyB.position.y) / 2;

                createExplosion(midX, midY, PLANETS[index].color, 15);
                World.remove(world, [bodyA, bodyB]);
                
                const nextBody = createPlanet(midX, midY, index + 1, false);
                World.add(world, nextBody);
                updateScore(PLANETS[index + 1].score);
                shakeCanvas();
                SoundManager.playMerge(index);
            }
        });
    });

    // 커스텀 렌더링 (이모지 드로잉)
    Events.on(render, "afterRender", () => {
        const ctx = render.context;
        
        // 조준선 (심플하게 변경하여 부하 감소)
        if (isClickable && currentPlanet) {
            ctx.beginPath();
            ctx.setLineDash([5, 15]);
            ctx.moveTo(currentPlanet.position.x, 70);
            ctx.lineTo(currentPlanet.position.x, HEIGHT);
            ctx.strokeStyle = "rgba(108, 92, 231, 0.2)";
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // 데드라인 (타이머에 따라 강조)
        ctx.beginPath();
        ctx.moveTo(0, DEADLINE);
        ctx.lineTo(WIDTH, DEADLINE);
        ctx.strokeStyle = gameOverTimer > 0 ? `rgba(214, 48, 49, ${0.2 + (gameOverTimer/2000)*0.6})` : "rgba(255, 255, 255, 0.1)";
        ctx.lineWidth = gameOverTimer > 0 ? 3 : 1;
        ctx.stroke();

        // 모든 행성 바디에 이모지 및 효과 그리기
        const bodies = Composite.allBodies(world);
        bodies.forEach(body => {
            if (body.planetIndex !== undefined) {
                const planet = PLANETS[body.planetIndex];
                ctx.save();
                ctx.translate(body.position.x, body.position.y);
                ctx.rotate(body.angle);
                
                // [최적화] 복잡한 그라데이션/그림자 대신 단순 원 사용
                ctx.beginPath();
                ctx.arc(0, 0, planet.radius * 1.15, 0, Math.PI * 2);
                ctx.fillStyle = planet.color;
                ctx.globalAlpha = 0.15;
                ctx.fill();
                ctx.globalAlpha = 1.0;

                ctx.beginPath();
                ctx.arc(0, 0, planet.radius, 0, Math.PI * 2);
                ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
                ctx.lineWidth = 1;
                ctx.stroke();

                ctx.font = `${planet.radius * 1.8}px Arial`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(planet.emoji, 0, 0);
                
                ctx.restore();
            }
        });

        updateParticles(ctx);
    });

    // 게임 오버 체크 (2초 이상 머물러야 종료)
    Events.on(engine, "afterUpdate", (event) => {
        if (gameOver) return;

        let isOverLimit = false;
        const bodies = Composite.allBodies(world);
        for (let body of bodies) {
            if (body.planetIndex !== undefined && !body.isStatic && body.position.y < DEADLINE) {
                if (body.position.y > 85 && Math.abs(body.velocity.y) < 0.2) {
                    isOverLimit = true;
                    break;
                }
            }
        }

        if (isOverLimit) {
            gameOverTimer += 16.6; // 약 1프레임당 시간
            if (gameOverTimer > 2000) {
                triggerGameOver();
            }
        } else {
            gameOverTimer = 0;
        }
    });
}

function spawnPlanet() {
    currentPlanet = createPlanet(mouseX, 70, nextPlanetIndex, true);
    nextPlanetIndex = Math.floor(Math.random() * 4);
    World.add(world, currentPlanet);
    updateNextPreview();
}

function createPlanet(x, y, index, isStatic) {
    const cfg = PLANETS[index];
    const body = Bodies.circle(x, y, cfg.radius, {
        isStatic: isStatic,
        restitution: 0.3,
        friction: 0.1,
        render: { visible: false }
    });
    body.planetIndex = index;
    return body;
}

function updateScore(points) {
    score += points;
    scoreValueEl.innerText = score;
    scoreValueEl.style.transform = "scale(1.2)";
    setTimeout(() => scoreValueEl.style.transform = "scale(1)", 100);
}

function updateNextPreview() {
    nextPreviewEl.innerText = PLANETS[nextPlanetIndex].emoji;
    nextPreviewEl.style.transform = "scale(1.3)";
    setTimeout(() => nextPreviewEl.style.transform = "scale(1)", 150);
}

function triggerGameOver() {
    gameOver = true;
    finalScoreEl.innerText = score;
    gameOverEl.classList.add("show");
}

function createExplosion(x, y, color, count) {
    for (let i = 0; i < count; i++) {
        particles.push({
            x, y,
            radius: Math.random() * 4 + 2,
            color,
            vx: (Math.random() - 0.5) * 12,
            vy: (Math.random() - 0.5) * 12,
            life: 1.0
        });
    }
}

function updateParticles(ctx) {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.025;
        if (p.life <= 0) {
            particles.splice(i, 1);
            continue;
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life;
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }
}

function shakeCanvas() {
    const wrapper = document.getElementById("game-wrapper");
    wrapper.style.animation = "shake 0.2s ease-in-out";
    setTimeout(() => wrapper.style.animation = "", 200);
}

const style = document.createElement('style');
style.innerHTML = `
@keyframes shake {
    0% { transform: translate(1px, 1px); }
    20% { transform: translate(-3px, 0px); }
    40% { transform: translate(3px, 2px); }
    60% { transform: translate(-3px, 1px); }
    80% { transform: translate(3px, 1px); }
    100% { transform: translate(0px, 0px); }
}`;
document.head.appendChild(style);

init();
