/*
FIT2102 Assignment 1 - Functional Reactive Programming
Name       : Lionie Annabella Wijaya 
Student ID : 31316115

This assignment implements a classic arcade game "Space Invaders" with functional reactive programming style.
It follows a general structure from FRP Asteroids code provided by Tim Dwyer in https://stackblitz.com/edit/asteroids05?file=index.ts.
Some parts in this assignment are derived from the Asteroids code and weekly tutorials from the unit.
*/

import { interval, fromEvent, merge } from "rxjs";
import { map, filter, scan } from "rxjs/operators";

type Key = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "Space";
type Event = "keydown" | "keyup";
type Direction = "right" | "left";

function spaceinvaders() {
    // Constants in the game
    const Constants = {
        CANVAS_SIZE: 600,
        START_TIME: 0,
        START_ALIENS_ROW: 5,
        START_ALIENS_COL: 10,
        START_SHIELDS: 4,
        BULLET_RADIUS: 4,
        SHIELD_RADIUS: 20,
        SHIP_RADIUS: 10,
        ALIEN_RADIUS: 10,
        ALIEN_MOVE_INTERVAL: 75,
        ALIEN_SHOOT_INTERVAL: 50,
        ALIEN_MOVE_PER_INTERVAL: 20,
        BULLET_SPEED: 3,
    } as const;

    // A simple, seedable, pseudo-random number generator (derived from FIT2102 Tutorial 4 Solution)
    class RNG {
        m = 0x80000000;
        a = 1103515245;
        c = 12345;
        state: number;
        constructor(seed: number) {
            this.state = seed ? seed : Math.floor(Math.random() * (this.m - 1));
        }
        nextInt() {
            this.state = (this.a * this.state + this.c) % this.m;
            return this.state;
        }
        nextFloat() {
            return this.nextInt() / (this.m - 1);
        }
    }
    const rng = new RNG(20),
        nextRandom = () => rng.nextFloat() * 2 - 1;

    // Types of view elements in the game
    type ViewType =
        | "ship"
        | "alien"
        | "bullet"
        | "alienbullet"
        | "shield"
        | "hole";

    // Types of game state transitions in form of classes
    // Tick enables game to continue with a timer, instance is created with time elapsed to indicate clock and a random number which is useful to spawn randomness in the game
    class Tick {
        constructor(
            public readonly elapsed: number,
            public readonly randomNumber: number
        ) {}
    }
    // Translate enables ship's movement, instance is created with either positive or negative direction to be translated from ship's previous position
    class Translate {
        constructor(public readonly direction: number) {}
    }
    // Shoot enables mechanism for ship to shoot bullet
    class Shoot {
        constructor() {}
    }
    // Restart enables player to restart game
    class Restart {
        constructor() {}
    }

    // Observables to control game play, each observable returns an instance of a game state transition defined in the previous classes with necessary arguments
    // gameClock is an observable acting as game timer, returns instance of Tick
    const gameClock = interval(15).pipe(
            map((elapsed) => new Tick(elapsed, nextRandom()))
        ),
        // keyObservable is used for observables accepting repeating keyboard presses (translate)
        keyObservable = <T>(e: Event, k: Key, result: () => T) =>
            fromEvent<KeyboardEvent>(document, e).pipe(
                filter(({ code }) => code === k),
                map(result)
            ),
        // keyObservable is used for observables accepting non repeating keyboard presses (shoot and restart)
        keyObservableNonRepeat = <T>(e: Event, k: Key, result: () => T) =>
            fromEvent<KeyboardEvent>(document, e).pipe(
                filter(({ code }) => code === k),
                filter(({ repeat }) => !repeat),
                map(result)
            ),
        // startLeftTranslation, startRightTranslation, stopLeftTranslation, stopRightTranslation are observables handling user's input to move ship, returns instance of Translate
        startLeftTranslation = keyObservable(
            "keydown",
            "ArrowLeft",
            () => new Translate(-5)
        ),
        startRightTranslation = keyObservable(
            "keydown",
            "ArrowRight",
            () => new Translate(5)
        ),
        stopLeftTranslation = keyObservable(
            "keydown",
            "ArrowLeft",
            () => new Translate(0)
        ),
        stopRightTranslation = keyObservable(
            "keydown",
            "ArrowRight",
            () => new Translate(0)
        ),
        // shoot is an observable handling user's input to shoot a bullet, returns instance of Shoot
        shoot = keyObservableNonRepeat("keydown", "ArrowUp", () => new Shoot()),
        // restart is an observable handling user's input to restart a game if possible, returns instance of Restart
        restart = keyObservableNonRepeat(
            "keydown",
            "Space",
            () => new Restart()
        );

    // Body and its properties, every object in game is a body (ship, alien, bullet, aliens' bullet, shield, and hole)
    type Body = Readonly<{
        id: string;
        viewType: ViewType;
        pos: Vec;
        size: number;
        color: string;
        createTime: number;
    }>;

    // Game state and its properties
    type State = Readonly<{
        time: number;
        nextShootTime: number;
        nextMoveTime: number;
        ship: Body;
        bullets: ReadonlyArray<Body>;
        aliens: ReadonlyArray<Body>;
        aliensDirection: Direction;
        aliensBullet: ReadonlyArray<Body>;
        shields: ReadonlyArray<Body>;
        holes: ReadonlyArray<Body>;
        exit: ReadonlyArray<Body>;
        score: number;
        level: number;
        gameOver: boolean;
        restart: boolean;
    }>;

    // Curried function to create a more detailed, composed functions for different bodies
    const createShape =
            (viewType: ViewType) =>
            (orad: number) =>
            (ocolor: string) =>
            (oid: string) =>
            (opos: Vec) =>
            (otime: number) =>
                <Body>{
                    id: viewType + oid,
                    viewType: viewType,
                    pos: opos,
                    size: orad,
                    color: ocolor,
                    createTime: otime,
                },
        // Composed functions to set properties for different bodies
        createBullet = createShape("bullet")(Constants.BULLET_RADIUS)("white"),
        createAlienBullet = createShape("alienbullet")(Constants.BULLET_RADIUS)(
            "red"
        ),
        createAliens = createShape("alien")(Constants.ALIEN_RADIUS)("pink"),
        createShields = createShape("shield")(Constants.SHIELD_RADIUS)("gray"),
        createHoles = createShape("hole")(Constants.BULLET_RADIUS * 2.5)(
            "black"
        );

    // Functions to initialize aliens, shields, and ship at start of a game
    // Creating aliens: for each row of aliens, an array containing a column number of alien is created with position based on current row and column,
    // afterwards all aliens in all rows are contatenated together into a single array
    const startAliensRow = (row: number) =>
            [...Array(Constants.START_ALIENS_COL).keys()].map((i) =>
                createAliens(String(row) + String(i))(
                    new Vec(
                        row % 2 == 0
                            ? Constants.CANVAS_SIZE / 5 + 40 * i
                            : Constants.CANVAS_SIZE / 5 + 40 * i,
                        row * 40 + 30
                    )
                )(Constants.START_TIME)
            ),
        startAliens = [...Array(Constants.START_ALIENS_ROW).keys()]
            .map((i) => startAliensRow(i))
            .reduce((acc, i) => i.concat(acc), []),
        // Creating shields: an array containing shield bodies is created with position based on array index
        startShields = [...Array(Constants.START_SHIELDS).keys()].map((i) =>
            createShields(String(i))(
                new Vec(i * 150 + 75, Constants.CANVAS_SIZE * 0.85)
            )(Constants.START_TIME)
        ),
        // Creating ship: returns a ship body with initial properties set
        createShip = () => {
            return {
                id: "ship",
                viewType: <ViewType>"ship",
                pos: new Vec(300, 570),
                size: Constants.SHIP_RADIUS,
                color: "lightblue",
                createTime: 0,
            };
        };

    // Initial game state
    const initialState: State = {
        time: 0,
        nextShootTime: Constants.ALIEN_SHOOT_INTERVAL,
        nextMoveTime: Constants.ALIEN_MOVE_INTERVAL,
        ship: createShip(),
        bullets: [],
        aliens: startAliens,
        aliensDirection: "right",
        aliensBullet: [],
        shields: startShields,
        holes: [],
        exit: [],
        score: 0,
        level: 1,
        gameOver: false,
        restart: false,
    };

    // Function to move position of a body in the game (derived from the Asteroids code)
    const moveBody = (x: number) => (y: number) => (o: Body) =>
        <Body>{
            ...o,
            pos: new Vec(o.pos.x + x, o.pos.y + y),
        };

    // Function to handle collision between bodies (bodiesCollided, elem, and except function inside are derived from the Asteroids code)
    const handleCollision = (s: State) => {
        // Check if body collide with another body
        const bodiesCollided = ([a, b]: [Body, Body]) =>
                a.pos.sub(b.pos).len() < a.size + b.size,
            // Filter an array of bodies that collides with some specific body
            checkCollide = (mainBody: Body, bodies: ReadonlyArray<Body>) =>
                bodies.filter((b: Body) => bodiesCollided([mainBody, b]))
                    .length > 0,
            // Check game status (still alive or game over) by looking for any collision between ship and bullet or aliens
            shipCollided = checkCollide(
                s.ship,
                s.aliensBullet.concat(s.aliens)
            ),
            // Filter destroyed aliens that are hit by bullet
            alienCollided = s.aliens.filter((alien) =>
                checkCollide(alien, s.bullets)
            ),
            // Filter bullet that hits alien
            bulletsCollided = s.bullets.filter((bullet) =>
                checkCollide(bullet, s.aliens)
            ),
            // Filter bullets that collides with shield and if no hole has been created for that specific position of shield, then a hole is created at position hit
            // Those bullets which hit shield where position has hole is ignored as bullet passes through hole
            allBulletsCollidingShield = s.bullets
                .concat(s.aliensBullet)
                .filter((bullet) => checkCollide(bullet, s.shields))
                .filter((bullet) => !checkCollide(bullet, s.holes)),
            makeHoles = allBulletsCollidingShield.map((bullet, index) =>
                createHoles(String(index + s.holes.length))(bullet.pos)(s.time)
            ),
            // Assuming alien is stronger than shield, filter shield and holes that collides with alien to be removed
            shieldAndHolesCollidingAlien = s.shields
                .concat(s.holes)
                .filter((body) => checkCollide(body, s.aliens));

        // Search for a body by id in an array
        const elem = (a: ReadonlyArray<Body>) => (e: Body) =>
            a.findIndex((b) => b.id === e.id) >= 0;
        // Array a except anything in b
        const except = (a: ReadonlyArray<Body>) => (b: Body[]) =>
            a.filter(not(elem(b)));

        // Returns a manipulated copy of game state with updated bodies for each type, exit, score, and game status
        // The use of except here is to filter out bodies that are supposed to stay in the game (not collided)
        // Some contatenation resulting to a new array is used to add new bodies such as the case in exit and holes
        return {
            ...s,
            bullets: except(s.bullets)(
                bulletsCollided.concat(allBulletsCollidingShield)
            ),
            aliens: except(s.aliens)(alienCollided),
            aliensBullet: except(s.aliensBullet)(allBulletsCollidingShield),
            shields: except(s.shields)(shieldAndHolesCollidingAlien),
            holes: except(s.holes)(shieldAndHolesCollidingAlien).concat(
                makeHoles
            ),
            exit: s.exit.concat(
                alienCollided,
                bulletsCollided,
                allBulletsCollidingShield,
                shieldAndHolesCollidingAlien
            ),
            score: s.score + alienCollided.length, // For each alien collided, previous score is incremented
            gameOver: s.gameOver || shipCollided, // Update game status
        };
    };

    // Game continues with game clock if no input is received from player
    const tick = (s: State, elapsed: number, randomNumber: number) => {
        // Perform several checks before continuing with usual flow of function, if any of these checks is true a manipulated copy of game state is returned accordingly
        // Player managed to kill all aliens, a manipulated copy of initial state is returned with main focus of resetting display to inital state and maintaining score with updated level
        if (s.aliens.length == 0) {
            return {
                ...initialState,
                time: elapsed,
                nextShootTime: elapsed + Constants.ALIEN_SHOOT_INTERVAL,
                nextMoveTime: elapsed + Constants.ALIEN_MOVE_INTERVAL,
                exit: s.aliensBullet.concat(s.bullets, s.holes),
                score: s.score,
                level: s.level + 1,
            };
        }
        // Player dies and asked to restart, a manipulated copy of initial state is returned with main focus of resetting display to initial state
        else if (s.gameOver && s.restart) {
            return {
                ...initialState,
                time: s.time,
                nextShootTime: s.time + Constants.ALIEN_SHOOT_INTERVAL,
                nextMoveTime: s.time + Constants.ALIEN_MOVE_INTERVAL,
                exit: s.aliensBullet.concat(s.bullets, s.holes),
            };
        }
        // Player dies, a manipulated copy of initial state is returned with main focus of updating time and timer for shoot and move action for aliens
        else if (s.gameOver) {
            return {
                ...s,
                time: elapsed,
                nextShootTime: elapsed + Constants.ALIEN_SHOOT_INTERVAL,
                nextMoveTime: elapsed + Constants.ALIEN_MOVE_INTERVAL,
            };
        }

        // If checks are done, tick function continues with the normal flow

        // Filter expired bullets that exit canvas and vice versa for active bullet
        const expired = (b: Body) =>
                b.pos.y > Constants.CANVAS_SIZE || b.pos.y < 0,
            expiredBullets: Body[] = s.bullets
                .filter(expired)
                .concat(s.aliensBullet.filter(expired)),
            activeBullets: Body[] = s.bullets.filter(not(expired)),
            activeAlienBullets: Body[] = s.aliensBullet.filter(not(expired));

        // Set aliens' new position
        const furthestAlienX =
                s.aliensDirection == "right"
                    ? s.aliens.reduce(
                          (max, alien) =>
                              alien.pos.x > max ? alien.pos.x : max,
                          0
                      )
                    : s.aliens.reduce(
                          (min, alien) =>
                              alien.pos.x < min ? alien.pos.x : min,
                          Constants.CANVAS_SIZE
                      ),
            furthestAlienY = s.aliens.reduce(
                (max, alien) => (alien.pos.x > max ? alien.pos.y : max),
                0
            ),
            // Aliens translate in x axis depending on direction
            alienMoveX =
                s.aliensDirection == "right"
                    ? Constants.ALIEN_MOVE_PER_INTERVAL
                    : -Constants.ALIEN_MOVE_PER_INTERVAL,
            // Aliens translate in y axis if wall is hit
            alienMoveY =
                furthestAlienX + alienMoveX <= 20 ||
                furthestAlienX + alienMoveX >= Constants.CANVAS_SIZE - 20
                    ? Constants.ALIEN_MOVE_PER_INTERVAL
                    : 0,
            // Direction is reversed when any alien (furthest right or left alien depending on direction) hits left or right wall
            alienDirection =
                furthestAlienX + alienMoveX <= 10
                    ? "right"
                    : furthestAlienX + alienMoveX >= Constants.CANVAS_SIZE - 10
                    ? "left"
                    : s.aliensDirection,
            // Game is over if any alien (furthest bottom alien) hits bottom wall
            alienPassShip =
                furthestAlienY + Constants.ALIEN_MOVE_PER_INTERVAL >=
                Constants.CANVAS_SIZE
                    ? true
                    : false,
            // Any aliens' movement stated above is applied only if the move interval is reached
            willMove = s.time == s.nextMoveTime ? true : false,
            // To add complexity to gameplay, aliens' moving interval is shortened when number of aliens have been reduced to some number, resulting with faster movement
            updatedAlienMoveInterval =
                s.aliens.length >
                (Constants.START_ALIENS_COL * Constants.START_ALIENS_ROW) / 2
                    ? Constants.ALIEN_MOVE_INTERVAL
                    : s.aliens.length > 1
                    ? Math.floor(Constants.ALIEN_MOVE_INTERVAL * 0.5)
                    : Math.floor(Constants.ALIEN_MOVE_INTERVAL * 0.25);

        // Using the random number argument, select a random alien and use the position to spawn a bullet
        const alienShoot = createAlienBullet(String(s.time))(
                new Vec(
                    s.aliens[
                        Math.floor(Math.abs(randomNumber) * s.aliens.length)
                    ].pos.x,
                    s.aliens[
                        Math.floor(Math.abs(randomNumber) * s.aliens.length)
                    ].pos.y + Constants.ALIEN_RADIUS
                )
            )(s.time),
            // Any alien shoots only if the shoot interval is reached
            willShoot = s.time == s.nextShootTime ? true : false;

        // Manipulated copy of state is now passed over to handle collision
        return handleCollision({
            ...s,
            bullets: activeBullets.map(moveBody(0)(-Constants.BULLET_SPEED)), // All bullet moves upward
            aliens: willMove
                ? s.aliens.map(moveBody(alienMoveX)(alienMoveY))
                : s.aliens,
            aliensDirection: alienDirection,
            aliensBullet: willShoot
                ? activeAlienBullets
                      .map(moveBody(0)(Constants.BULLET_SPEED))
                      .concat(alienShoot)
                : activeAlienBullets.map(moveBody(0)(Constants.BULLET_SPEED)), // All alien bullet moves downward
            exit: expiredBullets,
            time: elapsed,
            nextShootTime: willShoot
                ? s.nextShootTime + Constants.ALIEN_SHOOT_INTERVAL
                : s.nextShootTime, // if alien randomly shot, the next time of shooting is updated
            nextMoveTime: willMove
                ? s.nextMoveTime + updatedAlienMoveInterval
                : s.nextMoveTime, // if alien moves, the next time of movement is updated
            gameOver: alienPassShip,
            restart: false, // restart is set to false in case if player set restart to true but ship is not destroyed yet
        });
    };

    // State reducer
    const reduceState = (s: State, e: Translate | Shoot | Restart | Tick) => {
        return e instanceof Translate
            ? {
                  ...s,
                  ship: {
                      ...s.ship,
                      pos: new Vec(
                          s.ship.pos.x + e.direction - 25 < 0 ||
                          s.ship.pos.x + e.direction + 10 >
                              Constants.CANVAS_SIZE - Constants.SHIP_RADIUS
                              ? s.ship.pos.x
                              : s.ship.pos.x + e.direction,
                          s.ship.pos.y
                      ), // Ship position is updated
                  },
              }
            : e instanceof Shoot
            ? {
                  ...s,
                  bullets: s.bullets.concat([
                      createBullet(String(s.time))(
                          new Vec(
                              s.ship.pos.x,
                              s.ship.pos.y - Constants.SHIP_RADIUS
                          )
                      )(s.time),
                  ]), // Bullet spawned from ship's position is added
              }
            : e instanceof Restart
            ? {
                  ...s,
                  restart: true, // Restart value is checked together with gameOver value in next instance of Tick
              }
            : tick(s, e.elapsed, e.randomNumber);
    };

    // Update the svg scene (this function contains the side effect in the game)
    function updateView(s: State) {
        // Get id for original elements existing in html
        const svg = document.getElementById("canvas"),
            ship = document.getElementById("ship"),
            scoreBoard = document.getElementById("scoreboard"),
            level = document.getElementById("level"),
            loseText = document.getElementById("lose");

        // Function to append body as an element to SVG or update existing body using properties of each body
        const updateBodyView = (b: Body) => {
            function createBodyView() {
                const v = document.createElementNS(
                    svg.namespaceURI,
                    "ellipse"
                )!;
                attr(v, {
                    id: b.id,
                    rx: b.size,
                    ry: b.size,
                    fill: b.color,
                });
                svg.appendChild(v);
                return v;
            }
            const v = document.getElementById(b.id) || createBodyView();
            attr(v, { cx: b.pos.x, cy: b.pos.y });
        };

        // Update ship, bullets, aliens' bullets, shields, hole, scoreboard, and level
        attr(ship, { cx: String(s.ship.pos.x) });
        s.bullets.forEach(updateBodyView);
        s.aliens.forEach(updateBodyView);
        s.aliensBullet.forEach(updateBodyView);
        s.shields.forEach(updateBodyView);
        s.holes.forEach(updateBodyView);
        scoreBoard.textContent = "Score: " + s.score;
        level.textContent = "Level " + s.level;

        // Remove expired or collided bodies in SVG
        s.exit
            .map((o) => document.getElementById(o.id))
            .filter(isNotNullOrUndefined)
            .forEach((v) => {
                try {
                    svg.removeChild(v);
                } catch (e) {
                    console.log("Already removed: " + v.id);
                }
            });

        // Show game over message else stay hidden when player dies
        s.gameOver
            ? attr(loseText, { visibility: "visible" })
            : attr(loseText, { visibility: "hidden" });
    }

    // Main game stream
    const subscription = merge(
        gameClock,
        startLeftTranslation,
        startRightTranslation,
        stopLeftTranslation,
        stopRightTranslation,
        shoot,
        restart
    )
        .pipe(scan(reduceState, initialState))
        .subscribe(updateView);
}

// The following simply runs your spaceinvaders on window load.  Make sure to leave it in place.
if (typeof window != "undefined")
    window.onload = () => {
        spaceinvaders();
    };

// Utility functions
// The following utility code are derived from the Asteroids code

/**
 * A simple immutable vector class
 */
class Vec {
    constructor(public readonly x: number = 0, public readonly y: number = 0) {}
    add = (b: Vec) => new Vec(this.x + b.x, this.y + b.y);
    sub = (b: Vec) => this.add(b.scale(-1));
    len = () => Math.sqrt(this.x * this.x + this.y * this.y);
    scale = (s: number) => new Vec(this.x * s, this.y * s);
}

const /**
     * Composable not: invert boolean result of given function
     * @param f a function returning boolean
     * @param x the value that will be tested with f
     */
    not =
        <T>(f: (x: T) => boolean) =>
        (x: T) =>
            !f(x),
    /**
     * set a number of attributes on an Element at once
     * @param e the Element
     * @param o a property bag
     */
    attr = (e: Element, o: Object) => {
        for (const k in o) e.setAttribute(k, String(o[k]));
    };
/**
 * Type guard for use in filters
 * @param input something that might be null or undefined
 */
function isNotNullOrUndefined<T extends Object>(
    input: null | undefined | T
): input is T {
    return input != null;
}
