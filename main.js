const { Engine, Render, Runner, World, Bodies, Events, Composite, Body } = Matter;

// 과일 정보 정의 (반지름, 색상, 점수)
const FRUITS = [
    { label: "cherry", radius: 15, color: "#F20306", score: 2 },
    { label: "strawberry", radius: 20, color: "#FF624C", score: 4 },
    { label: "grape", radius: 27, color: "#A969FF", score: 8 },
    { label: "dekopon", radius: 33, color: "#FFA135", score: 16 },
    { label: "persimmon", radius: 40, color: "#FF7401", score: 32 },
    { label: "apple", radius: 50, color: "#E01010", score: 64 },
    { label: "pear", radius: 59, color: "#FFF154", score: 128 },
    { label: "peach", radius: 70, color: "#FFAAB1", score: 256 },
    { label: "pineapple", radius: 82, color: "#FFE211", score: 512 },
    { label: "melon", radius: 95, color: "#A7E051", score: 1024 },
    { label: "watermelon", radius: 110, color: "#256214", score: 2048 },
];

const WIDTH = 450;
const HEIGHT = 700;
const WALL_THICKNESS = 20;

// 초기 상태
let engine, render, runner, world;
let currentFruit = null;
let nextFruitIndex = Math.floor(Math.random() * 3);
let isClickable = true;
let score = 0;

// UI 요소
const scoreBoard = document.getElementById("score-board");
const nextPreview = document.getElementById("next-fruit-preview");

function init() {
    engine = Engine.create();
    world = engine.world;

    render = Render.create({
        element: document.getElementById("game-container"),
        engine: engine,
        options: {
            width: WIDTH,
            height: HEIGHT,
            wireframes: false,
            background: "#FFFCE5"
        }
    });

    Render.run(render);
    runner = Runner.create();
    Runner.run(runner, engine);

    // 바닥과 벽 생성
    const ground = Bodies.rectangle(WIDTH / 2, HEIGHT - WALL_THICKNESS / 2, WIDTH, WALL_THICKNESS, { isStatic: true, render: { fillStyle: "#E6BA8F" } });
    const leftWall = Bodies.rectangle(WALL_THICKNESS / 2, HEIGHT / 2, WALL_THICKNESS, HEIGHT, { isStatic: true, render: { fillStyle: "#E6BA8F" } });
    const rightWall = Bodies.rectangle(WIDTH - WALL_THICKNESS / 2, HEIGHT / 2, WALL_THICKNESS, HEIGHT, { isStatic: true, render: { fillStyle: "#E6BA8F" } });
    
    World.add(world, [ground, leftWall, rightWall]);

    // 게임 오버 라인 시각화
    const topLine = Bodies.rectangle(WIDTH / 2, 150, WIDTH, 2, {
        isStatic: true,
        isSensor: true, // 충돌은 감지하지만 물리적 영향은 없음
        render: { fillStyle: "#FF0000", opacity: 0.3 }
    });
    World.add(world, topLine);

    spawnFruit();
    updateNextPreview();

    // 마우스/터치 이벤트
    const canvas = render.canvas;
    canvas.addEventListener("mousemove", (e) => {
        if (!currentFruit || !isClickable) return;
        const rect = canvas.getBoundingClientRect();
        let x = e.clientX - rect.left;
        
        // 범위 제한
        const radius = FRUITS[currentFruit.fruitIndex].radius;
        x = Math.max(WALL_THICKNESS + radius, Math.min(x, WIDTH - WALL_THICKNESS - radius));
        
        Body.setPosition(currentFruit, { x: x, y: 50 });
    });

    canvas.addEventListener("click", (e) => {
        if (!currentFruit || !isClickable) return;
        
        isClickable = false;
        Body.setStatic(currentFruit, false);
        
        setTimeout(() => {
            spawnFruit();
            isClickable = true;
        }, 1000);
    });

    // 충돌 감지 (합성 로직)
    Events.on(engine, "collisionStart", (event) => {
        event.pairs.forEach((pair) => {
            const bodyA = pair.bodyA;
            const bodyB = pair.bodyB;

            if (bodyA.fruitIndex !== undefined && bodyA.fruitIndex === bodyB.fruitIndex) {
                const index = bodyA.fruitIndex;

                // 마지막 단계(수박)면 둘 다 제거
                if (index === FRUITS.length - 1) {
                    World.remove(world, [bodyA, bodyB]);
                    updateScore(FRUITS[index].score * 2);
                    return;
                }

                // 두 과일의 중심점 계산
                const midX = (bodyA.position.x + bodyB.position.x) / 2;
                const midY = (bodyA.position.y + bodyB.position.y) / 2;

                World.remove(world, [bodyA, bodyB]);
                
                // 다음 단계 과일 생성
                const newFruit = createFruit(midX, midY, index + 1, false);
                World.add(world, newFruit);
                updateScore(FRUITS[index + 1].score);
            }
        });
    });

    // 게임 오버 체크
    Events.on(engine, "afterUpdate", () => {
        Composite.allBodies(world).forEach(body => {
            if (body.fruitIndex !== undefined && !body.isStatic && body.position.y < 150) {
                // 과일이 생성된 직후(y=50 부근)는 제외하기 위해 y < 150과 velocity 체크
                if (body.position.y > 60 && Math.abs(body.velocity.y) < 0.1) {
                    alert("Game Over! Score: " + score);
                    resetGame();
                }
            }
        });
    });
}

function resetGame() {
    World.clear(world);
    Engine.clear(engine);
    score = 0;
    updateScore(0);
    init();
}

function spawnFruit() {
    const index = nextFruitIndex;
    nextFruitIndex = Math.floor(Math.random() * 3); // 1~3단계 중 랜덤
    
    currentFruit = createFruit(WIDTH / 2, 50, index, true);
    World.add(world, currentFruit);
    updateNextPreview();
}

function createFruit(x, y, index, isStatic) {
    const fruitCfg = FRUITS[index];
    const fruit = Bodies.circle(x, y, fruitCfg.radius, {
        isStatic: isStatic,
        label: fruitCfg.label,
        render: { fillStyle: fruitCfg.color },
        restitution: 0.3, // 약간의 탄성
        friction: 0.1
    });
    
    fruit.fruitIndex = index;
    return fruit;
}

function updateNextPreview() {
    const nextCfg = FRUITS[nextFruitIndex];
    nextPreview.style.backgroundColor = nextCfg.color;
    nextPreview.style.width = `${nextCfg.radius * 2}px`;
    nextPreview.style.height = `${nextCfg.radius * 2}px`;
}

function updateScore(points) {
    score += points;
    scoreBoard.innerText = `Score: ${score}`;
}

init();
