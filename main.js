const { Engine, Render, Runner, World, Bodies, Events, Composite, Body, Vector } = Matter;

const FRUITS = [
    { label: "cherry", radius: 15, color: "#ff7675", score: 2 },
    { label: "strawberry", radius: 22, color: "#d63031", score: 4 },
    { label: "grape", radius: 28, color: "#6c5ce7", score: 8 },
    { label: "dekopon", radius: 35, color: "#fdcb6e", score: 16 },
    { label: "persimmon", radius: 44, color: "#e17055", score: 32 },
    { label: "apple", radius: 54, color: "#d63031", score: 64 },
    { label: "pear", radius: 64, color: "#ffeaa7", score: 128 },
    { label: "peach", radius: 76, color: "#fab1a0", score: 256 },
    { label: "pineapple", radius: 90, color: "#f9ca24", score: 512 },
    { label: "melon", radius: 105, color: "#badc58", score: 1024 },
    { label: "watermelon", radius: 125, color: "#6ab04c", score: 2048 },
];

const WIDTH = 450;
const HEIGHT = 700;
const WALL_THICKNESS = 20;
const DEADLINE = 140;

let engine, render, runner, world;
let currentFruit = null;
let nextFruitIndex = Math.floor(Math.random() * 3);
let isClickable = true;
let score = 0;
let gameOver = false;
let mouseX = WIDTH / 2;
let particles = [];

// UI
const scoreValueEl = document.getElementById("score-value");
const nextPreviewEl = document.getElementById("next-preview");
const gameOverEl = document.getElementById("game-over");
const finalScoreEl = document.getElementById("final-score");

function init() {
    engine = Engine.create({ gravity: { y: 1.2 } });
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
        render: { fillStyle: "#E6BA8F" },
        friction: 0.2
    };

    World.add(world, [
        Bodies.rectangle(WIDTH / 2, HEIGHT + 50, WIDTH, 100, wallOpts), // Ground
        Bodies.rectangle(-25, HEIGHT / 2, 50, HEIGHT, wallOpts),        // Left
        Bodies.rectangle(WIDTH + 25, HEIGHT / 2, 50, HEIGHT, wallOpts)   // Right
    ]);

    spawnFruit();
    updateNextPreview();

    const canvas = render.canvas;

    const handleMove = (e) => {
        if (gameOver || !currentFruit || !isClickable) return;
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        mouseX = clientX - rect.left;
        
        const radius = FRUITS[currentFruit.fruitIndex].radius;
        mouseX = Math.max(WALL_THICKNESS + radius, Math.min(mouseX, WIDTH - WALL_THICKNESS - radius));
        
        Body.setPosition(currentFruit, { x: mouseX, y: 70 });
    };

    const handleRelease = () => {
        if (gameOver || !currentFruit || !isClickable) return;
        isClickable = false;
        Body.setStatic(currentFruit, false);
        
        setTimeout(() => {
            if (!gameOver) {
                spawnFruit();
                isClickable = true;
            }
        }, 600);
    };

    canvas.addEventListener("mousemove", handleMove);
    canvas.addEventListener("touchmove", (e) => { e.preventDefault(); handleMove(e); }, { passive: false });
    canvas.addEventListener("mousedown", handleRelease);
    canvas.addEventListener("touchend", (e) => { e.preventDefault(); handleRelease(); }, { passive: false });

    // 합성 및 이펙트
    Events.on(engine, "collisionStart", (event) => {
        event.pairs.forEach((pair) => {
            const { bodyA, bodyB } = pair;
            if (bodyA.fruitIndex !== undefined && bodyA.fruitIndex === bodyB.fruitIndex) {
                const index = bodyA.fruitIndex;
                if (index === FRUITS.length - 1) {
                    createExplosion(bodyA.position.x, bodyA.position.y, FRUITS[index].color);
                    World.remove(world, [bodyA, bodyB]);
                    updateScore(FRUITS[index].score * 2);
                    return;
                }

                const midX = (bodyA.position.x + bodyB.position.x) / 2;
                const midY = (bodyA.position.y + bodyB.position.y) / 2;

                createExplosion(midX, midY, FRUITS[index].color);
                World.remove(world, [bodyA, bodyB]);
                
                const newFruit = createFruit(midX, midY, index + 1, false);
                World.add(world, newFruit);
                updateScore(FRUITS[index + 1].score);
                
                // 화면 흔들림 효과
                shakeCanvas();
            }
        });
    });

    // 커스텀 렌더링 (파티클, 조준선)
    Events.on(render, "afterRender", () => {
        const ctx = render.context;
        
        // 1. 조준선 (Gradient)
        if (isClickable && currentFruit) {
            const grad = ctx.createLinearGradient(0, 70, 0, HEIGHT);
            grad.addColorStop(0, "rgba(255, 118, 117, 0.4)");
            grad.addColorStop(1, "rgba(255, 118, 117, 0)");
            
            ctx.beginPath();
            ctx.setLineDash([8, 12]);
            ctx.moveTo(currentFruit.position.x, 70);
            ctx.lineTo(currentFruit.position.x, HEIGHT);
            ctx.strokeStyle = grad;
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // 2. 데드라인 (위험 표시)
        ctx.beginPath();
        ctx.moveTo(0, DEADLINE);
        ctx.lineTo(WIDTH, DEADLINE);
        ctx.strokeStyle = "rgba(214, 48, 49, 0.2)";
        ctx.lineWidth = 2;
        ctx.stroke();

        // 3. 파티클 업데이트 및 드로잉
        updateParticles(ctx);
    });

    // 게임 오버 체크
    Events.on(engine, "afterUpdate", () => {
        if (gameOver) return;
        Composite.allBodies(world).forEach(body => {
            if (body.fruitIndex !== undefined && !body.isStatic && body.position.y < DEADLINE) {
                if (body.position.y > 80 && Math.abs(body.velocity.y) < 0.1) {
                    triggerGameOver();
                }
            }
        });
    });
}

function spawnFruit() {
    currentFruit = createFruit(mouseX, 70, nextFruitIndex, true);
    nextFruitIndex = Math.floor(Math.random() * 4); // 더 큰 과일 등장 확률 높임
    World.add(world, currentFruit);
    updateNextPreview();
}

function createFruit(x, y, index, isStatic) {
    const cfg = FRUITS[index];
    const fruit = Bodies.circle(x, y, cfg.radius, {
        isStatic: isStatic,
        restitution: 0.3,
        friction: 0.1,
        render: {
            fillStyle: cfg.color,
            strokeStyle: "rgba(255,255,255,0.3)",
            lineWidth: 4
        }
    });
    fruit.fruitIndex = index;
    return fruit;
}

function updateScore(points) {
    score += points;
    scoreValueEl.innerText = score;
    // 점수 오를 때 스케일 효과
    scoreValueEl.style.transform = "scale(1.2)";
    setTimeout(() => scoreValueEl.style.transform = "scale(1)", 100);
}

function updateNextPreview() {
    const nextCfg = FRUITS[nextFruitIndex];
    nextPreviewEl.style.backgroundColor = nextCfg.color;
    nextPreviewEl.style.borderRadius = "50%";
    nextPreviewEl.style.transform = "scale(1.2)";
    setTimeout(() => nextPreviewEl.style.transform = "scale(1)", 150);
}

function triggerGameOver() {
    gameOver = true;
    finalScoreEl.innerText = score;
    gameOverEl.classList.add("show");
}

/** 파티클 시스템 **/
function createExplosion(x, y, color) {
    for (let i = 0; i < 15; i++) {
        particles.push({
            x, y,
            radius: Math.random() * 5 + 2,
            color,
            vx: (Math.random() - 0.5) * 10,
            vy: (Math.random() - 0.5) * 10,
            life: 1.0
        });
    }
}

function updateParticles(ctx) {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.2; // 중력
        p.life -= 0.02;

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

// Shake animation 정의 추가
const style = document.createElement('style');
style.innerHTML = `
@keyframes shake {
    0% { transform: translate(1px, 1px) rotate(0deg); }
    20% { transform: translate(-3px, 0px) rotate(-1deg); }
    40% { transform: translate(3px, 2px) rotate(1deg); }
    60% { transform: translate(-3px, 1px) rotate(0deg); }
    80% { transform: translate(3px, 1px) rotate(-1deg); }
    100% { transform: translate(1px, -2px) rotate(0deg); }
}`;
document.head.appendChild(style);

init();
