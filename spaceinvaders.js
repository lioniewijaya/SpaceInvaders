"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const rxjs_1 = require("rxjs");
const operators_1 = require("rxjs/operators");
function spaceinvaders() {
    // Inside this function you will use the classes and functions
    // from rx.js
    // to add visuals to the svg element in pong.html, animate them, and make them interactive.
    // Study and complete the tasks in observable examples first to get ideas.
    // Course Notes showing Asteroids in FRP: https://tgdwyer.github.io/asteroids/
    // You will be marked on your functional programming style
    // as well as the functionality that you implement.
    // Document your code!
    // get the svg canvas element
    const svg = document.getElementById("canvas");
    // create the spaceship
    const ship = document.createElementNS(svg.namespaceURI, "rect");
    Object.entries({
        x: Number(svg.getAttribute("width")) * 0.5,
        y: Number(svg.getAttribute("height")) * 0.9,
        width: 20,
        height: 20,
        fill: "lightblue",
    }).forEach(([key, val]) => ship.setAttribute(key, String(val)));
    svg.appendChild(ship);
    // create the alien
    const alien = document.createElementNS(svg.namespaceURI, "rect");
    Object.entries({
        x: Number(svg.getAttribute("width")) * 0.5,
        y: Number(svg.getAttribute("height")) * 0.1,
        width: 20,
        height: 20,
        fill: "green",
    }).forEach(([key, val]) => alien.setAttribute(key, String(val)));
    //svg.appendChild(alien);
    function control() {
        const moveRight = rxjs_1.fromEvent(document, "keydown").pipe(operators_1.filter((keyEvent) => keyEvent.key == "ArrowRight"), operators_1.map((_) => ({ axis: "x", value: 100 })));
        const moveLeft = rxjs_1.fromEvent(document, "keydown").pipe(operators_1.filter((keyEvent) => keyEvent.key == "ArrowLeft"), operators_1.map((_) => ({ axis: "x", value: -100 })));
        const moveShip = (aV) => ship.setAttribute(aV.axis, String(aV.value + Number(ship.getAttribute(aV.axis))));
        const moves = rxjs_1.merge(moveLeft, moveRight).subscribe(moveShip);
    }
    control();
}
// the following simply runs your pong function on window load.  Make sure to leave it in place.
if (typeof window != "undefined")
    window.onload = () => {
        spaceinvaders();
    };
//# sourceMappingURL=spaceinvaders.js.map