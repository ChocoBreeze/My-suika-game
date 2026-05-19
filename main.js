const { Engine, Render, Runner, World, Bodies, Events, Composite, Body } = Matter;

/**
 * [과일 설정]
 * 이미지가 있다면 sprite: { texture: 'url' } 형태로 추가할 수 있습니다.
 */
const FRUITS = [
    { label: "cherry", radius: 15, color: "#F20306", score: 2, image: "" },
    { label: "strawberry", radius: 22, color: "#FF624C", score: 4, image: "" },
    { label: "grape", radius: 28, color: "#A969FF", score: 8, image: "" },
    { label: "dekopon", radius: 35, color: "#FFA135", score: 16, image: "" },
    { label: "persimmon", radius: 42, color: "#FF7401", score: 32, image: "" },
    { label: "apple", radius: 52, color: "#E01010", score: 64, image: "" },
    { label: "pear", radius: 62, color: "#FFF154", score: 128, image: "" },
    { label: "peach", radius: 72, color: "#FFAAB1", score: 256, image: "" },
    { label: "pineapple", radius: 85, color: "#FFE211", score: 512, image: "" },
    { label: "melon", radius: 100, color: "#A7E051", score: 1024, image: "" },
    { label: "watermelon", radius: 120, color: "#256214", score: 2048, image: "" },
];

const WIDTH = 450;
const HEIGHT = 700;
const WALL_THICKNESS = 25;
const DEADLINE = 150;

let engine, render, runner, world;
let currentFruit = null;
let nextFruitIndex = Math.floor(Math.random() * 3);
let isClickable = true;
let score = 0;
let gameOver = false;
let mouseX = WIDTH / 2;

// UI 요소
const scoreEl = document.getElementById("score");
const nextPreviewEl = document.getElementById("next-preview");
const gameOverScreen = document.getElementById("game-over-screen");
const finalScoreEl = document.getElementById("final-score");

function init() {
    engine = Engine.create({
        gravity: { y: 1.5 } // 약간 더 묵직한 중력
    });
    world = engine.world;

    render = Render.create({
        element: document.getElementById("game-container"),
        engine: engine,
        options: {
            width: WIDTH,
            height: HEIGHT,
            wireframes: false,
            background: "transparent", // CSS 배경 사용
            showAngleIndicator: false
        }
    });

    Render.run(render);
    runner = Runner.create();
    Runner.run(runner, engine);

    // 바닥과 벽 (모서리 둥글게 표현은 어려우므로 색상만 세련되게)
    const wallOpts = { isStatic: true, render: { fillStyle: "#E6BA8F" }, friction: 0.1 };
    const ground = Bodies.rectangle(WIDTH / 2, HEIGHT + 25, WIDTH, 100, wallOpts);
    const leftWall = Bodies.rectangle(-25, HEIGHT / 2, 100, HEIGHT, wallOpts);
    const rightWall = Bodies.rectangle(WIDTH + 25, HEIGHT / 2, 100, HEIGHT, wallOpts);
    
    World.add(world, [ground, leftWall, rightWall]);

    spawnFruit();
    updateNextPreview();

    // 입력 핸들러
    const canvas = render.canvas;
    
    const onMove = (e) => {
        if (gameOver || !currentFruit || !isClickable) return;
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        mouseX = clientX - rect.left;
        
        const radius = FRUITS[currentFruit.fruitIndex].radius;
        mouseX = Math.max(WALL_THICKNESS + radius, Math.min(mouseX, WIDTH - WALL_THICKNESS - radius));
        
        Body.setPosition(currentFruit, { x: mouseX, y: 70 });
    };

    const onClick = () => {
        if (gameOver || !currentFruit || !isClickable) return;
        
        isClickable = false;
        Body.setStatic(currentFruit, false);
        
        setTimeout(() => {
            if (!gameOver) spawnFruit();
            isClickable = true;
        }, 800);
    };

    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("touchmove", (e) => { e.preventDefault(); onMove(e); }, { passive: false });
    canvas.addEventListener("mousedown", onClick);
    canvas.addEventListener("touchend", onClick);

    // [합성 및 파티클 효과]
    Events.on(engine, "collisionStart", (event) => {
        event.pairs.forEach((pair) => {
            const { bodyA, bodyB } = pair;

            if (bodyA.fruitIndex !== undefined && bodyA.fruitIndex === bodyB.fruitIndex) {
                const index = bodyA.fruitIndex;

                if (index === FRUITS.length - 1) {
                    removeWithEffect(bodyA, bodyB);
                    updateScore(FRUITS[index].score * 2);
                    return;
                }

                const midX = (bodyA.position.x + bodyB.position.x) / 2;
                const midY = (bodyA.position.y + bodyB.position.y) / 2;

                removeWithEffect(bodyA, bodyB);
                
                const newFruit = createFruit(midX, midY, index + 1, false);
                World.add(world, newFruit);
                updateScore(FRUITS[index + 1].score);
            }
        });
    });

    // [커스텀 렌더링: 조준선 및 게임 오버 라인]
    Events.on(render, "afterRender", () => {
        const ctx = render.context;

        // 1. 조준선 (Aim Line)
        if (isClickable && currentFruit) {
            ctx.beginPath();
            ctx.setLineDash([5, 10]);
            ctx.moveTo(currentFruit.position.x, currentFruit.position.y);
            ctx.lineTo(currentFruit.position.x, HEIGHT);
            ctx.strokeStyle = "rgba(0, 0, 0, 0.15)";
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.setLineDash([]); // 대시 초기화
        }

        // 2. 게임 오버 경계선
        ctx.beginPath();
        ctx.moveTo(0, DEADLINE);
        ctx.lineTo(WIDTH, DEADLINE);
        ctx.strokeStyle = "rgba(255, 107, 107, 0.3)";
        ctx.lineWidth = 2;
        ctx.stroke();
    });

    // [게임 오버 로직]
    Events.on(engine, "afterUpdate", () => {
        if (gameOver) return;

        Composite.allBodies(world).forEach(body => {
            if (body.fruitIndex !== undefined && !body.isStatic && body.position.y < DEADLINE) {
                // 과일이 위쪽에 머무를 때 (속도가 충분히 낮을 때)
                if (body.position.y > 80 && Math.abs(body.velocity.y) < 0.2) {
                    triggerGameOver();
                }
            }
        });
    });
}

function spawnFruit() {
    const index = nextFruitIndex;
    nextFruitIndex = Math.floor(Math.random() * 4); // 0~3단계 중 랜덤
    
    currentFruit = createFruit(mouseX, 70, index, true);
    World.add(world, currentFruit);
    updateNextPreview();
}

function createFruit(x, y, index, isStatic) {
    const cfg = FRUITS[index];
    
    const options = {
        isStatic: isStatic,
        restitution: 0.4,
        friction: 0.1,
        render: {
            fillStyle: cfg.color,
        }
    };

    // 이미지 파일이 정의되어 있다면 sprite 적용
    if (cfg.image) {
        options.render.sprite = {
            texture: cfg.image,
            xScale: (cfg.radius * 2) / 100, // 원본 이미지가 100px 기준일 때
            yScale: (cfg.radius * 2) / 100
        };
    }

    const fruit = Bodies.circle(x, y, cfg.radius, options);
    fruit.fruitIndex = index;
    return fruit;
}

function removeWithEffect(bodyA, bodyB) {
    // 실제 파티클 시스템을 구현하려면 복잡하므로, 단순 제거 전 스케일 애니메이션 효과 등을 고려할 수 있음
    // 여기선 즉시 제거만 수행 (Matter.js 기본)
    World.remove(world, [bodyA, bodyB]);
}

function updateNextPreview() {
    const nextCfg = FRUITS[nextFruitIndex];
    if (nextCfg.image) {
        nextPreviewEl.style.backgroundImage = `url(${nextCfg.image})`;
        nextPreviewEl.style.backgroundColor = "transparent";
    } else {
        nextPreviewEl.style.backgroundImage = "none";
        nextPreviewEl.style.backgroundColor = nextCfg.color;
        nextPreviewEl.style.borderRadius = "50%";
    }
    nextPreviewEl.style.transform = "scale(1.2)";
    setTimeout(() => { nextPreviewEl.style.transform = "scale(1)"; }, 100);
}

function updateScore(points) {
    score += points;
    scoreEl.innerText = score;
}

function triggerGameOver() {
    gameOver = true;
    finalScoreEl.innerText = score;
    gameOverScreen.style.display = "flex";
}

init();
