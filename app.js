import { io } from "https://cdn.socket.io/4.8.1/socket.io.esm.min.js";

const socket = io('wss://remote.share.zrok.io');
const trackpad = document.querySelector(".trackpad");

let startX = [];
let startY = [];
let moved = false;
const moveThreshold = 0.1;
let clickPossible = false;
const clickDelay = 50;
let twoFingerTouchStart = false;
const twoFingerMoveThreshold = 5;
let longPressTimer = null;
const longPressDuration = 500;
let isDragging = false;
let isTwoFingerGesture = false;

const sendDimensions = () => {
    socket.emit("dimensions", {
        width: trackpad.clientWidth,
        height: trackpad.clientHeight
    });
}

socket.on("connect", () => {
    console.log(socket.id);
    sendDimensions();
});

const handleTouchMove = (e) => {
    if (e.touches.length > 1) {
        isTwoFingerGesture = true;

        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }

        if (twoFingerTouchStart && e.touches.length === 2) {
            const deltaX1 = Math.abs(e.touches[0].clientX - trackpad.offsetLeft - startX[0]);
            const deltaY1 = Math.abs(e.touches[0].clientY - trackpad.offsetTop - startY[0]);
            const deltaX2 = Math.abs(e.touches[1].clientX - trackpad.offsetLeft - startX[1]);
            const deltaY2 = Math.abs(e.touches[1].clientY - trackpad.offsetTop - startY[1]);

            if (deltaX1 > twoFingerMoveThreshold || deltaY1 > twoFingerMoveThreshold ||
                deltaX2 > twoFingerMoveThreshold || deltaY2 > twoFingerMoveThreshold) {
                moved = true;
            }
        }

        return;
    }

    if (isTwoFingerGesture && e.touches.length === 1) {
        isTwoFingerGesture = false;
        startX[0] = e.touches[0].clientX - trackpad.offsetLeft;
        startY[0] = e.touches[0].clientY - trackpad.offsetTop;
        return;
    }

    const touch = e.touches[0];
    const currentX = touch.clientX - trackpad.offsetLeft;
    const currentY = touch.clientY - trackpad.offsetTop;

    const deltaX = +(currentX - startX[0]).toFixed(3);
    const deltaY = +(currentY - startY[0]).toFixed(3);

    if (Math.abs(deltaX) > moveThreshold || Math.abs(deltaY) > moveThreshold) {
        moved = true;

        if (!isDragging && longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }

        clickPossible = false;
    }

    if (isDragging) {
        socket.emit("drag", deltaX, deltaY);
    } else {
        socket.emit("movement", deltaX, deltaY);
    }

    startX[0] = currentX;
    startY[0] = currentY;
}

const handleTouchClick = (e) => {
    socket.emit("click", "left");
}

const handleTwoFingerTouchEnd = (e) => {
    if (twoFingerTouchStart && e.touches.length === 0 && !moved) {
        socket.emit("click", "right");
    }
    twoFingerTouchStart = false;
    isTwoFingerGesture = false;
};

const startDragMode = () => {
    isDragging = true;
    if ("vibrate" in navigator) {
        navigator.vibrate(100);
    }
    socket.emit("dragStart");
}

const endDragMode = () => {
    if (isDragging) {
        socket.emit("dragEnd");
        isDragging = false;
    }
}

const throttle = (callback, delay) => {
    let lastCall = 0;
    return function (...args) {
        const now = Date.now();
        if (now - lastCall >= delay) {
            lastCall = now;
            callback(...args);
        }
    };
}

const throttledMove = throttle(handleTouchMove, 8);

document.querySelectorAll('.action-button').forEach(button => {
    button.addEventListener('click', function () {
        const action = this.getAttribute('data-action');

        if (action === 'shutdown' || action === 'sleep') {
            if (!confirm(`¿Are you sure to ${action === 'shutdown' ? 'shutdown' : 'sleep'} your PC?`)) {
                return;
            }
        }

        socket.emit('media', action);

        this.classList.add('active');
        setTimeout(() => {
            this.classList.remove('active');
        }, 200);
    });
});

trackpad.addEventListener("touchmove", (e) => {
    e.preventDefault();
    throttledMove(e);
});

trackpad.addEventListener("touchstart", (e) => {
    e.preventDefault();

    // otherwise the keyboard input will be focused
    const keyboardInput = document.querySelector('.keyboard-input');
    if (keyboardInput && document.activeElement === keyboardInput) {
        keyboardInput.blur(); 
    }

    startX = [];
    startY = [];
    moved = false;
    clickPossible = false;

    for (let i = 0; i < e.touches.length; i++) {
        startX.push(e.touches[i].clientX - trackpad.offsetLeft);
        startY.push(e.touches[i].clientY - trackpad.offsetTop);
    }

    if (e.touches.length === 2) {
        twoFingerTouchStart = true;
        isTwoFingerGesture = true;

        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
    } else if (e.touches.length === 1) {
        setTimeout(() => {
            clickPossible = true;
        }, clickDelay);

        if (!isTwoFingerGesture) {
            longPressTimer = setTimeout(() => {
                if (!moved) {
                    startDragMode();
                }
                longPressTimer = null;
            }, longPressDuration);
        }
    }
});

trackpad.addEventListener("touchend", (e) => {
    e.preventDefault();

    if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
    }

    if (!moved && clickPossible && e.touches.length === 0 && !isTwoFingerGesture) {
        handleTouchClick(e);
    }

    if (twoFingerTouchStart && e.touches.length === 0) {
        handleTwoFingerTouchEnd(e);
    }

    if (e.touches.length === 0) {
        endDragMode();
        isTwoFingerGesture = false;
    }

    moved = false;
});

window.addEventListener("orientationchange", sendDimensions);

window.addEventListener("resize", () => {
    document.querySelector('.container').style.height = `${window.innerHeight}px`;
});

document.addEventListener('DOMContentLoaded', () => {
    const menuToggle = document.querySelector('#menuToggle');
    const menuPanel = document.querySelector('#menuPanel');
    const keyboardButton = document.querySelector('.circle');

    menuToggle.addEventListener('click', () => {
        menuPanel.classList.toggle('active');
    });

    keyboardButton.addEventListener('click', () => {
        if (document.body.querySelector('.keyboard-input')) {
            document.body.querySelector('.keyboard-input').focus();
            menuPanel.classList.remove('active');
            return;
        }
        let input = document.createElement('input');
        input.className = 'keyboard-input';
        input.type = 'text';
        input.style.position = 'absolute';
        input.style.opacity = '0';
        // There is no Ñ de España otherwise :)
        input.setAttribute('lang', 'es');
        input.setAttribute('accept-charset', 'UTF-8');
        document.body.appendChild(input);
        input.focus();
        menuPanel.classList.remove('active');
       
        input.addEventListener('input', (event) => {
            const currentValue = event.target.value;
            if (currentValue.length > 0) {
                const lastChar = currentValue.slice(-1);
                socket.emit('keyboard', { key: lastChar });
            }

            event.target.value = '';
        });

        input.addEventListener('keydown', (event) => {
            const { key } = event;
            if (key === 'Backspace') {
                socket.emit('keyboard', { key: key.toLowerCase() });
            }
            if(key === 'Enter') {
                socket.emit('keyboard', { key: key.toLowerCase() });
            }
        })
    });
});